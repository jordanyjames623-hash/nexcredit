import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Sparkles, MessageCircle, X, SlidersHorizontal, ChevronUp, ChevronDown, Eye, EyeOff,
  Landmark, Wallet, CircleDollarSign, CalendarClock, Users, HandCoins, AlertTriangle, Gauge, Percent, ShieldAlert, UserCheck
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth, type DashboardWidgets } from '@/contexts/AuthContext'
import { upgradeWhatsappLink, usePlanLimits, PLAN_NAME_ES } from '@/components/UpgradeToProModal'
import { PlanComparisonModal } from '@/components/PlanComparisonModal'
import {
  PERIODS, KpiTile, Skeleton, money, pctChange, useSummary, useRisk, useMonthlyCollections, usePortfolioHistory,
  type CalendarRow, type Summary, type Risk
} from '@/components/dashboard/shared'
import {
  UpcomingPaymentsPanel, RecentPaymentsPanel, AlertsPanel, CollectionGoalPanel, CollectionManagementPanel,
  EmployeePerformancePanel, ProfitabilityPanel, PeriodComparisonPanel, ConcentrationPanel, AdvancedReportsPanel,
  BasicReportsPanel, ApplicationsFunnelPanel, BranchComparisonPanel, AttentionStrip, RecentActivityPanel
} from '@/components/dashboard/Panels'
import {
  MonthlyCollectionsPanel, AgingPanel, RiskAnalysisPanel, IncomePeriodPanel, TrendPanel, RiskLevelsPanel, CashflowPanel
} from '@/components/dashboard/ChartPanels'
import { HomeHero, HomeQuickActions, TodayCollections } from '@/components/dashboard/HomeSections'

type BranchKpis = {
  cartera_total: number; cartera_vencida: number; par: number; cobrado: number; intereses_cobrados: number
  monto_a_cobrar: number; prestamos_activos: number; clientes_activos: number
}
type SnapshotPrev = { cartera_total: number; cartera_vencida: number; par: number } | null

/* ───────────── Registro de widgets del dashboard ejecutivo ─────────────
   span = ancho en una cuadrícula de 6 columnas (2 = un tercio, 3 = mitad, 4 = dos tercios, 6 = completo). */

type Span = 2 | 3 | 4 | 6
const SPAN_CLASS: Record<Span, string> = { 2: 'lg:col-span-2', 3: 'lg:col-span-3', 4: 'lg:col-span-4', 6: 'lg:col-span-6' }

const WIDGET_META: { id: string; label: string; span: Span; businessOnly?: boolean }[] = [
  { id: 'monthly', label: 'Cobros de los últimos 6 meses', span: 4 },
  { id: 'aging', label: 'Cartera por estado', span: 2 },
  { id: 'goal', label: 'Meta de cobranza', span: 3 },
  { id: 'trend', label: 'Morosidad (tendencia)', span: 3 },
  { id: 'risk', label: 'Análisis de riesgo', span: 3 },
  { id: 'risklevels', label: 'Riesgo por cliente', span: 3 },
  { id: 'cashflow', label: 'Flujo de caja', span: 3 },
  { id: 'collection', label: 'Gestión de cobranza', span: 3 },
  { id: 'profit', label: 'Rentabilidad', span: 3 },
  { id: 'funnel', label: 'Solicitudes de préstamo', span: 3 },
  { id: 'activity', label: 'Actividad reciente', span: 3 },
  { id: 'upcoming', label: 'Próximos cobros', span: 3 },
  { id: 'alerts', label: 'Alertas', span: 3 },
  { id: 'income', label: 'Ingresos del período', span: 3 },
  { id: 'comparison', label: 'Comparación de períodos', span: 3, businessOnly: true },
  { id: 'concentration', label: 'Concentración de cartera', span: 3, businessOnly: true },
  { id: 'branches', label: 'Sucursales', span: 6, businessOnly: true },
  { id: 'employees', label: 'Rendimiento de empleados', span: 6 },
  { id: 'reports', label: 'Reportes avanzados', span: 6 }
]

type WidgetCtx = { s: Summary; period: string; upcoming: CalendarRow[]; branchId: string | null }

function renderWidget(id: string, ctx: WidgetCtx): ReactNode {
  switch (id) {
    case 'monthly': return <MonthlyCollectionsPanel />
    case 'aging': return <AgingPanel branchId={ctx.branchId} />
    case 'goal': return <CollectionGoalPanel />
    case 'trend': return <TrendPanel />
    case 'risk': return <RiskAnalysisPanel />
    case 'risklevels': return <RiskLevelsPanel />
    case 'cashflow': return <CashflowPanel />
    case 'collection': return <CollectionManagementPanel />
    case 'profit': return <ProfitabilityPanel s={ctx.s} />
    case 'funnel': return <ApplicationsFunnelPanel />
    case 'activity': return <RecentActivityPanel />
    case 'upcoming': return <UpcomingPaymentsPanel rows={ctx.upcoming} linkTo="/calendario" />
    case 'alerts': return <AlertsPanel linkTo="/cobranza" />
    case 'income': return <IncomePeriodPanel period={ctx.period} />
    case 'comparison': return <PeriodComparisonPanel />
    case 'concentration': return <ConcentrationPanel />
    case 'branches': return <BranchComparisonPanel period={ctx.period} />
    case 'employees': return <EmployeePerformancePanel />
    case 'reports': return <AdvancedReportsPanel />
    default: return null
  }
}

// Orden y visibilidad: solo si el negocio tiene la función "dashboard_personalizado" se puede
// personalizar; si no la tiene, siempre ve el diseño por defecto.
function resolveWidgets(canCustomize: boolean, saved: DashboardWidgets | null | undefined): string[] {
  const available = WIDGET_META.filter((w) => canCustomize || !w.businessOnly).map((w) => w.id)
  if (!canCustomize || !saved) return available
  const order = (saved.order ?? []).filter((id) => available.includes(id))
  const rest = available.filter((id) => !order.includes(id))
  const hidden = saved.hidden ?? []
  return [...order, ...rest].filter((id) => !hidden.includes(id))
}

/* ───────────────────────────── Página ───────────────────────────── */

export function Dashboard() {
  const { profile, business, isOwner, hasFeature, session } = useAuth()
  const [period, setPeriod] = useState('month')
  const [bannerOpen, setBannerOpen] = useState(true)
  const [branchId, setBranchId] = useState('')
  const [customizing, setCustomizing] = useState(false)
  const [comparingPlans, setComparingPlans] = useState(false)
  const plan = business?.subscription_plan ?? 'basic'
  const isPaid = plan !== 'basic'
  const canUseBranches = hasFeature('sucursales')
  const canCustomizeDashboard = hasFeature('dashboard_personalizado')
  const { data: planLimits } = usePlanLimits()
  const proLimit = planLimits?.find((l) => l.plan === 'pro')
  const businessLimit = planLimits?.find((l) => l.plan === 'business')

  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)
  const weekEndIso = new Date(today.getTime() + 6 * 86400000).toISOString().slice(0, 10)
  const rawName = (profile?.full_name || '').trim().split(' ')[0]
  const firstName = rawName.charAt(0).toUpperCase() + rawName.slice(1)
  const hour = today.getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  const dateLabel = today.toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' })

  // Foto diaria de la cartera (base de la tendencia de morosidad). Solo la toma el propietario.
  useEffect(() => {
    if (isOwner) supabase.rpc('record_portfolio_snapshot').then(() => undefined, () => undefined)
  }, [isOwner])

  const summaryQuery = useSummary(period)
  const previousQuery = useSummary('last_month', isPaid)
  const riskQuery = useRisk(isPaid)

  const calendarQuery = useQuery({
    queryKey: ['dashboard_calendar_strip'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('collection_calendar', { p_from: todayIso, p_to: weekEndIso })
      if (error) throw error
      return data as CalendarRow[]
    }
  })

  const clientsCountQuery = useQuery({
    queryKey: ['dashboard_clients_count'],
    queryFn: async () => {
      const { count, error } = await supabase.from('clients').select('id', { count: 'exact', head: true }).is('deleted_at', null)
      if (error) throw error
      return count ?? 0
    }
  })

  const activeClientsQuery = useQuery({
    queryKey: ['dashboard_active_clients_count'],
    enabled: isPaid,
    queryFn: async () => {
      const { count, error } = await supabase.from('client_balances').select('client_id', { count: 'exact', head: true }).gt('active_loans', 0)
      if (error) throw error
      return count ?? 0
    }
  })

  const prevSnapshotQuery = useQuery({
    queryKey: ['dashboard_prev_snapshot'],
    enabled: isPaid && isOwner,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('portfolio_previous_snapshot', { p_min_days: 28 })
      if (error) throw error
      return data as SnapshotPrev
    }
  })

  const branchesQuery = useQuery({
    queryKey: ['dashboard_branches'],
    enabled: canUseBranches && isOwner,
    queryFn: async () => {
      const { data, error } = await supabase.from('branches').select('id, name').eq('is_active', true).order('name')
      if (error) throw error
      return data as { id: string; name: string }[]
    }
  })

  const branchQuery = useQuery({
    queryKey: ['branch_dashboard', branchId, period],
    enabled: canUseBranches && isOwner && branchId !== '',
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('branch_dashboard', { p_branch: branchId, p_period: period })
      if (error) throw error
      return data as BranchKpis
    }
  })

  const s = summaryQuery.data
  const prev = previousQuery.data
  const risk = riskQuery.data
  const branches = branchesQuery.data ?? []
  const branchName = branches.find((b) => b.id === branchId)?.name ?? null
  const periodLabel = PERIODS.find((p) => p.v === period)?.l ?? ''
  const upcoming = (calendarQuery.data ?? []).filter((r) => r.status !== 'paid').slice(0, 5)
  const todayRows = (calendarQuery.data ?? []).filter((r) => r.due_date === todayIso && r.status !== 'paid')
  const collectionRate = s && s.cobros_periodo.monto_a_cobrar > 0
    ? Math.min(100, (s.cobros_periodo.total_cobrado / s.cobros_periodo.monto_a_cobrar) * 100)
    : null
  // Hero (maqueta v86): misma cartera que el resumen ejecutivo (o la de la sucursal elegida).
  const heroCartera = s
    ? (branchId !== '' && branchQuery.data ? Number(branchQuery.data.cartera_total)
      : plan !== 'basic' && risk ? Number(risk.cartera_total) : s.capital.pendiente)
    : 0

  // "Este mes" se compara contra el mes anterior; la cartera, contra la foto de hace ~30 días.
  const cobradoDelta = period === 'month' && s && prev
    ? pctChange(s.cobros_periodo.total_cobrado, prev.cobros_periodo.total_cobrado) : null
  const interesDelta = period === 'month' && s && prev
    ? pctChange(s.ingresos.interes_cobrado, prev.ingresos.interes_cobrado) : null
  const snap = prevSnapshotQuery.data
  const carteraDelta = snap && risk ? pctChange(Number(risk.cartera_total), Number(snap.cartera_total)) : null
  const vencidaDelta = snap && risk ? pctChange(Number(risk.cartera_vencida), Number(snap.cartera_vencida)) : null

  const showBanner = isOwner && bannerOpen && (plan === 'basic' || plan === 'pro')
  const bannerTarget = plan === 'basic' ? 'Pro' : 'Business'

  return (
    <div className="space-y-6">
      {showBanner && (
        <div className="glass-card flex flex-wrap items-center justify-between gap-3 !border-primary/30 !bg-primary/5 p-4">
          <div className="flex items-center gap-3">
            <Sparkles size={18} className="shrink-0 text-primary" aria-hidden="true" />
            {plan === 'basic' ? (
              <p className="text-sm text-content">
                Estás en el plan Básico. Pasa a <span className="font-semibold text-primary-dark">Pro por {proLimit?.price_label ?? '$9.99/mes'}</span> y desbloquea
                {proLimit?.max_clients ? ` hasta ${proLimit.max_clients} clientes` : ' clientes'}
                {proLimit?.max_loans ? ` y ${proLimit.max_loans} préstamos` : ' y préstamos'}, colaboradores, cobranza y más.
              </p>
            ) : (
              <p className="text-sm text-content">
                Estás en el plan Pro. Pasa a <span className="font-semibold text-primary-dark">Business por {businessLimit?.price_label ?? '$29.99/mes'}</span> y desbloquea sucursales, concentración de cartera, personalización del dashboard y API.
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setComparingPlans(true)} className="text-xs font-medium text-primary hover:underline">Ver más</button>
            <a href={upgradeWhatsappLink(bannerTarget, business?.name, business?.owner_name, PLAN_NAME_ES[plan], session?.user.email)} target="_blank" rel="noopener noreferrer" className="btn-solid !px-3 !py-2 text-xs">
              <MessageCircle size={14} aria-hidden="true" /> Pasar a {bannerTarget}
            </a>
            <button onClick={() => setBannerOpen(false)} className="rounded-lg p-1 text-content-muted transition-colors hover:text-content" aria-label="Cerrar aviso">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* 1 · Bienvenida y controles */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="t-label">{dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}</p>
          <h1 className="t-h1 truncate text-content">{greeting}{firstName ? `, ${firstName}` : ''}</h1>
          <p className="text-sm text-content-muted">{isPaid ? 'Dashboard ejecutivo de tu negocio.' : 'Aquí tienes el resumen de tu negocio.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canUseBranches && isOwner && branches.length > 0 && (
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="field-input !w-auto !py-2 text-sm" aria-label="Sucursal">
              <option value="">Todas las sucursales</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="field-input !w-auto !py-2 text-sm" aria-label="Período">
            {PERIODS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          {canCustomizeDashboard && isOwner && (
            <button onClick={() => setCustomizing((v) => !v)} className="btn-secondary !px-3 !py-2 text-xs" aria-expanded={customizing}>
              <SlidersHorizontal size={14} aria-hidden="true" /> Personalizar
            </button>
          )}
        </div>
      </div>

      {/* Inicio nuevo (maqueta v86): hero, acciones grandes y cobros de hoy */}
      {s && <HomeHero carteraTotal={heroCartera} pagosHoy={s.cartera.pagos_hoy} cuotasHoy={todayRows.length} />}
      <HomeQuickActions />
      {s && <TodayCollections rows={todayRows} />}

      {/* 2 · Qué necesita atención */}
      <AttentionStrip isBasic={!isPaid} />

      {customizing && canCustomizeDashboard && isOwner && (
        <DashboardCustomizer saved={profile?.dashboard_widgets} onClose={() => setCustomizing(false)} />
      )}

      {branchId !== '' && branchName && (
        <p className="rounded-xl bg-primary/10 px-3 py-2 text-xs text-content-muted">
          Mostrando <span className="font-semibold text-content">{branchName}</span>: los indicadores y la cartera por estado son de esta sucursal; el resto de los paneles muestra todo el negocio.
        </p>
      )}
      {branchQuery.error && <p className="text-sm text-danger" role="alert">No se pudo cargar la sucursal; se muestran los datos de todo el negocio.</p>}

      {summaryQuery.isLoading && <DashboardSkeleton />}
      {summaryQuery.error && <p className="text-sm text-danger" role="alert">No se pudo cargar el resumen.</p>}

      {s && plan === 'basic' && (
        <FreeLayout
          s={s} periodLabel={periodLabel} upcoming={upcoming}
          clientsCount={clientsCountQuery.data} collectionRate={collectionRate}
        />
      )}

      {s && plan !== 'basic' && (
        branchId !== '' && branchQuery.isLoading ? (
          <DashboardSkeleton />
        ) : (
          <ExecutiveLayout
            s={s} plan={plan} period={period} periodLabel={periodLabel} upcoming={upcoming}
            collectionRate={collectionRate} activeClients={activeClientsQuery.data} risk={risk}
            cobradoDelta={cobradoDelta} interesDelta={interesDelta} carteraDelta={carteraDelta} vencidaDelta={vencidaDelta}
            branch={branchQuery.data} branchId={branchId === '' ? null : branchId} saved={profile?.dashboard_widgets}
          />
        )
      )}

      {comparingPlans && <PlanComparisonModal onClose={() => setComparingPlans(false)} />}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando resumen" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 !rounded-2xl" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-6">
        <Skeleton className="h-72 !rounded-2xl lg:col-span-4" />
        <Skeleton className="h-72 !rounded-2xl lg:col-span-2" />
      </div>
    </div>
  )
}

/* ───────────────────────── Plan Básico ───────────────────────── */

function FreeLayout({ s, periodLabel, upcoming, clientsCount, collectionRate }: {
  s: Summary; periodLabel: string; upcoming: CalendarRow[]; clientsCount: number | undefined; collectionRate: number | null
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile icon={Landmark} label="Capital colocado" value={`RD$ ${money(s.capital.colocado)}`} sub={periodLabel} />
        <KpiTile icon={Wallet} label="Cartera pendiente" value={`RD$ ${money(s.capital.pendiente)}`} sub="Capital por cobrar" />
        <KpiTile icon={CircleDollarSign} label={`Cobrado · ${periodLabel}`} value={`RD$ ${money(s.cobros_periodo.total_cobrado)}`} tone="paid" />
        <KpiTile icon={CalendarClock} label="Cobros de hoy" value={`RD$ ${money(s.cartera.pagos_hoy)}`} sub="Por cobrar hoy" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile icon={Users} label="Total de clientes" value={clientsCount === undefined ? '—' : String(clientsCount)} />
        <KpiTile icon={HandCoins} label="Préstamos activos" value={String(s.cartera.prestamos_activos)} />
        <KpiTile icon={AlertTriangle} label="Vencidos" value={String(s.cartera.prestamos_vencidos)} tone={s.cartera.prestamos_vencidos > 0 ? 'due' : 'ink'} />
        <KpiTile icon={Gauge} label="Tasa de cobro" value={collectionRate === null ? '—' : `${collectionRate.toFixed(0)}%`} sub="Cobrado ÷ por cobrar del período" />
      </div>

      <div className="grid gap-4 lg:grid-cols-6">
        <div className="flex flex-col [&>section]:flex-1 lg:col-span-4"><MonthlyCollectionsPanel /></div>
        <div className="flex flex-col [&>section]:flex-1 lg:col-span-2"><AlertsPanel /></div>
        <div className="flex flex-col [&>section]:flex-1 lg:col-span-4"><UpcomingPaymentsPanel rows={upcoming} /></div>
        <div className="flex flex-col [&>section]:flex-1 lg:col-span-2"><RecentPaymentsPanel linkTo="/pagos" /></div>
        <div className="lg:col-span-6"><BasicReportsPanel /></div>
      </div>
    </>
  )
}

/* ───────────────────── Planes Pro y Business ───────────────────── */

type ExecProps = {
  s: Summary; plan: 'pro' | 'business'; period: string; periodLabel: string; upcoming: CalendarRow[]
  collectionRate: number | null; activeClients: number | undefined; risk: Risk | undefined
  cobradoDelta: number | null; interesDelta: number | null; carteraDelta: number | null; vencidaDelta: number | null
  branch: BranchKpis | undefined; branchId: string | null; saved: DashboardWidgets | null | undefined
}

function ExecutiveLayout(props: ExecProps) {
  const {
    s, period, periodLabel, upcoming, collectionRate, activeClients, risk,
    cobradoDelta, interesDelta, carteraDelta, vencidaDelta, branch, branchId, saved
  } = props
  const { isOwner, hasFeature } = useAuth()
  const canCustomizeDashboard = hasFeature('dashboard_personalizado')
  // Con una sucursal elegida, los indicadores salen de esa sucursal (sin comparaciones históricas).
  const b = branchId ? branch : undefined

  // Mini gráficos: solo donde hay series reales (cobros por mes y morosidad histórica).
  const collections = useMonthlyCollections()
  const history = usePortfolioHistory(isOwner)
  const sparkCobrado = !b && period === 'month' ? (collections.data ?? []).map((m) => Number(m.total)) : undefined
  const sparkPar = !b ? (history.data ?? []).map((p) => Number(p.par)) : undefined

  const carteraTotal = b ? Number(b.cartera_total) : risk ? Number(risk.cartera_total) : s.capital.pendiente
  const cobrado = b ? Number(b.cobrado) : s.cobros_periodo.total_cobrado
  const intereses = b ? Number(b.intereses_cobrados) : s.ingresos.interes_cobrado
  const vencida = b ? Number(b.cartera_vencida) : risk ? Number(risk.cartera_vencida) : undefined
  const rate = b
    ? (Number(b.monto_a_cobrar) > 0 ? Math.min(100, (Number(b.cobrado) / Number(b.monto_a_cobrar)) * 100) : null)
    : collectionRate
  const par = b ? Number(b.par) : risk ? Number(risk.par) : undefined
  const clientes = b ? b.clientes_activos : activeClients
  const prestamos = b ? b.prestamos_activos : s.cartera.prestamos_activos
  const parTone: 'ink' | 'due' | 'gold' | 'paid' = par === undefined ? 'ink' : par >= 10 ? 'due' : par >= 5 ? 'gold' : 'paid'

  const ids = resolveWidgets(canCustomizeDashboard, saved)
  const ctx: WidgetCtx = { s, period, upcoming, branchId }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile icon={Wallet} label="Cartera total" value={`RD$ ${money(carteraTotal)}`} sub="Capital + intereses por cobrar"
          delta={b ? null : carteraDelta} deltaLabel="vs. hace 30 días" upIsGood={true} />
        <KpiTile icon={CircleDollarSign} label={`Cobrado · ${periodLabel}`} value={`RD$ ${money(cobrado)}`} tone="paid"
          delta={b ? null : cobradoDelta} spark={sparkCobrado} />
        <KpiTile icon={Percent} label="Intereses generados" value={`RD$ ${money(intereses)}`} tone="gold" delta={b ? null : interesDelta} sub={periodLabel} />
        <KpiTile icon={AlertTriangle} label="Cartera vencida" value={vencida === undefined ? '—' : `RD$ ${money(vencida)}`} tone="due"
          delta={b ? null : vencidaDelta} deltaLabel="vs. hace 30 días" upIsGood={false} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile icon={Gauge} label="Tasa de recuperación" value={rate === null ? '—' : `${rate.toFixed(1)}%`} sub="Cobrado ÷ por cobrar del período" />
        <KpiTile icon={ShieldAlert} label="Riesgo de cartera" value={par === undefined ? '—' : `${par}%`} tone={parTone} sub="PAR: cartera vencida ÷ total" spark={sparkPar} />
        <KpiTile icon={UserCheck} label="Clientes activos" value={clientes === undefined ? '—' : String(clientes)} sub="Con préstamo activo" />
        <KpiTile icon={HandCoins} label="Préstamos activos" value={String(prestamos)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-6">
        {ids.map((id) => {
          const meta = WIDGET_META.find((w) => w.id === id)
          const node = renderWidget(id, ctx)
          return meta
            ? <div key={id} className={`min-w-0 flex flex-col [&>section]:flex-1 ${SPAN_CLASS[meta.span]}`}>{node}</div>
            : <Fragment key={id}>{node}</Fragment>
        })}
      </div>
    </>
  )
}

/* ───────────────── Personalizar dashboard (Business) ───────────────── */

function DashboardCustomizer({ saved, onClose }: { saved: DashboardWidgets | null | undefined; onClose: () => void }) {
  const { profile, refreshProfile } = useAuth()
  const knownIds = WIDGET_META.map((m) => m.id)
  const savedOrder = (saved?.order ?? []).filter((id) => knownIds.includes(id))
  const [order, setOrder] = useState<string[]>([...savedOrder, ...knownIds.filter((id) => !savedOrder.includes(id))])
  const [hidden, setHidden] = useState<string[]>((saved?.hidden ?? []).filter((id) => knownIds.includes(id)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= order.length) return
    const next = [...order]
    const tmp = next[index]
    next[index] = next[target]
    next[target] = tmp
    setOrder(next)
  }

  function toggle(id: string) {
    setHidden((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))
  }

  async function persist(value: DashboardWidgets | null) {
    if (!profile) return
    setSaving(true)
    setError(null)
    const { error: updateError } = await supabase.from('profiles').update({ dashboard_widgets: value }).eq('id', profile.id)
    setSaving(false)
    if (updateError) { setError(updateError.message); return }
    await refreshProfile()
    onClose()
  }

  return (
    <section className="glass-card p-5" aria-label="Personalizar dashboard">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-content">Personalizar mi dashboard</h2>
        <button onClick={onClose} className="rounded-lg p-1 text-content-muted transition-colors hover:text-content" aria-label="Cerrar"><X size={16} /></button>
      </div>
      <p className="mb-3 text-xs text-content-muted">Elige qué paneles ver y en qué orden. Es solo para tu usuario.</p>
      {error && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      <ul className="divide-y divide-line rounded-xl border border-line">
        {order.map((id, i) => {
          const meta = WIDGET_META.find((m) => m.id === id)
          const isHidden = hidden.includes(id)
          return (
            <li key={id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className={`text-sm ${isHidden ? 'text-content-muted line-through' : 'text-content'}`}>{meta?.label ?? id}</span>
              <span className="flex items-center gap-1">
                <button onClick={() => toggle(id)} className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-primary/10 hover:text-primary" aria-label={isHidden ? 'Mostrar' : 'Ocultar'}>
                  {isHidden ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-30" aria-label="Subir"><ChevronUp size={15} /></button>
                <button onClick={() => move(i, 1)} disabled={i === order.length - 1} className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-30" aria-label="Bajar"><ChevronDown size={15} /></button>
              </span>
            </li>
          )
        })}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => persist({ order, hidden })} disabled={saving} data-loading={saving} className="btn-solid">Guardar</button>
        <button onClick={() => persist(null)} disabled={saving} className="btn-secondary">Restablecer</button>
      </div>
    </section>
  )
}
