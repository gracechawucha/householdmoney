export type Direction = 'in' | 'out'

export interface Category {
  id: string
  name: string
  /** 'transfer' = moves between your own accounts (M-Shwari): not income, not spending */
  kind: 'income' | 'expense' | 'transfer'
  color: string
  sort_order: number
  archived: boolean
}

export interface Project {
  id: string
  name: string
  goal: string | null
  target_amount: number
  deadline: string | null
  color: string
  status: 'active' | 'done'
  archived: boolean
  created_at: string
}

export interface Rule {
  id: string
  direction: Direction
  match_field: 'name' | 'phone' | 'account'
  match_type: 'equals' | 'contains'
  pattern: string
  /** '*' = any account | '' = only when there is no account | 'abc' = only that account/reference */
  account_pattern: string
  particulars: string
  category_id: string | null
  project_id: string | null
  active: boolean
  created_at: string
}

export interface Tx {
  id: string
  mpesa_code: string
  direction: Direction
  tx_type: string
  amount: number
  fee: number
  counterparty: string | null
  counterparty_phone: string | null
  account_ref: string | null
  occurred_at: string
  balance_after: number | null
  particulars: string | null
  category_id: string | null
  project_id: string | null
  status: 'unlabeled' | 'labeled'
  label_source: 'rule' | 'manual' | null
  rule_id: string | null
  labeled_at: string | null
  /** only present when read through the transactions_checked view */
  balance_gap?: number | null
}

export interface ProjectTotal {
  project_id: string
  spent: number
  tx_count: number
  last_at: string
}

export interface RawMessage {
  id: string
  body: string
  received_at: string
  parse_status: string
  parse_error: string | null
}
