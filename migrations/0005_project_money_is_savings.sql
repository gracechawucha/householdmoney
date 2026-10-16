-- =====================================================================
-- Household Money — 0005: money put toward a project is SAVINGS, not spending
-- Run once in the Supabase SQL editor, then redeploy. Safe to re-run.
--
-- Older project payments had no phase and were counted as spending.
-- They become 'save' (held for the project). Anything you explicitly marked
-- 'spend' ("Spent on it") stays an expense.
-- =====================================================================
begin;

update public.transactions
   set project_phase = 'save'
 where project_id is not null and direction = 'out' and project_phase is null;

update public.rules
   set project_phase = 'save'
 where project_id is not null and project_phase is null;

-- project_totals: no-phase now counts as saved, only explicit 'spend' as spent
create or replace view public.project_totals
with (security_invoker = true) as
select
  project_id,
  coalesce(sum(amount + fee) filter (where project_phase = 'spend'), 0) as spent,
  count(*)                    filter (where project_phase = 'spend')     as tx_count,
  max(occurred_at)                                                       as last_at,
  coalesce(sum(amount)        filter (where coalesce(project_phase, 'save') = 'save'), 0) as saved,
  count(*)                    filter (where coalesce(project_phase, 'save') = 'save')     as save_count
from public.transactions
where project_id is not null and direction = 'out'
group by project_id;

commit;
