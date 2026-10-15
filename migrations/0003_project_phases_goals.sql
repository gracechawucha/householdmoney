-- =====================================================================
-- Household Money — 0003: project phases (save / spend), income goals,
-- M-Shwari clean-up.   Run once in the Supabase SQL editor, then redeploy.
-- Safe to re-run.
-- =====================================================================
begin;

-- 1. Project phases ----------------------------------------------------
--   'save'  : money set aside for a project. Counts as SAVINGS, not an expense.
--   'spend' : money actually spent on the project. Counts as an expense and
--             draws the project's savings down.
--   null    : older project payments; treated as 'spend'.
alter table public.transactions add column if not exists project_phase text;
alter table public.rules        add column if not exists project_phase text;

alter table public.transactions drop constraint if exists transactions_project_phase_check;
alter table public.transactions add constraint transactions_project_phase_check
  check (project_phase is null or (project_phase in ('save', 'spend') and project_id is not null and direction = 'out'));

alter table public.rules drop constraint if exists rules_project_phase_check;
alter table public.rules add constraint rules_project_phase_check
  check (project_phase is null or (project_phase in ('save', 'spend') and project_id is not null));

-- project_totals: new columns go at the end so the old ones keep their place
create or replace view public.project_totals
with (security_invoker = true) as
select
  project_id,
  coalesce(sum(amount + fee) filter (where coalesce(project_phase, 'spend') = 'spend'), 0) as spent,
  count(*)                    filter (where coalesce(project_phase, 'spend') = 'spend')     as tx_count,
  max(occurred_at)                                                                          as last_at,
  coalesce(sum(amount)        filter (where project_phase = 'save'), 0)                      as saved,
  count(*)                    filter (where project_phase = 'save')                          as save_count
from public.transactions
where project_id is not null and direction = 'out'
group by project_id;

-- the rules engine now carries the phase across
create or replace function public.apply_rules(p_txn uuid default null)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  with matched as (
    select t.id as txn_id, r.id as rule_id, r.particulars, r.category_id, r.project_id, r.project_phase
    from public.transactions t
    cross join lateral (
      select rr.id, rr.particulars, rr.category_id, rr.project_id, rr.project_phase
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
        and (
          rr.account_pattern = '*'
          or (rr.account_pattern = '' and coalesce(t.account_ref, '') = '')
          or (rr.account_pattern not in ('*', '')
              and upper(coalesce(t.account_ref, '')) = upper(rr.account_pattern))
        )
      order by (rr.account_pattern <> '*') desc, (rr.match_type = 'equals') desc,
               length(rr.pattern) desc, rr.created_at
      limit 1
    ) r
    where t.status = 'unlabeled'
      and (p_txn is null or t.id = p_txn)
  ), upd as (
    update public.transactions t
       set particulars   = m.particulars,
           category_id   = m.category_id,
           project_id    = m.project_id,
           project_phase = case when m.project_id is null then null else coalesce(m.project_phase, 'spend') end,
           status        = 'labeled',
           label_source  = 'rule',
           rule_id       = m.rule_id,
           labeled_at    = now()
      from matched m
     where t.id = m.txn_id
    returning 1
  )
  select count(*) into n from upd;

  return n;
end;
$$;

-- 2. M-Shwari is a holding account, not income or spending ---------------
-- A "contains SHWARI" preset catches every wording the SMS uses.
insert into public.categories (name, kind, color, sort_order)
values ('M-Shwari', 'transfer', '#94a3b8', 10)
on conflict (kind, name) do nothing;

insert into public.rules (direction, match_field, match_type, pattern, account_pattern, particulars, category_id)
select d.direction, 'name', 'contains', 'SHWARI', '*', d.what, c.id
  from (values ('in', 'M-Shwari withdrawal'), ('out', 'M-Shwari deposit')) as d(direction, what)
 cross join public.categories c
 where c.kind = 'transfer' and c.name = 'M-Shwari'
on conflict (direction, match_field, match_type, pattern, account_pattern) do nothing;

-- label any M-Shwari moves still waiting
update public.transactions t
   set particulars  = case when t.direction = 'in' then 'M-Shwari withdrawal' else 'M-Shwari deposit' end,
       category_id  = c.id,
       status       = 'labeled',
       label_source = 'rule',
       labeled_at   = now()
  from public.categories c
 where c.kind = 'transfer' and c.name = 'M-Shwari'
   and t.status = 'unlabeled'
   and (t.tx_type = 'mshwari' or upper(coalesce(t.counterparty, '')) like '%SHWARI%');

-- 3. Income goals ---------------------------------------------------------
--   month = per-month goal, 3m = goal for a rolling 3 months, 6m = rolling 6 months.
--   A goal applies from `starts_on` (first of a month) until a newer one replaces it,
--   so changing a goal never rewrites how past months looked.
create table if not exists public.income_goals (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('month', '3m', '6m')),
  amount     numeric(12,2) not null check (amount > 0),
  starts_on  date not null,
  created_at timestamptz not null default now(),
  unique (kind, starts_on)
);

alter table public.income_goals enable row level security;
drop policy if exists "app key" on public.income_goals;
create policy "app key" on public.income_goals for all to anon, authenticated
  using (public.app_key_ok()) with check (public.app_key_ok());
grant select, insert, update, delete on public.income_goals to anon, authenticated;

commit;
