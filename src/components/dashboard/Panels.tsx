import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  CalendarClock, Receipt, AlertTriangle, Target, HandCoins, Users, CircleDollarSign, BarChart3, Landmark,
  ClipboardList, FileText, Activity, UserPlus, Calculator, Clock, UserX, ArrowRight, Check, type LucideIcon
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import { shortDate } from '@/lib/format'
import { actionLabel } from '@/lib/activityLabels'
import { useAuth } from '@/contexts/AuthContext'
import { useChartColors } from '@/hooks/useChartColors'
import { Panel, money, pctChange, useSummary, useRisk, useAlerts, type CalendarRow, type Summary } from './shared'

const rd = (v: number) => `RD$ ${money(v)}`

/* ───────────────────────── Acciones rápidas ───────────────────────── */

const QUICK: { to: string; label: string; hint: string; icon: LucideIcon; primary?: boolean; paidOnly?: boolean }[] = [
  { to: '/prestamos/nuevo', label: 'Nuevo préstamo', hint: 'Crear y desembolsar', icon: Landmark, primary: true },
  { to: '/prestamos', label: 'Registrar pago', hint: 'Elige el préstamo', icon: Receipt },
  { to: '/clientes?crear=1', label: 'Nuevo cliente', hint: 'Agregar a tu cartera', icon: UserPlus },
  { to: '/solicitudes', label: 'Nueva solicitud', hint: 'Evaluar y aprobar', icon: ClipboardList, paidOnly: true },
  { to: '/calculadora', label: 'Cotizar', hint: 'Simular cuotas', icon: Calculator },
  { to: '/reportes', label: 'Reportes', hint: 'Analiza tu negocio', icon: BarChart3 }
]

export function QuickActions({ isBasic }: { isBasic: boolean }) {
  const actions = QUICK.filter((a) => !a.paidOnly || !isBasic)
  return (
    <section aria-label="Acciones rápidas">
      <p className="t-label mb-2">Acciones rápidas</p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        {actions.map(({ to, label, hint, icon: Icon, primary }) => (
          <Link
            key={to}
            to={to}
            className={
              primary
                ? 'card-hover flex items-center gap-3 rounded-2xl bg-gradient-to-b from-[#2C6CEE] to-primary-fill p-3 text-white shadow-[0_12px_24px_-14px_rgba(37,99,235,0.9)]'
                : 'glass-card card-hover flex items-center gap-3 !rounded-2xl p-3'
            }
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${primary ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'}`}>
              <Icon size={18} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className={`block truncate text-sm font-semibold ${primary ? 'text-white' : 'text-content'}`}>{label}</span>
              <span className={`block truncate text-xs ${primary ? 'text-white/80' : 'text-content-muted'}`}>{hint}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

/* ───────────────────── Qué necesita atención (resumen en píldoras) ───────────────────── */

export function AttentionStrip({ isBasic }: { isBasic: boolean }) {
  const query = useAlerts()
  if (query.error || !query.data) return null
  const a = query.data
  const items = [
    { key: 'v', n: a.cuotas_vencidas, text: a.cuotas_vencidas === 1 ? 'cuota vencida' : 'cuotas vencidas', to: isBasic ? '/prestamos' : '/cobranza', icon: AlertTriangle, tone: 'border-danger/30 bg-danger/10 text-danger hover:bg-danger/20' },
    { key: 'h', n: a.vencen_hoy, text: a.vencen_hoy === 1 ? 'cuota vence hoy' : 'cuotas vencen hoy', to: isBasic ? '/pagos' : '/calendario', icon: Clock, tone: 'border-warning/40 bg-warning/20 text-warning-text hover:bg-warning/30' },
    { key: 's', n: a.sin_pago_reciente, text: a.sin_pago_reciente === 1 ? 'cliente sin pagos en 30 días' : 'clientes sin pagos en 30 días', to: '/clientes', icon: UserX, tone: 'border-warning/40 bg-warning/20 text-warning-text hover:bg-warning/30' }
  ].filter((i) => i.n > 0)

  if (items.length === 0) {
    return (
      <p className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-medium text-success-text">
        <Check size={14} aria-hidden="true" /> Todo está al día
      </p>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Requiere atención">
      {items.map(({ key, n, text, to, icon: Icon, tone }) => (
        <Link key={key} to={to} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${tone}`}>
          <Icon size={14} aria-hidden="true" />
          {n} {text}
          <ArrowRight size={12} aria-hidden="true" />
        </Link>
      ))}
    </div>
  )
}

/* ───────────────────────── Próximos cobros ───────────────────────── */

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  overdue: { cls: 'badge-danger', label: 'Vencida' },
  partial: { cls: 'badge-warning', label: 'Parcial' },
  pending: { cls: 'badge-neutral', label: 'Pendiente' }
}

export function UpcomingPaymentsPanel({ rows, linkTo }: { rows: CalendarRow[]; linkTo?: string }) {
  return (
    <Panel title="Próximos cobros" icon={CalendarClock} action={linkTo ? { to: linkTo, label: 'Ver todos' } : undefined}>
      {rows.length === 0 ? (
        <p className="py-4 text-sm text-content-muted">Nada pendiente en 7 días.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="text-right">Cuota</th>
                <th>Vence</th>
                <th className="text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.pending
                return (
                  <tr key={`${r.loan_id}-${r.installment_number}`}>
                    <td><Link to={`/prestamos/${r.loan_id}`} className="font-medium text-content hover:text-primary">{r.client_name}</Link></td>
                    <td className="money text-right text-content">{rd(r.total_due)}</td>
                    <td className="text-content-muted">{shortDate(r.due_date)}</td>
                    <td className="text-right"><span className={badge.cls}>{badge.label}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

/* ───────────────────────── Cobros recientes ───────────────────────── */

type RecentPayment = { id: string; client_name: string; total_amount: number; paid_at: string }

export function RecentPaymentsPanel({ linkTo }: { linkTo?: string }) {
  const query = useQuery({
    queryKey: ['dashboard_recent_payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_details')
        .select('id, client_name, total_amount, paid_at')
        .eq('status', 'active')
        .order('paid_at', { ascending: false })
        .limit(5)
      if (error) throw error
      return data as RecentPayment[]
    }
  })
  if (query.error) return null
  const rows = query.data ?? []
  return (
    <Panel title="Cobros recientes" icon={Receipt} action={linkTo ? { to: linkTo, label: 'Ver todos' } : undefined}>
      {rows.length === 0 ? (
        <p className="py-4 text-sm text-content-muted">Todavía no hay cobros registrados.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success-text"><Receipt size={16} aria-hidden="true" /></span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-content">{p.client_name}</p>
                  <p className="text-xs text-content-muted">{shortDate(p.paid_at.slice(0, 10))}</p>
                </div>
              </div>
              <p className="money shrink-0 text-sm font-semibold text-success-text">{rd(p.total_amount)}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/* ───────────────────────────── Alertas ───────────────────────────── */

export function AlertsPanel({ linkTo }: { linkTo?: string }) {
  const query = useAlerts()
  if (query.error) return null
  const a = query.data
  const items = a
    ? [
        { key: 'v', n: a.cuotas_vencidas, label: a.cuotas_vencidas === 1 ? 'cuota vencida' : 'cuotas vencidas', tone: 'bg-danger/10 text-danger', icon: AlertTriangle },
        { key: 'h', n: a.vencen_hoy, label: a.vencen_hoy === 1 ? 'cuota vence hoy' : 'cuotas vencen hoy', tone: 'bg-warning/20 text-warning-text', icon: Clock },
        { key: 's', n: a.sin_pago_reciente, label: a.sin_pago_reciente === 1 ? 'cliente sin pagos en 30 días' : 'clientes sin pagos en 30 días', tone: 'bg-warning/20 text-warning-text', icon: UserX }
      ].filter((i) => i.n > 0)
    : []
  const total = items.reduce((sum, i) => sum + i.n, 0)
  return (
    <Panel title={total > 0 ? `Alertas (${total})` : 'Alertas'} icon={AlertTriangle} action={linkTo ? { to: linkTo, label: 'Ver cobranza' } : undefined}>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 py-4 text-sm text-content-muted"><Check size={16} className="text-success-text" aria-hidden="true" /> Sin alertas: todo está al día.</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map(({ key, n, label, tone, icon: Icon }) => (
            <li key={key} className="flex items-center gap-3 text-sm text-content">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone}`}><Icon size={15} aria-hidden="true" /></span>
              <span><span className="font-semibold">{n}</span> {label}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/* ────────────────────────── Actividad reciente ────────────────────────── */

type ActivityRow = { id: string; user_name: string | null; action: string; amount: number | null; created_at: string }

function activityIcon(action: string): { icon: LucideIcon; tone: string } {
  if (action.startsWith('payment')) return { icon: Receipt, tone: 'bg-success/10 text-success-text' }
  if (action.startsWith('client')) return { icon: UserPlus, tone: 'bg-primary/10 text-primary' }
  if (action.startsWith('loan') || action.startsWith('application')) return { icon: Landmark, tone: 'bg-primary/10 text-primary' }
  if (action.startsWith('collaborator') || action.startsWith('member')) return { icon: Users, tone: 'bg-primary/10 text-primary' }
  return { icon: Activity, tone: 'bg-primary/10 text-primary' }
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'ahora'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  return `hace ${Math.floor(hours / 24)} d`
}

export function RecentActivityPanel() {
  const { isOwner } = useAuth()
  const query = useQuery({
    queryKey: ['dashboard_recent_activity'],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('id, user_name, action, amount, created_at')
        .order('created_at', { ascending: false })
        .limit(6)
      if (error) throw error
      return data as ActivityRow[]
    }
  })
  if (query.error) return null
  const rows = query.data ?? []
  return (
    <Panel title="Actividad reciente" icon={Activity} action={isOwner ? { to: '/actividad', label: 'Ver todo' } : undefined}>
      {rows.length === 0 ? (
        <p className="py-4 text-sm text-content-muted">Sin actividad todavía.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => {
            const { icon: Icon, tone } = activityIcon(r.action)
            return (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone}`}><Icon size={16} aria-hidden="true" /></span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-content">{actionLabel(r.action)}</p>
                    <p className="truncate text-xs text-content-muted">{r.user_name ?? 'Sistema'} · {timeAgo(r.created_at)}</p>
                  </div>
                </div>
                {r.amount !== null && Number(r.amount) > 0 && <p className="money shrink-0 text-sm font-semibold text-content">{rd(Number(r.amount))}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

/* ──────────────────────── Meta de cobranza ──────────────────────── */

export function CollectionGoalPanel() {
  const { business, isOwner, refreshBusiness } = useAuth()
  const toast = useToast()
  const summary = useSummary('month')
  const c = useChartColors()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const goal = business?.collection_goal != null ? Number(business.collection_goal) : null
  const hasGoal = goal !== null && goal > 0
  const collected = summary.data?.cobros_periodo.total_cobrado ?? 0

  const save = useMutation({
    mutationFn: async () => {
      const n = Number(value)
      if (!business || !Number.isFinite(n) || n <= 0) throw new Error('Escribe un monto mayor que cero.')
      const { error: updateError } = await supabase.from('businesses').update({ collection_goal: n }).eq('id', business.id)
      if (updateError) throw updateError
    },
    onSuccess: async () => { setEditing(false); setError(null); await refreshBusiness(); toast.success('Meta guardada') },
    onError: (e: any) => setError(e.message ?? 'No se pudo guardar la meta.')
  })

  const size = 128
  const stroke = 12
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const progress = hasGoal ? Math.min(1, collected / (goal as number)) : 0
  const reached = progress >= 1
  const showForm = isOwner && (editing || !hasGoal)

  return (
    <Panel title="Meta de cobranza del mes" icon={Target}>
      {showForm ? (
        <div>
          <p className="mb-3 text-sm text-content-muted">Define cuánto quieres cobrar este mes; el avance se calcula solo con tus cobros reales.</p>
          {error && <p className="mb-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
          <div className="flex gap-2">
            <input type="number" min="0" aria-label="Meta mensual en pesos" className="field-input money" placeholder="Meta mensual (RD$)" value={value} onChange={(e) => setValue(e.target.value)} />
            <button onClick={() => save.mutate()} disabled={save.isPending} data-loading={save.isPending} className="btn-solid shrink-0">Guardar</button>
            {editing && <button onClick={() => { setEditing(false); setError(null) }} className="btn-ghost shrink-0">Cancelar</button>}
          </div>
        </div>
      ) : !hasGoal ? (
        <p className="py-4 text-sm text-content-muted">El propietario aún no definió la meta de cobranza del mes.</p>
      ) : (
        <div className="flex items-center gap-5">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img" aria-label={`Avance de la meta: ${Math.round(progress * 100)}%`}>
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={c.c('line', 0.9)} strokeWidth={stroke} />
            <circle
              cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={reached ? c.c('success') : c.c('primary')} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)}
              transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.22, 0.61, 0.36, 1)' }}
            />
            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill={c.c('text')} fontSize="24" fontWeight="700">
              {Math.round(progress * 100)}%
            </text>
          </svg>
          <dl className="flex-1 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-content-muted">Meta</dt><dd className="money font-medium text-content">{rd(goal as number)}</dd></div>
            <div className="flex justify-between"><dt className="text-content-muted">Cobrado</dt><dd className="money font-medium text-success-text">{rd(collected)}</dd></div>
            <div className="flex justify-between"><dt className="text-content-muted">Pendiente</dt><dd className="money font-medium text-danger">{rd(Math.max(0, (goal as number) - collected))}</dd></div>
            {isOwner && (
              <button onClick={() => { setValue(String(goal)); setEditing(true) }} className="pt-1 text-xs font-medium text-primary hover:underline">Editar meta</button>
            )}
          </dl>
        </div>
      )}
    </Panel>
  )
}

/* ────────────────────── Gestión de cobranza ────────────────────── */

type CollectionDash = { total_vencido: number; clientes_vencidos: number; promesas_pendientes: number; recuperado_periodo: number }

export function CollectionManagementPanel() {
  const query = useQuery({
    queryKey: ['dashboard_collection_mgmt'],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('collection_dashboard', { p_period: 'month' })
      if (error) throw error
      return data as CollectionDash
    }
  })
  if (query.error) return null
  const d = query.data
  return (
    <Panel title="Gestión de cobranza" icon={HandCoins} action={{ to: '/cobranza', label: 'Ir a Cobranza' }}>
      {!d ? (
        <p className="text-sm text-content-muted">Cargando…</p>
      ) : (
        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between"><dt className="text-content-muted">Total vencido</dt><dd className="money font-medium text-danger">{rd(d.total_vencido)}</dd></div>
          <div className="flex justify-between"><dt className="text-content-muted">Clientes con atraso</dt><dd className="font-medium text-content">{d.clientes_vencidos}</dd></div>
          <div className="flex justify-between"><dt className="text-content-muted">Recuperado este mes</dt><dd className="money font-medium text-success-text">{rd(d.recuperado_periodo)}</dd></div>
          <div className="flex justify-between"><dt className="text-content-muted">Promesas de pago pendientes</dt><dd className="font-medium text-warning-text">{d.promesas_pendientes}</dd></div>
        </dl>
      )}
    </Panel>
  )
}

/* ───────────────────── Rendimiento de empleados ───────────────────── */

type UserRow = { user_name: string | null; pagos_registrados: number; monto_cobrado: number }
type UsersReport = { por_usuario?: UserRow[] }

export function EmployeePerformancePanel() {
  const report = useQuery({
    queryKey: ['dashboard_employees'],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('portfolio_report', { p_period: 'month' })
      if (error) throw error
      return data as UsersReport
    }
  })
  const risk = useRisk()
  const cartera = useMemo(() => {
    const map = new Map<string, number>()
    ;(risk.data?.por_colaborador ?? []).forEach((c) => map.set((c.colaborador_name ?? '').trim().toLowerCase(), Number(c.total_pending)))
    return map
  }, [risk.data])
  if (report.error) return null
  const rows = report.data?.por_usuario ?? []
  return (
    <Panel title="Rendimiento de empleados" icon={Users} action={{ to: '/reportes?tab=actividad', label: 'Ver detalle' }}>
      {rows.length === 0 ? (
        <p className="py-4 text-sm text-content-muted">Sin actividad este mes.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th className="text-right">Cartera</th>
                <th className="text-right">Cobrado (mes)</th>
                <th className="text-right">Pagos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u, i) => {
                const pending = cartera.get((u.user_name ?? '').trim().toLowerCase())
                return (
                  <tr key={i}>
                    <td className="font-medium text-content">{u.user_name ?? '—'}</td>
                    <td className="money text-right text-content-muted">{pending === undefined ? '—' : rd(pending)}</td>
                    <td className="money text-right font-medium text-success-text">{rd(Number(u.monto_cobrado))}</td>
                    <td className="text-right text-content-muted">{u.pagos_registrados}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

/* ──────────────────────── Rentabilidad ──────────────────────── */

export function ProfitabilityPanel({ s }: { s: Summary }) {
  const ingresos = s.ingresos.interes_cobrado + s.ingresos.mora_cobrada
  const utilidad = ingresos - s.gastos
  return (
    <Panel title="Rentabilidad" icon={CircleDollarSign} action={{ to: '/reportes?tab=financiero', label: 'Ver reporte' }}>
      <p className={`t-kpi money ${utilidad >= 0 ? 'text-success-text' : 'text-danger'}`}><span className="mr-1 text-[0.55em] font-semibold text-content-muted">RD$</span>{money(utilidad)}</p>
      <p className="mb-3 text-xs text-content-muted">Utilidad del período (intereses + mora − gastos)</p>
      <dl className="space-y-2 border-t border-line pt-3 text-sm">
        <div className="flex justify-between"><dt className="text-content-muted">Capital colocado</dt><dd className="money font-medium text-content">{rd(s.capital.colocado)}</dd></div>
        <div className="flex justify-between"><dt className="text-content-muted">Intereses + mora cobrados</dt><dd className="money font-medium text-content">{rd(ingresos)}</dd></div>
        <div className="flex justify-between"><dt className="text-content-muted">Gastos</dt><dd className="money font-medium text-danger">{rd(s.gastos)}</dd></div>
      </dl>
    </Panel>
  )
}

/* ─────────────────── Comparación de períodos (Business) ─────────────────── */

type CmpRow = { label: string; before: number; now: number; upIsGood: boolean }

export function PeriodComparisonPanel() {
  const current = useSummary('month')
  const previous = useSummary('last_month')
  const c = current.data
  const p = previous.data
  if (!c || !p) return null
  const rows: CmpRow[] = [
    { label: 'Cobrado', before: p.cobros_periodo.total_cobrado, now: c.cobros_periodo.total_cobrado, upIsGood: true },
    { label: 'Intereses cobrados', before: p.ingresos.interes_cobrado, now: c.ingresos.interes_cobrado, upIsGood: true },
    { label: 'Mora cobrada', before: p.ingresos.mora_cobrada, now: c.ingresos.mora_cobrada, upIsGood: true },
    { label: 'Gastos', before: p.gastos, now: c.gastos, upIsGood: false },
    { label: 'Resultado', before: p.resultado, now: c.resultado, upIsGood: true }
  ]
  return (
    <Panel title="Comparación de períodos" icon={BarChart3} action={{ to: '/reportes?tab=movimientos', label: 'Ver más' }}>
      <div className="overflow-x-auto">
        <table className="table-modern">
          <thead>
            <tr>
              <th>Métrica</th>
              <th className="text-right">Mes anterior</th>
              <th className="text-right">Este mes</th>
              <th className="text-right">Variación</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const change = pctChange(r.now, r.before)
              const good = change === null ? null : r.upIsGood ? change >= 0 : change <= 0
              return (
                <tr key={r.label}>
                  <td className="font-medium text-content">{r.label}</td>
                  <td className="money text-right text-content-muted">{rd(r.before)}</td>
                  <td className="money text-right text-content">{rd(r.now)}</td>
                  <td className={`text-right text-xs font-semibold ${good === null ? 'text-content-muted' : good ? 'text-success-text' : 'text-danger'}`}>
                    {change === null ? '—' : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}%`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

/* ─────────────── Concentración de cartera (Business) ─────────────── */

type Concentration = {
  total_pending: number; top5_percent: number; top10_percent: number; top20_percent: number
  top: { client_id: string; client_name: string; pending: number; loans: number }[]
}

export function ConcentrationPanel() {
  const query = useQuery({
    queryKey: ['dashboard_concentration'],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('portfolio_concentration')
      if (error) throw error
      return data as Concentration
    }
  })
  if (query.error || !query.data) return null
  const d = query.data
  const bars = [
    { label: 'Top 5 clientes', v: Number(d.top5_percent) },
    { label: 'Top 10 clientes', v: Number(d.top10_percent) },
    { label: 'Top 20 clientes', v: Number(d.top20_percent) }
  ]
  return (
    <Panel title="Concentración de cartera" icon={Users}>
      {Number(d.total_pending) === 0 ? (
        <p className="py-4 text-sm text-content-muted">Sin cartera activa.</p>
      ) : (
        <>
          <div className="space-y-3">
            {bars.map((b) => (
              <div key={b.label}>
                <div className="mb-1 flex justify-between text-xs text-content-muted"><span>{b.label}</span><span className="font-semibold text-content">{b.v}%</span></div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-primary/10" role="progressbar" aria-valuenow={b.v} aria-valuemin={0} aria-valuemax={100} aria-label={b.label}>
                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary-dark transition-[width] duration-700 ease-out" style={{ width: `${Math.min(100, b.v)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="t-label mb-1 mt-4">Mayores saldos</p>
          <ul className="divide-y divide-line">
            {d.top.slice(0, 5).map((t) => (
              <li key={t.client_id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <Link to={`/clientes/${t.client_id}`} className="truncate font-medium text-content hover:text-primary">{t.client_name}</Link>
                <span className="money shrink-0 text-content-muted">
                  {rd(Number(t.pending))} · {((Number(t.pending) / Number(d.total_pending)) * 100).toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}

/* ──────────────────────── Reportes ──────────────────────── */

const REPORT_LINKS = [
  { tab: 'financiero', label: 'Reporte financiero' },
  { tab: 'movimientos', label: 'Movimientos y comparación' },
  { tab: 'cartera', label: 'Cartera' },
  { tab: 'actividad', label: 'Rendimiento por colaborador' },
  { tab: 'comisiones', label: 'Comisiones' },
  { tab: 'riesgo', label: 'Riesgo' }
]

export function AdvancedReportsPanel() {
  return (
    <Panel title="Reportes avanzados" icon={FileText} action={{ to: '/reportes', label: 'Ver todos' }}>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_LINKS.map((r) => (
          <li key={r.tab}>
            <Link to={`/reportes?tab=${r.tab}`} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm font-medium text-content transition-colors hover:border-primary/40 hover:bg-primary/10">
              {r.label}
              <ArrowRight size={14} className="text-content-muted" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-content-muted">Cada reporte se puede exportar a CSV, Excel o PDF.</p>
    </Panel>
  )
}

export function BasicReportsPanel() {
  return (
    <Panel title="Reportes básicos" icon={FileText} action={{ to: '/reportes', label: 'Abrir reportes' }}>
      <Link to="/reportes" className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm font-medium text-content transition-colors hover:border-primary/40 hover:bg-primary/10">
        Reporte financiero del período
        <ArrowRight size={14} className="text-content-muted" aria-hidden="true" />
      </Link>
      <p className="mt-3 text-xs text-content-muted">Puedes exportarlo a CSV. En el plan Pro se suman PDF, Excel y todos los reportes.</p>
    </Panel>
  )
}

/* ─────────────────── Solicitudes de préstamo ─────────────────── */

type FunnelBucket = { count: number; amount: number }
type Funnel = { 'new': FunnelBucket; in_review: FunnelBucket; approved: FunnelBucket; rejected: FunnelBucket; disbursed: FunnelBucket }

export function ApplicationsFunnelPanel() {
  const c = useChartColors()
  const query = useQuery({
    queryKey: ['dashboard_applications_summary'],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('applications_summary')
      if (error) throw error
      return data as Funnel
    }
  })
  if (query.error) return null
  const d = query.data
  const meta: { key: keyof Funnel; label: string; color: string }[] = [
    { key: 'new', label: 'Nuevas', color: c.c('primary') },
    { key: 'in_review', label: 'En evaluación', color: c.c('warning') },
    { key: 'approved', label: 'Aprobadas', color: c.c('success') },
    { key: 'rejected', label: 'Rechazadas', color: c.c('danger') }
  ]
  const max = d ? Math.max(1, ...meta.map((m) => Number(d[m.key].count))) : 1
  return (
    <Panel title="Solicitudes de préstamo" icon={ClipboardList} action={{ to: '/solicitudes', label: 'Ver solicitudes' }}>
      {!d ? (
        <p className="text-sm text-content-muted">Cargando…</p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {meta.map((m) => (
              <div key={m.key} className="rounded-xl border border-line p-2">
                <p className="t-kpi money text-content">{Number(d[m.key].count)}</p>
                <p className="text-[11px] text-content-muted">{m.label}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2.5">
            {meta.map((m) => (
              <div key={m.key}>
                <div className="mb-1 flex justify-between text-xs text-content-muted">
                  <span>{m.label}</span><span className="money font-medium text-content">{rd(Number(d[m.key].amount))}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-primary/10">
                  <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${(Number(d[m.key].count) / max) * 100}%`, backgroundColor: m.color }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  )
}

/* ─────────────── Comparativo por sucursal (Business) ─────────────── */

type BranchRow = {
  branch_id: string | null; name: string; is_active: boolean; cartera_total: number; cartera_vencida: number
  par: number; cobrado: number; prestamos_activos: number; clientes_activos: number
}

export function BranchComparisonPanel({ period }: { period: string }) {
  const query = useQuery({
    queryKey: ['dashboard_branch_comparison', period],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('branch_comparison', { p_period: period })
      if (error) throw error
      return (data as { branches: BranchRow[] }).branches
    }
  })
  if (query.error) return null
  const rows = query.data ?? []
  const hasBranches = rows.some((r) => r.branch_id !== null)
  return (
    <Panel title="Sucursales" icon={Landmark} action={{ to: '/configuracion', label: 'Administrar' }}>
      {!query.data ? (
        <p className="text-sm text-content-muted">Cargando…</p>
      ) : !hasBranches ? (
        <p className="py-4 text-sm text-content-muted">Aún no tienes sucursales. Créalas en Configuración → Sucursales para comparar su desempeño.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Sucursal</th>
                <th className="text-right">Cartera</th>
                <th className="text-right">Vencida</th>
                <th className="text-right">Cobrado</th>
                <th className="text-right">Préstamos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.branch_id ?? 'none'}>
                  <td className={`font-medium ${r.is_active ? 'text-content' : 'text-content-muted'}`}>{r.name}{!r.is_active ? ' (inactiva)' : ''}</td>
                  <td className="money text-right text-content-muted">{rd(Number(r.cartera_total))}</td>
                  <td className={`text-right text-xs font-semibold ${Number(r.par) >= 10 ? 'text-danger' : 'text-content-muted'}`}>{Number(r.par)}%</td>
                  <td className="money text-right font-medium text-success-text">{rd(Number(r.cobrado))}</td>
                  <td className="text-right text-content-muted">{r.prestamos_activos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
