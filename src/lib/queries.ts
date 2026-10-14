import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { toast } from './toast'
import type { Category, Direction, Project, ProjectTotal, RawMessage, Rule, Tx } from './types'

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normTx = (r: any): Tx => ({
  ...r,
  amount: Number(r.amount),
  fee: Number(r.fee ?? 0),
  balance_after: r.balance_after == null ? null : Number(r.balance_after),
  balance_gap: r.balance_gap == null ? null : Number(r.balance_gap),
})

/* ---------------------------------- reads --------------------------------- */

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('sort_order').order('name')
      fail(error)
      return (data ?? []) as Category[]
    },
  })
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('*').order('created_at')
      fail(error)
      return ((data ?? []) as Project[]).map((p) => ({ ...p, target_amount: Number(p.target_amount) }))
    },
  })
}

export function useRules() {
  return useQuery({
    queryKey: ['rules'],
    queryFn: async () => {
      const { data, error } = await supabase.from('rules').select('*').order('created_at', { ascending: false })
      fail(error)
      return (data ?? []) as Rule[]
    },
  })
}

export function useUnlabeled() {
  return useQuery({
    queryKey: ['unlabeled'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('status', 'unlabeled')
        .order('occurred_at', { ascending: false })
        .limit(500)
      fail(error)
      return (data ?? []).map(normTx)
    },
  })
}

export function useTxRange(fromMs: number, toMs: number) {
  const from = new Date(fromMs).toISOString()
  const to = new Date(toMs).toISOString()
  return useQuery({
    queryKey: ['tx', from, to],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions_checked')
        .select('*')
        .gte('occurred_at', from)
        .lt('occurred_at', to)
        .order('occurred_at', { ascending: true })
        .limit(5000)
      fail(error)
      return (data ?? []).map(normTx)
    },
  })
}

export function useProjectTotals() {
  return useQuery({
    queryKey: ['projectTotals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('project_totals').select('*')
      fail(error)
      const map: Record<string, ProjectTotal> = {}
      for (const r of data ?? []) {
        map[r.project_id as string] = {
          project_id: r.project_id as string,
          spent: Number(r.spent),
          tx_count: Number(r.tx_count),
          last_at: r.last_at as string,
        }
      }
      return map
    },
  })
}

export interface HistoryRow {
  direction: Direction
  counterparty: string | null
  particulars: string
  category_id: string | null
  project_id: string | null
}

/** Recently labeled transactions: feeds the "what" suggestions and prefills repeat counterparties. */
export function useHistory() {
  return useQuery({
    queryKey: ['history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('direction,counterparty,particulars,category_id,project_id')
        .eq('status', 'labeled')
        .not('particulars', 'is', null)
        .order('labeled_at', { ascending: false })
        .limit(600)
      fail(error)
      return (data ?? []) as HistoryRow[]
    },
  })
}

export function useUnreadable() {
  return useQuery({
    queryKey: ['unreadable'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('raw_messages')
        .select('id,body,received_at,parse_status,parse_error')
        .eq('parse_status', 'unparsed')
        .order('received_at', { ascending: false })
        .limit(50)
      fail(error)
      return (data ?? []) as RawMessage[]
    },
  })
}

/* -------------------------------- mutations ------------------------------- */

function useRefresh() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries()
}

export interface LabelInput {
  tx: Tx
  particulars: string
  category_id: string | null
  project_id: string | null
  remember: boolean
}

export function useLabel() {
  const qc = useQueryClient()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (v: LabelInput) => {
      const particulars = v.particulars.trim()
      const { error } = await supabase
        .from('transactions')
        .update({
          particulars,
          category_id: v.category_id,
          project_id: v.project_id,
          status: 'labeled',
          label_source: 'manual',
          rule_id: null,
          labeled_at: new Date().toISOString(),
        })
        .eq('id', v.tx.id)
      fail(error)

      let alsoLabeled = 0
      if (v.remember && v.tx.counterparty) {
        const { error: ruleErr } = await supabase.from('rules').upsert(
          {
            direction: v.tx.direction,
            match_field: 'name',
            match_type: 'equals',
            pattern: v.tx.counterparty,
            // same payee, same account: a paybill "Tithes" account is not a paybill "Rent" account
            account_pattern: (v.tx.account_ref ?? '').trim(),
            particulars,
            category_id: v.category_id,
            project_id: v.project_id,
            active: true,
          },
          { onConflict: 'direction,match_field,match_type,pattern,account_pattern' },
        )
        fail(ruleErr)
        const { data, error: applyErr } = await supabase.rpc('apply_rules')
        fail(applyErr)
        alsoLabeled = Number(data ?? 0)
      }
      return alsoLabeled
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['unlabeled'] })
      const prev = qc.getQueryData<Tx[]>(['unlabeled'])
      qc.setQueryData<Tx[]>(['unlabeled'], (old) => (old ?? []).filter((t) => t.id !== v.tx.id))
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['unlabeled'], ctx.prev)
      toast(`Couldn't save: ${e.message}`)
    },
    onSuccess: (n) => {
      if (n > 0) toast(`Also labeled ${n} matching transaction${n > 1 ? 's' : ''}`)
    },
    onSettled: () => {
      void refresh()
    },
  })
}

export function useUnlabel() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('transactions')
        .update({
          status: 'unlabeled',
          particulars: null,
          category_id: null,
          project_id: null,
          label_source: null,
          rule_id: null,
          labeled_at: null,
        })
        .eq('id', id)
      fail(error)
    },
    onSuccess: () => toast('Moved back to Labels'),
    onError: (e) => toast(`Couldn't update: ${e.message}`),
    onSettled: () => {
      void refresh()
    },
  })
}

export function useCreateCategory() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (v: { name: string; kind: Category['kind']; color: string }) => {
      const { data, error } = await supabase
        .from('categories')
        .insert({ name: v.name.trim(), kind: v.kind, color: v.color, sort_order: 200 })
        .select('*')
        .single()
      fail(error)
      return data as Category
    },
    onError: (e) => toast(e.message.includes('duplicate') ? 'That category already exists' : e.message),
    onSettled: () => {
      void refresh()
    },
  })
}

export function useUpdateCategory() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (v: { id: string; patch: Partial<Pick<Category, 'name' | 'color' | 'archived'>> }) => {
      const { error } = await supabase.from('categories').update(v.patch).eq('id', v.id)
      fail(error)
    },
    onError: (e) => toast(e.message),
    onSettled: () => {
      void refresh()
    },
  })
}

export function useCreateProject() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (v: { name: string; goal: string; target_amount: number; deadline: string; color: string }) => {
      const { error } = await supabase.from('projects').insert({
        name: v.name.trim(),
        goal: v.goal.trim() || null,
        target_amount: v.target_amount,
        deadline: v.deadline || null,
        color: v.color,
      })
      fail(error)
    },
    onSuccess: () => toast('Project created'),
    onError: (e) => toast(e.message),
    onSettled: () => {
      void refresh()
    },
  })
}

export function useUpdateProject() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (v: { id: string; patch: Partial<Omit<Project, 'id' | 'created_at'>> }) => {
      const { error } = await supabase.from('projects').update(v.patch).eq('id', v.id)
      fail(error)
    },
    onError: (e) => toast(e.message),
    onSettled: () => {
      void refresh()
    },
  })
}

export function useCreateRule() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (v: Omit<Rule, 'id' | 'created_at' | 'active'>) => {
      const { error } = await supabase.from('rules').upsert(
        { ...v, pattern: v.pattern.trim(), particulars: v.particulars.trim(), active: true },
        { onConflict: 'direction,match_field,match_type,pattern,account_pattern' },
      )
      fail(error)
      const { data, error: applyErr } = await supabase.rpc('apply_rules')
      fail(applyErr)
      return Number(data ?? 0)
    },
    onSuccess: (n) => toast(n > 0 ? `Preset saved. Labeled ${n} waiting transaction${n > 1 ? 's' : ''}` : 'Preset saved'),
    onError: (e) => toast(e.message),
    onSettled: () => {
      void refresh()
    },
  })
}

export function useUpdateRule() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (v: { id: string; patch: Partial<Pick<Rule, 'active'>> }) => {
      const { error } = await supabase.from('rules').update(v.patch).eq('id', v.id)
      fail(error)
      if (v.patch.active) {
        const { error: applyErr } = await supabase.rpc('apply_rules')
        fail(applyErr)
      }
    },
    onError: (e) => toast(e.message),
    onSettled: () => {
      void refresh()
    },
  })
}

export function useDeleteRule() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rules').delete().eq('id', id)
      fail(error)
    },
    onSuccess: () => toast('Preset removed'),
    onError: (e) => toast(e.message),
    onSettled: () => {
      void refresh()
    },
  })
}

export function useDismissRaw() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('raw_messages').update({ parse_status: 'ignored' }).eq('id', id)
      fail(error)
    },
    onSettled: () => {
      void refresh()
    },
  })
}
