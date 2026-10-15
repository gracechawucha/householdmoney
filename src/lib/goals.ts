import type { IncomeGoal } from './types'

/** The goal of a kind that applies on a date (YYYY-MM-DD): the latest one that has started. */
export function goalAt(goals: IncomeGoal[] | undefined, kind: IncomeGoal['kind'], date: string): IncomeGoal | null {
  let best: IncomeGoal | null = null
  for (const g of goals ?? []) {
    if (g.kind !== kind || g.starts_on > date) continue
    if (!best || g.starts_on > best.starts_on) best = g
  }
  return best
}
