import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Banknote, Bell } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { money0, initials, avatarColor, FREQ_NOUN, weekdayEs, relDayEs, dayMonthEs, waLink } from './lib'

// Prestamos de la maqueta interactiva: subtitulo, 4 pildoras (Todos / Al dia / Atrasados /
// Saldados), tarjetas con avatar de color, prestado y cuota, barra de progreso, vencimiento
// o cuotas vencidas, y botones Registrar pago / Recordar. Los colores salen de var(--nc-*).
type Filter = 'all' | 'ok' | 'late' | 'paid'
const FILTERS: { v: Filter; l: string }[] = [
  { v: 'all', l: 'Todos' }, { v: 'ok', l: 'Al día' }, { v: 'late', l: 'Atrasados' }, { v: 'paid', l: 'Saldados' }
]

// Pildoras de la maqueta: texto de color sobre fondo tenue, no pastilla solida.
function Pill({ kind }: { kind: 'ok' | 'late' | 'paid' }) {
  if (kind === 'ok') return <span className="rounded-full bg-[#60A5FA]/10 px-2.5 py-0.5 text-xs font-semibold text-[#60A5FA]">Al día</span>
  if (kind === 'late') return <span className="rounded-full bg-red-400/10 px-2.5 py-0.5 text-xs font-semibold text-red-400">Atrasado</span>
  return <span className="rounded-full bg-amber-300/10 px-2.5 py-0.5 text-xs font-semibold text-amber-300">Saldado</span>
}

export function Loans() {
  const [filter, setFilter] = useState<Filter>('all')
  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' })

  const balancesQuery = useQuery({
    queryKey: ['nuevo_loans_balances'],
    queryFn: async () => {
      const { data, error } = await supabase.from('loan_balances').select('loan_id, client_id, loan_number, status, pending_principal, pending_interest, pending_late_fee')
      if (error) throw error
      return data as { loan_id: string; client_id: string; loan_number: number; status: string; pending_principal: number; pending_interest: number; pending_late_fee: number }[]
    }
  })
  const clientsQuery = useQuery({
    queryKey: ['nuevo_loans_clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, full_name, phone, whatsapp').is('deleted_at', null)
      if (error) throw error
      return data as { id: string; full_name: string; phone: string | null; whatsapp: string | null }[]
    }
  })
  const loansQuery = useQuery({
    queryKey: ['nuevo_loans_meta'],
    queryFn: async () => {
      const { data, error } = await supabase.from('loans').select('id, principal, frequency')
      if (error) throw error
      return data as { id: string; principal: number; frequency: string }[]
    }
  })
  const installmentsQuery = useQuery({
    queryKey: ['nuevo_loans_installments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('installment_details').select('loan_id, number, due_date, effective_status, total_due')
      if (error) throw error
      return data as { loan_id: string; number: number; due_date: string; effective_status: string; total_due: number }[]
    }
  })
  const saldadoDatesQuery = useQuery({
    queryKey: ['nuevo_loans_saldado_dates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('payment_details').select('loan_id, paid_at, status').order('paid_at', { ascending: false }).limit(500)
      if (error) return null
      const map = new Map<string, string>()
      ;(data ?? []).forEach((p: any) => {
        if (p.status === 'active' && !map.has(p.loan_id)) map.set(p.loan_id, p.paid_at)
      })
      return map
    }
  })

  const balances = balancesQuery.data ?? []
  const clientById = new Map((clientsQuery.data ?? []).map((c) => [c.id, c]))
  const loanMeta = new Map((loansQuery.data ?? []).map((l) => [l.id, l]))
  const instByLoan = new Map<string, { number: number; due_date: string; effective_status: string; total_due: number }[]>()
  ;(installmentsQuery.data ?? []).forEach((r) => {
    const arr = instByLoan.get(r.loan_id) ?? []
    arr.push(r)
    instByLoan.set(r.loan_id, arr)
  })
  const saldadoDates = saldadoDatesQuery.data ?? null

  const rows = balances.map((l) => {
    const inst = (instByLoan.get(l.loan_id) ?? []).sort((a, b) => a.number - b.number)
    const total = inst.length
    const paidCount = inst.filter((i) => i.effective_status === 'paid').length
    const next = inst.find((i) => i.effective_status !== 'paid')
    const overdueList = inst.filter((i) => i.effective_status !== 'paid' && i.due_date < todayIso)
    const kind: 'ok' | 'late' | 'paid' = l.status === 'paid' ? 'paid' : overdueList.length > 0 ? 'late' : 'ok'
    return { ...l, inst, total, paidCount, next, overdueList, kind }
  }).sort((a, b) => b.loan_number - a.loan_number)

  const filtered = rows.filter((r) => {
    if (filter === 'all') return true
    return r.kind === filter
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[28px] font-bold leading-tight text-[var(--nc-text)]">Préstamos</h1>
        <p className="text-sm text-[var(--nc-muted)]">Todos tus préstamos en una sola lista, con el progreso a la vista y el pago a un toque.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.v} onClick={() => setFilter(f.v)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${filter === f.v ? 'bg-[#60A5FA] text-[#0B1120]' : 'bg-[var(--nc-card)] text-[var(--nc-muted)]'}`}>
            {f.l}
          </button>
        ))}
      </div>

      {balancesQuery.isLoading && <p className="text-sm text-[var(--nc-muted)]">Cargando…</p>}
      {balancesQuery.error && <p className="text-sm text-red-400">No se pudieron cargar los préstamos.</p>}
      {!balancesQuery.isLoading && filtered.length === 0 && (
        <div className="rounded-2xl bg-[var(--nc-card)] px-4 py-6 text-center text-sm text-[var(--nc-muted)]">Sin préstamos en este filtro.</div>
      )}

      <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
        {filtered.map((r) => {
          const c = clientById.get(r.client_id)
          const name = c?.full_name ?? '—'
          const phone = c?.phone ?? c?.whatsapp ?? null
          const meta = loanMeta.get(r.loan_id)
          const freqNoun = meta ? FREQ_NOUN[meta.frequency] ?? 'mensual' : 'mensual'
          const pct = r.total > 0 ? Math.round((r.paidCount / r.total) * 100) : 0
          const wa = phone ? waLink(phone, `Hola ${name}, te recordamos tu cuota en NEXCREDIT.`) : null
          const saldadoPaidAt = r.kind === 'paid' ? saldadoDates?.get(r.loan_id) : undefined
          const saldadoLabel = saldadoPaidAt ? `Saldado el ${dayMonthEs(saldadoPaidAt.slice(0, 10))}` : null
          return (
            <div key={r.loan_id} className="rounded-[22px] bg-[var(--nc-card)] p-4">
              <Link to={`/prestamos/${r.loan_id}`} className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: avatarColor(r.client_id) }}>
                  {initials(name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[var(--nc-text)]">{name}</span>
                  {phone && <span className="block text-xs text-[var(--nc-muted)]">{phone}</span>}
                </span>
                <Pill kind={r.kind} />
              </Link>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[11px] text-[var(--nc-muted)]">Prestado</p>
                  <p className="font-disp text-base font-bold text-[var(--nc-text)]">RD$ {money0(meta?.principal ?? 0)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-[var(--nc-muted)]">Cuota {freqNoun}</p>
                  <p className="font-disp text-base font-bold text-[var(--nc-text)]">RD$ {money0(r.next ? Number(r.next.total_due) : 0)}</p>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--nc-soft)]">
                <div className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#3B82F6]" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <span className="text-[var(--nc-muted)]">{r.paidCount} de {r.total} cuotas · {pct}% pagado</span>
                {r.kind === 'paid' && saldadoLabel && <span className="text-[var(--nc-muted)]">{saldadoLabel}</span>}
                {r.kind === 'ok' && r.next && <span className="text-[var(--nc-muted)]">Vence el {weekdayEs(r.next.due_date)}</span>}
                {r.kind === 'late' && (
                  <span className="text-red-400">
                    {r.overdueList.length === 1
                      ? `1 cuota vencida · ${relDayEs(r.overdueList[0].due_date)}`
                      : `${r.overdueList.length} cuotas vencidas`}
                  </span>
                )}
              </div>
              {r.kind !== 'paid' && (
                <div className="mt-3 flex gap-2">
                  <Link to={`/registrar-pago/${r.loan_id}`} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#60A5FA] py-2.5 text-center text-sm font-semibold text-[#0B1120]"><Banknote size={15} /> Registrar pago</Link>
                  {wa && (
                    <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg bg-[var(--nc-soft)] px-3 py-2.5 text-sm font-medium text-[var(--nc-text)]">
                      <Bell size={15} /> Recordar
                    </a>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Link to="/prestamos/nuevo" className="block rounded-xl bg-[#2563EB] py-3 text-center text-sm font-semibold text-white">+ Crear nuevo préstamo</Link>
    </div>
  )
}
