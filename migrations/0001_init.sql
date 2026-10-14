-- Household Money — initial schema
-- Run this once in the Supabase SQL editor (or `supabase db push` if you copy it into supabase/migrations).

------------------------------------------------------------------
-- 0. App key gate (no Supabase Auth: a shared key in .env is sent as a header)
------------------------------------------------------------------
create schema if not exists private;

create table if not exists private.app_config (
  key   text primary key,
  value text not null
);

revoke all on schema private from public, anon, authenticated;
revoke all on private.app_config from public, anon, authenticated;

-- true only when the request carries the header  x-app-key: <value stored in private.app_config>
create or replace function public.app_key_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select value from private.app_config where key = 'app_key')
      = (nullif(current_setting('request.headers', true), '')::json ->> 'x-app-key'),
    false
  );
$$;

revoke all on function public.app_key_ok() from public;
grant execute on function public.app_key_ok() to anon, authenticated;

------------------------------------------------------------------
-- 1. Tables
------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text not null check (kind in ('income', 'expense')),
  color       text not null default '#2de2c0',
  sort_order  int  not null default 100,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (kind, name)
);

create table public.projects (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  goal          text,
  target_amount numeric(12,2) not null default 0 check (target_amount >= 0),
  deadline      date,
  color         text not null default '#60a5fa',
  status        text not null default 'active' check (status in ('active', 'done')),
  archived      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Presets: "when the counterparty looks like X, label it Y".
create table public.rules (
  id           uuid primary key default gen_random_uuid(),
  direction    text not null check (direction in ('in', 'out')),
  match_field  text not null default 'name' check (match_field in ('name', 'phone', 'account')),
  match_type   text not null default 'equals' check (match_type in ('equals', 'contains')),
  pattern      text not null,
  particulars  text not null,
  category_id  uuid references public.categories (id),
  project_id   uuid references public.projects (id),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  check (category_id is not null or project_id is not null),
  unique (direction, match_field, match_type, pattern)
);

-- Every SMS that arrives, untouched.
create table public.raw_messages (
  id            uuid primary key default gen_random_uuid(),
  body          text not null,
  payload       jsonb,
  received_at   timestamptz not null default now(),
  parse_status  text not null default 'pending'
                check (parse_status in ('pending', 'parsed', 'duplicate', 'unparsed', 'ignored')),
  parse_error   text
);

create table public.transactions (
  id                 uuid primary key default gen_random_uuid(),
  mpesa_code         text not null unique,
  direction          text not null check (direction in ('in', 'out')),
  tx_type            text not null,
  amount             numeric(12,2) not null check (amount > 0),
  fee                numeric(12,2) not null default 0 check (fee >= 0),
  counterparty       text,
  counterparty_phone text,
  account_ref        text,
  occurred_at        timestamptz not null,
  balance_after      numeric(12,2),

  -- the two labels
  particulars        text,
  category_id        uuid references public.categories (id),
  project_id         uuid references public.projects (id),
  status             text not null default 'unlabeled' check (status in ('unlabeled', 'labeled')),
  label_source       text check (label_source in ('rule', 'manual')),
  rule_id            uuid references public.rules (id) on delete set null,
  labeled_at         timestamptz,

  raw_message_id     uuid references public.raw_messages (id) on delete set null,
  created_at         timestamptz not null default now(),

  check (status = 'unlabeled'
         or (particulars is not null and (category_id is not null or project_id is not null)))
);

create index transactions_occurred_idx   on public.transactions (occurred_at desc);
create index transactions_unlabeled_idx  on public.transactions (occurred_at desc) where status = 'unlabeled';
create index transactions_project_idx    on public.transactions (project_id) where project_id is not null;
create index raw_messages_status_idx     on public.raw_messages (parse_status, received_at desc);

------------------------------------------------------------------
-- 2. Views
------------------------------------------------------------------
-- Balance chain check: previous balance +/- this transaction should equal the new balance.
-- balance_gap <> 0 means a message was missed (or arrived out of order).
create view public.transactions_checked
with (security_invoker = true) as
select
  t.*,
  case
    when t.balance_after is null or lag(t.balance_after) over w is null then null
    else round(
      t.balance_after - (
        lag(t.balance_after) over w
        + case when t.direction = 'in' then t.amount else -(t.amount + t.fee) end
      ), 2)
  end as balance_gap
from public.transactions t
window w as (order by t.occurred_at, t.created_at, t.mpesa_code);

create view public.project_totals
with (security_invoker = true) as
select
  project_id,
  sum(amount + fee) as spent,
  count(*)          as tx_count,
  max(occurred_at)  as last_at
from public.transactions
where project_id is not null and direction = 'out'
group by project_id;

------------------------------------------------------------------
-- 3. Rules engine
------------------------------------------------------------------
create or replace function public.rule_subject(t public.transactions, f text)
returns text
language sql
immutable
as $$
  select case f
    when 'name'  then t.counterparty
    when 'phone' then t.counterparty_phone
    else t.account_ref
  end;
$$;

-- Labels every unlabeled transaction (or just p_txn) that matches an active rule.
-- Most specific rule wins: 'equals' beats 'contains', then the longer pattern.
-- Returns how many transactions were labeled.
create or replace function public.apply_rules(p_txn uuid default null)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  with matched as (
    select t.id as txn_id, r.id as rule_id, r.particulars, r.category_id, r.project_id
    from public.transactions t
    cross join lateral (
      select rr.id, rr.particulars, rr.category_id, rr.project_id
      from public.rules rr
      where rr.active
        and rr.direction = t.direction
        and public.rule_subject(t, rr.match_field) is not null
        and (
          (rr.match_type = 'equals'
             and upper(public.rule_subject(t, rr.match_field)) = upper(rr.pattern))
          or
          (rr.match_type = 'contains'
             and position(upper(rr.pattern) in upper(public.rule_subject(t, rr.match_field))) > 0)
        )
      order by (rr.match_type = 'equals') desc, length(rr.pattern) desc, rr.created_at
      limit 1
    ) r
    where t.status = 'unlabeled'
      and (p_txn is null or t.id = p_txn)
  ), upd as (
    update public.transactions t
       set particulars  = m.particulars,
           category_id  = m.category_id,
           project_id   = m.project_id,
           status       = 'labeled',
           label_source = 'rule',
           rule_id      = m.rule_id,
           labeled_at   = now()
      from matched m
     where t.id = m.txn_id
    returning 1
  )
  select count(*) into n from upd;

  return n;
end;
$$;

------------------------------------------------------------------
-- 4. Row level security — everything requires the app key header
------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['categories', 'projects', 'rules', 'raw_messages', 'transactions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "app key" on public.%I for all to anon, authenticated
         using (public.app_key_ok()) with check (public.app_key_ok())', t);
  end loop;
end $$;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

------------------------------------------------------------------
-- 5. Seed categories (there is deliberately no "Other")
------------------------------------------------------------------
insert into public.categories (name, kind, color, sort_order) values
  ('Rent',            'expense', '#f97316', 10),
  ('Utilities',       'expense', '#facc15', 20),
  ('Groceries',       'expense', '#84cc16', 30),
  ('Food & Dining',   'expense', '#fb7185', 40),
  ('Transport',       'expense', '#38bdf8', 50),
  ('Airtime & Data',  'expense', '#a78bfa', 60),
  ('Health',          'expense', '#f43f5e', 70),
  ('Education',       'expense', '#2dd4bf', 80),
  ('Clothing & Beauty','expense','#e879f9', 90),
  ('Household',       'expense', '#fb923c', 100),
  ('Family Support',  'expense', '#4ade80', 110),
  ('Entertainment',   'expense', '#818cf8', 120),
  ('Loans & Debt',    'expense', '#ef4444', 130),
  ('Giving',          'expense', '#fcd34d', 140),
  ('Salary',          'income',  '#a3e635', 10),
  ('Business',        'income',  '#2de2c0', 20),
  ('Support & Gifts', 'income',  '#4ade80', 30),
  ('Refunds',         'income',  '#22d3ee', 40),
  ('Interest & Returns','income','#fde047', 50);

-- First preset, straight from your example: anything paid to TINGG is airtime.
insert into public.rules (direction, match_field, match_type, pattern, particulars, category_id)
select 'out', 'name', 'equals', 'TINGG', 'Airtime', id
from public.categories where kind = 'expense' and name = 'Airtime & Data';

------------------------------------------------------------------
-- AFTER RUNNING THIS FILE, set your app key (same value as VITE_APP_KEY in .env):
--
--   insert into private.app_config (key, value) values ('app_key', 'pick-a-long-random-string')
--   on conflict (key) do update set value = excluded.value;
------------------------------------------------------------------
