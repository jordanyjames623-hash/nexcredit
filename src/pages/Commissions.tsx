import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Award, TrendingUp, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { money, shortDate } from '@/lib/format'
import { useAuth } from '@/contexts/AuthContext'

const PERIODS = [
  { v: 'week', l: 'Semana' }, { v: 'biweek', l: 'Quincena' }, { v: 'month', l: 'Mes' }, { v: 'year', l: 'Año' }
]
const CATEGORY_LABEL: Record<string, string> = {
  captacion: 'Captación y originación', pagos: 'Pagos puntuales', renovaciones: 'Renovaciones',
  recuperacion: 'Recuperación de mora', calidad: 'Calidad de cartera', penalizacion: 'Penalizaciones', ajuste: 'Ajustes manuales'
}

type Summary = {
  points_by_category: Record<string, number>
  valid_points: number; pending_points: number
  delinquency_percent: number | null; quality_label: string; quality_factor_percent: number
  level_name: string; point_value: number
  gross_bonus: number; adjusted_bonus: number
  margin: number; commission_cap_percent: number; commission_cap: number; final_commission: number
}
type Collaborator = { user_id: string; full_name: string; email: string; is_active: boolean }
type Level = { name: string; min_points: number; max_points: number | null; point_value: number; sort_order: number }
type PeriodRow = {
  id: string; period_start: string; period_end: string; final_commission: number
  total_adjustments: number; net_payable: number; closed_at: string
}

export function Commissions() {
  const { isOwner, session, profile } = useAuth()
  const qc = useQueryClient()
  const [period, setPeriod] = useState('month')
  const [selected, setSelected] = useState<string>(session?.user.id ?? '')
  const [closeError, setCloseError] = useState<string | null>(null)

  const { data: collaborators } = useQuery({
    queryKey: ['collaborators-for-commissions'],
    enabled: isOwner,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_collaborators')
      if (error) throw error
      return data as Collaborator[]
    }
  })

  const { data: levels } = useQuery({
    queryKey: ['commission_levels'],
    queryFn: async () => {
      const { data, error } = await supabase.from('commission_levels').select('name, min_points, max_points, point_value, sort_order').order('sort_order')
      if (error) throw error
      return data as Level[]
    }
  })

  const viewingId = selected || session?.user.id || ''
  const summaryQuery = useQuery({
    queryKey: ['commission_summary', viewingId, period],
    enabled: Boolean(viewingId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('commission_summary', { p_collaborator: viewingId, p_period: period })
      if (error) throw error
      return data as Summary
    }
  })

  const periodsQuery = useQuery({
    queryKey: ['commission_periods', viewingId],
    enabled: Boolean(viewingId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commission_periods_detail')
        .select('id, period_start, period_end, final_commission, total_adjustments, net_payable, closed_at')
        .eq('collaborator_id', viewingId)
        .order('period_start', { ascending: false })
      if (error) throw error
      return data as PeriodRow[]
    }
  })

  const closePeriod = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('close_commission_period', { p_collaborator: viewingId, p_period: period })
      if (error) throw error
    },
    onSuccess: () => { setCloseError(null); qc.invalidateQueries({ queryKey: ['commission_periods', viewingId] }) },
    onError: (e: any) => setCloseError(e.message ?? 'No se pudo cerrar el período.')
  })

  const addAdjustment = useMutation({
    mutationFn: async ({ periodId, amount, reason }: { periodId: string; amount: number; reason: string }) => {
      const { error } = await supabase.rpc('adjust_closed_period', { p_period_id: periodId, p_amount_delta: amount, p_reason: reason })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commission_periods', viewingId] })
  })

  const s = summaryQuery.data
  const nextLevel = levels?.find((l) => s && l.min_points > s.valid_points)
  const pointsToNext = nextLevel && s ? Math.ceil(nextLevel.min_points - s.valid_points) : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="t-h1 text-content">Comisiones</h1>
          <p className="text-sm text-content-muted">
            {isOwner ? 'Desempeño y comisión de cada colaborador.' : 'Tu desempeño y tu comisión de este período.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isOwner && (
            <select aria-label="Colaborador" className="field-input !w-auto" value={selected || session?.user.id} onChange={(e) => setSelected(e.target.value)}>
              <option value={session?.user.id}>{profile?.full_name || 'Yo'} (propietario)</option>
              {(collaborators ?? []).map((c) => <option key={c.user_id} value={c.user_id}>{c.full_name || c.email}</option>)}
            </select>
          )}
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button key={p.v} onClick={() => setPeriod(p.v)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${period === p.v ? 'bg-primary-fill text-white' : 'glass-card text-content-muted'}`}>
                {p.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {summaryQuery.isLoading && <p className="text-sm text-content-muted">Cargando…</p>}
      {summaryQuery.error && <p className="text-sm text-danger">No se pudo calcular la comisión.</p>}

      {s && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="glass-card p-5 lg:col-span-2">
              <h2 className="mb-3 text-sm font-semibold text-content">Puntos por categoría</h2>
              <dl className="space-y-2">
                {Object.entries(s.points_by_category).filter(([, v]) => v !== 0).map(([cat, v]) => (
                  <div key={cat} className="flex items-center justify-between text-sm">
                    <dt className="text-content-muted">{CATEGORY_LABEL[cat] ?? cat}</dt>
                    <dd className={`money font-semibold ${v < 0 ? 'text-danger' : 'text-content'}`}>{v > 0 ? '+' : ''}{v}</dd>
                  </div>
                ))}
                {Object.values(s.points_by_category).every((v) => v === 0) && <p className="text-sm text-content-muted">Sin puntos todavía en este período.</p>}
              </dl>
              <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                <span className="text-sm font-semibold text-content">Puntos válidos</span>
                <span className="money text-lg font-bold text-primary-dark">{s.valid_points}</span>
              </div>
              {s.pending_points > 0 && (
                <p className="mt-1 text-xs text-content-muted">+ {s.pending_points} puntos pendientes de liberar (no cuentan todavía).</p>
              )}
            </div>

            <div className="glass-card p-5">
              <div className="mb-2 flex items-center gap-2">
                <Award size={18} className="text-primary" />
                <h2 className="text-sm font-semibold text-content">Nivel {s.level_name}</h2>
              </div>
              <p className="text-xs text-content-muted">RD$ {money(s.point_value)} por punto</p>
              {nextLevel && pointsToNext !== null ? (
                <p className="mt-2 flex items-center gap-1 text-xs text-content-muted">
                  <TrendingUp size={13} /> Te faltan {pointsToNext} puntos para {nextLevel.name}
                </p>
              ) : (
                <p className="mt-2 text-xs text-success-text">Nivel máximo alcanzado</p>
              )}
              <div className="mt-3 border-t border-line pt-3">
                <p className="text-xs text-content-muted">Calidad de cartera</p>
                <p className="text-sm font-semibold text-content">{s.quality_label} · {s.quality_factor_percent}%</p>
                {s.delinquency_percent !== null && <p className="text-xs text-content-muted">{s.delinquency_percent}% de morosidad</p>}
              </div>
            </div>
          </div>

          <div className="glass-card p-5">
            <h2 className="mb-3 text-sm font-semibold text-content">Cálculo de la comisión</h2>
            <dl className="space-y-2 text-sm">
              <Row label={`Bono bruto (${s.valid_points} pts × RD$ ${money(s.point_value)})`} value={s.gross_bonus} />
              <Row label={`Factor de calidad (${s.quality_factor_percent}%)`} value={s.adjusted_bonus} />
              <Row label={`Margen generado en el período`} value={s.margin} muted />
              <Row label={`Límite (${s.commission_cap_percent}% del margen)`} value={s.commission_cap} muted />
            </dl>
            <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
              <span className="text-base font-semibold text-content">Comisión final</span>
              <span className="money text-2xl font-bold text-success-text">RD$ {money(s.final_commission)}</span>
            </div>
            {s.adjusted_bonus > s.commission_cap && (
              <p className="mt-2 text-xs text-danger">El bono se ajustó al límite porque supera el margen generado.</p>
            )}
            {isOwner && (
              <div className="mt-4 border-t border-line pt-4">
                {closeError && <p className="mb-2 text-sm text-danger">{closeError}</p>}
                <button onClick={() => closePeriod.mutate()} disabled={closePeriod.isPending} className="btn-secondary">
                  <Lock size={14} className="mr-1.5" /> {closePeriod.isPending ? 'Cerrando…' : 'Cerrar este período'}
                </button>
                <p className="mt-1.5 text-xs text-content-muted">Congela estos números. No se puede cerrar el mismo período dos veces.</p>
              </div>
            )}
          </div>

          {(periodsQuery.data?.length ?? 0) > 0 && (
            <div className="glass-card">
              <h2 className="ledger-rule px-5 py-3 text-sm font-semibold text-content">Períodos cerrados</h2>
              <ul className="divide-y divide-line">
                {periodsQuery.data!.map((p) => (
                  <PeriodItem key={p.id} period={p} isOwner={isOwner}
                    onAdjust={(amount, reason) => addAdjustment.mutate({ periodId: p.id, amount, reason })} />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PeriodItem({ period, isOwner, onAdjust }: { period: PeriodRow; isOwner: boolean; onAdjust: (amount: number, reason: string) => void }) {
  const [showForm, setShowForm] = useState(false)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')

  return (
    <li className="px-5 py-3.5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-content">{shortDate(period.period_start)} — {shortDate(period.period_end)}</p>
          <p className="text-xs text-content-muted">
            RD$ {money(period.final_commission)}{period.total_adjustments !== 0 ? ` + ajustes RD$ ${money(period.total_adjustments)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="money text-sm font-semibold text-success-text">RD$ {money(period.net_payable)}</span>
          {isOwner && (
            <button onClick={() => setShowForm((v) => !v)} className="text-xs text-primary hover:underline">
              {showForm ? 'Cancelar' : 'Ajustar'}
            </button>
          )}
        </div>
      </div>
      {showForm && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <div>
            <label className="field-label">Monto (+/-)</label>
            <input aria-label="Monto (+/-)" type="number" className="field-input !w-28 money" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="field-label">Motivo</label>
            <input aria-label="Motivo" className="field-input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <button
            className="btn-solid"
            onClick={() => { if (amount && reason.trim()) { onAdjust(Number(amount), reason.trim()); setShowForm(false); setAmount(''); setReason('') } }}
          >
            Guardar
          </button>
        </div>
      )}
    </li>
  )
}

function Row({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? 'text-content-muted' : 'text-content-muted'}>{label}</dt>
      <dd className={`money font-medium ${muted ? 'text-content-muted' : 'text-content'}`}>RD$ {money(value)}</dd>
    </div>
  )
}
