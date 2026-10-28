import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { money, shortDate } from '@/lib/format'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useAuth } from '@/contexts/AuthContext'

type LoanRow = {
  loan_id: string; client_id: string; loan_number: number; status: string
  pending_principal: number; pending_interest: number; pending_late_fee: number
  next_due_date: string | null; days_overdue: number
}

const FILTERS = [
  { key: 'active', label: 'Activos' },
  { key: 'overdue', label: 'Vencidos' },
  { key: 'paid', label: 'Finalizados' },
  { key: 'all', label: 'Todos' }
] as const

export function Loans() {
  const isOnline = useOnlineStatus()
  const { isOwner, hasPermission } = useAuth()
  const seesAll = isOwner || hasPermission('loans.view_all')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('active')
  const [search, setSearch] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['loans'],
    queryFn: async () => {
      const [loansRes, clientsRes] = await Promise.all([
        supabase
          .from('loan_balances')
          .select('loan_id, client_id, loan_number, status, pending_principal, pending_interest, pending_late_fee, next_due_date, days_overdue')
          .order('loan_number', { ascending: false }),
        supabase.from('clients').select('id, full_name')
      ])
      if (loansRes.error) throw loansRes.error
      if (clientsRes.error) throw clientsRes.error
      const names = new Map((clientsRes.data ?? []).map((c: any) => [c.id, c.full_name]))
      return (loansRes.data as LoanRow[]).map((l) => ({ ...l, client_name: names.get(l.client_id) ?? '—' }))
    }
  })

  // Progreso por préstamo (maqueta v86): cuotas pagadas ÷ cuotas totales. Si la vista
  // no está disponible, las filas se muestran sin barra (nunca rompe la lista).
  const progressQuery = useQuery({
    queryKey: ['loans_progress'],
    queryFn: async () => {
      const { data, error } = await supabase.from('installment_details').select('loan_id, status')
      if (error) return null
      const map = new Map<string, { total: number; paid: number }>()
      ;(data ?? []).forEach((r: any) => {
        const e = map.get(r.loan_id) ?? { total: 0, paid: 0 }
        e.total++
        if (r.status === 'paid') e.paid++
        map.set(r.loan_id, e)
      })
      return map
    }
  })
  const progress = progressQuery.data ?? null

  const filtered = (data ?? []).filter((l) => {
    if (search && !l.client_name.toLowerCase().includes(search.toLowerCase()) && !String(l.loan_number).includes(search)) return false
    if (filter === 'all') return true
    if (filter === 'active') return l.status === 'active'
    if (filter === 'overdue') return l.status === 'active' && l.days_overdue > 0
    if (filter === 'paid') return l.status === 'paid'
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="t-h1 text-content">Préstamos</h1>
          <p className="text-sm text-content-muted">
            {seesAll ? 'Gestiona todos los préstamos de tu cartera.' : 'Viendo solo los préstamos que tú creaste o que te compartieron.'}
          </p>
        </div>
        <Link to="/prestamos/nuevo" aria-disabled={!isOnline} className={`btn-solid ${!isOnline ? 'pointer-events-none opacity-50' : ''}`}>
          Nuevo préstamo
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-auto sm:min-w-[14rem] sm:max-w-sm sm:flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
          <input aria-label="Buscar cliente o número…" className="field-input pl-9" placeholder="Buscar cliente o número…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f.key ? 'bg-primary-fill text-white' : 'glass-card text-content-muted hover:text-content'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-sm text-content-muted">Cargando…</p>}
      {error && <p className="text-sm text-danger">No se pudo cargar la cartera.</p>}

      {!isLoading && filtered.length === 0 && (
        <div className="glass-card px-5 py-10 text-center text-sm text-content-muted">Nada que mostrar en este filtro.</div>
      )}

      <div className="space-y-2">
        {filtered.map((l) => {
          const p = progress?.get(l.loan_id)
          const pct = p && p.total > 0 ? Math.round((p.paid / p.total) * 100) : null
          return (
            <div key={l.loan_id} className="glass-card flex items-center gap-3 px-4 py-3.5">
              <Link to={`/prestamos/${l.loan_id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-semibold text-on-navy">
                  {l.client_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-content">{l.client_name}</p>
                    <span className="text-xs text-content-muted">PR-{l.loan_number}</span>
                    {l.status === 'paid' && <span className="badge-success shrink-0">Finalizado</span>}
                    {l.status === 'active' && l.days_overdue > 0 && <span className="badge-danger shrink-0">Vencido</span>}
                  </div>
                  <p className="truncate text-xs text-content-muted">
                    Próxima cuota {shortDate(l.next_due_date)}
                    {l.days_overdue > 0 && l.status === 'active' && <span className="text-danger"> · {l.days_overdue}d vencido</span>}
                  </p>
                  {pct !== null && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="shrink-0 text-[11px] text-content-muted">{p!.paid}/{p!.total} · {pct}%</span>
                    </div>
                  )}
                </div>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <p className="money text-sm font-semibold text-content">RD$ {money(l.pending_principal + l.pending_interest + l.pending_late_fee)}</p>
                {l.status === 'active' && (
                  <Link to={`/prestamos/${l.loan_id}`} className="btn-solid !px-3 !py-1.5 text-xs">Cobrar</Link>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
