import { Link } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Repeat2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { money } from '@/lib/format'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

type Candidate = {
  loan_id: string; client_id: string; client_name: string; loan_number: number
  total_paid: number; total_due: number; percent_paid: number; interest_marked: boolean
}

export function Renewals() {
  const qc = useQueryClient()
  const isOnline = useOnlineStatus()

  const { data, isLoading, error } = useQuery({
    queryKey: ['renewal-candidates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('loan_renewal_candidates').select('*').order('percent_paid', { ascending: false })
      if (error) throw error
      return data as Candidate[]
    }
  })

  // Porcentaje por cuotas, no por monto (decision JC 2026-10-29): la vista trae el
  // porcentaje por monto, asi que las cuotas se cuentan aparte desde installments.
  const candidateIds = (data ?? []).map((c) => c.loan_id)
  const countsQuery = useQuery({
    queryKey: ['renewal-counts', candidateIds.join(',')],
    enabled: candidateIds.length > 0,
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('installment_details').select('loan_id, effective_status').in('loan_id', candidateIds)
      if (error) throw error
      const map = new Map<string, { total: number; paid: number }>()
      ;(rows ?? []).forEach((r: any) => {
        const e = map.get(r.loan_id) ?? { total: 0, paid: 0 }
        e.total++
        if (r.effective_status === 'paid') e.paid++
        map.set(r.loan_id, e)
      })
      return map
    }
  })
  const pctByLoan = new Map<string, string>()
  countsQuery.data?.forEach((v, k) => {
    if (v.total > 0) pctByLoan.set(k, `${Math.round((v.paid / v.total) * 100)}%`)
  })

  const markInterest = useMutation({
    mutationFn: async (loanId: string) => {
      const { error } = await supabase.rpc('mark_renewal_interest', { p_loan_id: loanId })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['renewal-candidates'] })
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="t-h1 text-content">Renovaciones</h1>
        <p className="text-sm text-content-muted">Clientes que ya llegaron al porcentaje de avance para renovar.</p>
      </div>

      {isLoading && <p className="text-sm text-content-muted">Cargando…</p>}
      {error && <p className="text-sm text-danger">No se pudo cargar el panel de renovación.</p>}
      {!isLoading && (data?.length ?? 0) === 0 && (
        <div className="glass-card px-5 py-10 text-center text-sm text-content-muted">
          Ningún préstamo ha llegado todavía a su porcentaje de renovación.
        </div>
      )}

      <div className="space-y-2">
        {data?.map((c) => (
          <div key={c.loan_id} className="glass-card flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary-dark">
                <Repeat2 size={18} />
              </div>
              <div>
                <Link to={`/prestamos/${c.loan_id}`} className="text-sm font-medium text-content hover:text-primary">
                  {c.client_name} <span className="text-content-muted">· #{c.loan_number}</span>
                </Link>
                <p className="text-xs text-content-muted">
                  {pctByLoan.get(c.loan_id) ?? '…'} pagado · RD$ {money(c.total_paid)} de RD$ {money(c.total_due)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {c.interest_marked ? (
                <span className="badge-warning">Interés marcado</span>
              ) : (
                <button
                  disabled={!isOnline || markInterest.isPending}
                  onClick={() => markInterest.mutate(c.loan_id)}
                  className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-content-muted hover:bg-background"
                >
                  Marcar interés
                </button>
              )}
              <Link to={`/prestamos/nuevo?cliente=${c.client_id}&renueva=${c.loan_id}`} className="btn-solid !px-3 !py-1.5 text-xs">
                Crear renovación
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
