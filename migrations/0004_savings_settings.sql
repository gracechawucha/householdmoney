-- =====================================================================
-- Household Money — 0004: general savings categories + small settings table
-- Run once in the Supabase SQL editor, then redeploy. Safe to re-run.
-- =====================================================================
begin;

-- Savings categories: money set aside (emergency fund, rainy day…). Not an expense.
alter table public.categories drop constraint if exists categories_kind_check;
alter table public.categories add constraint categories_kind_check
  check (kind in ('income', 'expense', 'transfer', 'savings'));

insert into public.categories (name, kind, color, sort_order)
values ('Emergency fund', 'savings', '#2de2c0', 10)
on conflict (kind, name) do nothing;

-- A few household settings (e.g. the M-Shwari balance you already had before tracking began)
create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);
alter table public.app_settings enable row level security;
drop policy if exists "app key" on public.app_settings;
create policy "app key" on public.app_settings for all to anon, authenticated
  using (public.app_key_ok()) with check (public.app_key_ok());
grant select, insert, update, delete on public.app_settings to anon, authenticated;

commit;
