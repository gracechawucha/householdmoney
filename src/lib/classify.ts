import type { Category, Tx } from './types'

/**
 * What a transaction means for the household's money:
 *  income   – money in that is really earned/received
 *  spend    – money out that is an expense (incl. project spending)
 *  save     – money out set aside for a project (Savings, not an expense)
 *  transfer – M-Shwari: a holding account. Neither income nor spending.
 */
export type Flow = 'income' | 'spend' | 'save' | 'transfer'

export type TxLite = Pick<
  Tx,
  'id' | 'direction' | 'amount' | 'fee' | 'tx_type' | 'category_id' | 'project_id' | 'project_phase' | 'occurred_at'
> & { counterparty?: string | null }

export function isMshwari(r: { tx_type: string; counterparty?: string | null }): boolean {
  return r.tx_type === 'mshwari' || (r.counterparty ?? '').toUpperCase().includes('SHWARI')
}

export function flowOf(r: TxLite, catById: Map<string, Category>): Flow {
  if (isMshwari(r)) return 'transfer'
  if (r.category_id && catById.get(r.category_id)?.kind === 'transfer') return 'transfer'
  if (r.direction === 'in') return 'income'
  if (r.category_id && catById.get(r.category_id)?.kind === 'savings') return 'save'
  // money put toward a project is held, not spent, unless it is explicitly marked 'spend'
  if (r.project_id && r.project_phase !== 'spend') return 'save'
  return 'spend'
}

/** YYYY-MM-DD of a timestamp in East Africa Time */
export function eatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' })
}
