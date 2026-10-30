import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { money, shortDate } from '@/lib/format'

type Row = {
  due_date: string; client_id: string; client_name: string; loan_id: string; loan_number: number
  installment_number: number; total_due: number; total_paid: number; status: string
}

const RANGE_OPTIONS = [
  { v: 7, l: '7 días' }, { v: 14, l: '14 días' }, { v: 30, l: '30 días' }
]

const STATUS_LABEL: Record<string, string> = { paid: 'Pagada', overdue: 'Vencida', partial: 'Parcial', pending: 'Pendiente' }
const STATUS_BADGE: Record<string, string> = { paid: 'badge-success', overdue: 'badge-danger', partial: 'badge-warning', pending: 'badge-neutral' }

// Fecha en hora de RD, no UTC: con toISOString, despues de las 8 p. m. en RD el
// 'hoy' saltaba al dia siguiente y el resumen de hoy salia en 0.
function rdIso(d: Date) {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' })
}
function addDaysIso(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function CollectionCalendar() {
  const [days, setDays] = useState(14)
  const todayIso = rdIso(new Date())

  const { data, isLoading, error } = useQuery({
    queryKey: ['collection-calendar', days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('collection_calendar', {
        p_from: addDaysIso(todayIso, -3), p_to: addDaysIso(todayIso, days)
      })
      if (error) throw error
      return data as Row[]
    }
  })

  const grouped: Record<string, Row[]> = {}
  ;(data ?? []).forEach((r) => { (grouped[r.due_date] ??= []).push(r) })
  const dates = Object.keys(grouped).sort()

  const stats = useMemo(() => {
    const rows = data ?? []
    const today = rows.filter((r) => r.due_date === todayIso)
    const upcoming = rows.filter((r) => r.due_date > todayIso && r.status !== 'paid')
    const overdue = rows.filter((r) => r.status === 'overdue')
    const totalExpected = rows.reduce((s, r) => s + Number(r.total_due), 0)
    return {
      today: { count: today.length, amount: today.reduce((s, r) => s + Number(r.total_due), 0) },
      upcoming: { count: upcoming.length, amount: upcoming.reduce((s, r) => s + Number(r.total_due), 0) },
      overdue: { count: overdue.length, amount: overdue.reduce((s, r) => s + Number(r.total_due), 0) },
      totalExpected
    }
  }, [data, todayIso])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="t-h1 text-content">Calendario de cobros</h1>
        <div className="flex gap-1">
          {RANGE_OPTIONS.map((o) => (
            <button key={o.v} onClick={() => setDays(o.v)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${days === o.v ? 'bg-primary-fill text-white' : 'glass-card text-content-muted'}`}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          {isLoading && <p className="text-sm text-content-muted">Cargando…</p>}
          {error && <p className="text-sm text-danger">No se pudo cargar el calendario.</p>}
          {!isLoading && dates.length === 0 && (
            <div className="glass-card px-5 py-10 text-center text-sm text-content-muted">No hay cuotas en este rango.</div>
          )}

          {dates.map((d) => (
            <div key={d}>
              <p className="mb-1.5 text-xs font-semibold text-content-muted">{shortDate(d)}{d === todayIso ? ' · Hoy' : ''}</p>
              <div className="glass-card divide-y divide-line">
                {grouped[d].map((r) => (
                  <Link key={`${r.loan_id}-${r.installment_number}`} to={`/prestamos/${r.loan_id}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-background">
                    <div>
                      <p className="text-sm font-medium text-content">{r.client_name}</p>
                      <p className="text-xs text-content-muted">Préstamo #{r.loan_number} · cuota {r.installment_number}</p>
                    </div>
                    <div className="text-right">
                      <p className="money text-sm font-semibold text-content">RD$ {money(r.total_due)}</p>
                      <span className={STATUS_BADGE[r.status] ?? 'badge-neutral'}>{STATUS_LABEL[r.status] ?? r.status}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <aside className="glass-card h-fit space-y-4 p-5">
          <h2 className="text-sm font-semibold text-content">Resumen</h2>
          <SidePanelRow label="Pagos de hoy" count={stats.today.count} amount={stats.today.amount} tone="gold" />
          <SidePanelRow label="Próximos pagos" count={stats.upcoming.count} amount={stats.upcoming.amount} />
          <SidePanelRow label="Vencidos" count={stats.overdue.count} amount={stats.overdue.amount} tone="due" />
          <div className="border-t border-line pt-3">
            <p className="text-xs text-content-muted">Total esperado</p>
            <p className="money text-lg font-semibold text-content">RD$ {money(stats.totalExpected)}</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function SidePanelRow({ label, count, amount, tone }: { label: string; count: number; amount: number; tone?: 'due' | 'gold' }) {
  const cls = tone === 'due' ? 'text-danger' : tone === 'gold' ? 'text-warning-text' : 'text-content'
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-content-muted">{label}</p>
        <p className="text-xs text-content-muted">{count} cuota{count === 1 ? '' : 's'}</p>
      </div>
      <p className={`money text-sm font-semibold ${cls}`}>RD$ {money(amount)}</p>
    </div>
  )
}
