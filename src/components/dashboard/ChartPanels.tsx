import { useId, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts'
import { TrendingUp, Layers, ShieldAlert, BarChart3, Activity, UserCheck, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { shortDate } from '@/lib/format'
import { useChartColors } from '@/hooks/useChartColors'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { ChartTooltip } from '@/components/ui/ChartTooltip'
import { Panel, money, compact, useSummary, useRisk, useMonthlyCollections, usePortfolioHistory } from './shared'

const rd = (v: number) => `RD$ ${money(v)}`

/* ───────────── Cobros de los últimos 6 meses (gráfica principal) ───────────── */

export function MonthlyCollectionsPanel() {
  const query = useMonthlyCollections()
  const c = useChartColors()
  const reduced = useReducedMotion()
  const gradientId = useId().replace(/:/g, '')
  const data = useMemo(
    () => (query.data ?? []).map((m) => ({
      mes: new Date(m.month + 'T00:00:00').toLocaleDateString('es-DO', { month: 'short' }),
      monto: Number(m.total)
    })),
    [query.data]
  )
  if (query.error) return null
  const total = data.reduce((sum, d) => sum + d.monto, 0)
  const tick = { fontSize: 11, fill: c.c('text-muted') }

  return (
    <Panel title="Cobros de los últimos 6 meses" icon={TrendingUp}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
        <p className="t-kpi money text-content"><span className="mr-1 text-[0.55em] font-semibold text-content-muted">RD$</span>{money(total)}</p>
        <span className="text-xs text-content-muted">cobrado en el período</span>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.c('primary')} stopOpacity={0.32} />
                <stop offset="100%" stopColor={c.c('primary')} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={c.c('line', 0.8)} strokeDasharray="3 4" />
            <XAxis dataKey="mes" tick={tick} axisLine={false} tickLine={false} />
            <YAxis tick={tick} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => compact(v)} />
            <Tooltip cursor={{ stroke: c.c('primary', 0.35), strokeWidth: 1 }} content={<ChartTooltip format={rd} title="Cobrado" />} />
            <Area
              type="monotone" dataKey="monto" stroke={c.c('primary')} strokeWidth={2.5} fill={`url(#${gradientId})`}
              dot={{ r: 3, fill: c.c('surface'), stroke: c.c('primary'), strokeWidth: 2 }} activeDot={{ r: 5 }}
              isAnimationActive={!reduced} animationDuration={700}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}

/* ─────────────────────── Cartera por estado (antigüedad) ─────────────────────── */

type Bucket = { count: number; amount: number }
type Aging = { al_dia: Bucket; d1_30: Bucket; d31_60: Bucket; d61_90: Bucket; d90_plus: Bucket }

const AGING_KEYS: { key: keyof Aging; label: string }[] = [
  { key: 'al_dia', label: 'Al día' },
  { key: 'd1_30', label: '1–30 días' },
  { key: 'd31_60', label: '31–60 días' },
  { key: 'd61_90', label: '61–90 días' },
  { key: 'd90_plus', label: '90+ días' }
]

export function AgingPanel({ branchId }: { branchId?: string | null }) {
  const c = useChartColors()
  const reduced = useReducedMotion()
  const query = useQuery({
    queryKey: ['dashboard_aging', branchId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_aging', { p_branch: branchId ?? null })
      if (error) throw error
      return data as Aging
    }
  })
  if (query.error) return null
  const a = query.data
  // Verde (sano) → ámbar → rojos cada vez más intensos: el color solo comunica gravedad.
  const colors = [c.c('success'), c.c('warning'), c.c('danger', 0.55), c.c('danger', 0.8), c.c('danger')]
  const total = a ? AGING_KEYS.reduce((sum, k) => sum + Number(a[k.key].amount), 0) : 0
  const donut = a ? AGING_KEYS.map((k, i) => ({ name: k.label, value: Number(a[k.key].amount), color: colors[i] })) : []
  const healthy = a && total > 0 ? Math.round((Number(a.al_dia.amount) / total) * 100) : 0

  return (
    <Panel title="Cartera por estado" icon={Layers} action={{ to: '/cobranza', label: 'Ver cobranza' }}>
      {!a || total === 0 ? (
        <p className="py-8 text-center text-sm text-content-muted">Sin cartera activa.</p>
      ) : (
        <div className="flex items-center gap-5">
          <div className="relative h-36 w-36 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<ChartTooltip format={rd} />} />
                <Pie data={donut} dataKey="value" innerRadius={46} outerRadius={66} paddingAngle={2} cornerRadius={4} stroke="none"
                  isAnimationActive={!reduced} animationDuration={700}>
                  {donut.map((d) => <Cell key={d.name} fill={d.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="money text-xl font-bold text-content">{healthy}%</p>
              <p className="text-[11px] text-content-muted">al día</p>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="money text-lg font-semibold text-content"><span className="mr-1 text-xs font-semibold text-content-muted">RD$</span>{money(total)}</p>
            <p className="mb-2 text-xs text-content-muted">Cartera total</p>
            <ul className="space-y-1">
              {AGING_KEYS.map((k, i) => (
                <li key={k.key} className="flex items-center justify-between gap-2 text-xs text-content-muted">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors[i] }} />{k.label}</span>
                  <span className="font-medium text-content">{Math.round((Number(a[k.key].amount) / total) * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Panel>
  )
}

/* ───────────────────────── Análisis de riesgo (PAR) ───────────────────────── */

export function RiskAnalysisPanel() {
  const risk = useRisk()
  const c = useChartColors()
  const reduced = useReducedMotion()
  if (risk.error || !risk.data) return null
  const r = risk.data
  const par = Number(r.par)
  const parTone = par < 5 ? 'text-success-text' : par < 10 ? 'text-warning-text' : 'text-danger'
  const donut = [
    { name: 'Vigente', value: Number(r.cartera_vigente), color: c.c('success') },
    { name: 'Vencida', value: Number(r.cartera_vencida), color: c.c('danger') }
  ]
  return (
    <Panel title="Análisis de riesgo" icon={ShieldAlert} action={{ to: '/reportes?tab=riesgo', label: 'Ver reporte' }}>
      {Number(r.cartera_total) === 0 ? (
        <p className="py-8 text-center text-sm text-content-muted">Sin cartera activa.</p>
      ) : (
        <div className="flex items-center gap-5">
          <div className="h-32 w-32 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<ChartTooltip format={rd} />} />
                <Pie data={donut} dataKey="value" innerRadius={40} outerRadius={58} paddingAngle={3} cornerRadius={4} stroke="none"
                  isAnimationActive={!reduced} animationDuration={700}>
                  {donut.map((d) => <Cell key={d.name} fill={d.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="text-sm">
            <p className={`t-kpi money ${parTone}`}>{par}%</p>
            <p className="mb-2 text-xs text-content-muted">Cartera en riesgo (PAR)</p>
            <p className="text-xs text-content-muted">Vigente · <span className="money font-medium text-content">{rd(Number(r.cartera_vigente))}</span></p>
            <p className="text-xs text-content-muted">Vencida · <span className="money font-medium text-content">{rd(Number(r.cartera_vencida))}</span></p>
            {Number(r.castigos_count) > 0 && (
              <p className="mt-1 text-xs text-danger">{r.castigos_count} castigado(s) · {rd(Number(r.castigos_monto))}</p>
            )}
          </div>
        </div>
      )}
    </Panel>
  )
}

/* ─────────────────────────── Ingresos del período ─────────────────────────── */

export function IncomePeriodPanel({ period }: { period: string }) {
  const summary = useSummary(period)
  const c = useChartColors()
  const reduced = useReducedMotion()
  const gradientId = useId().replace(/:/g, '')
  const rowsQuery = useQuery({
    queryKey: ['dashboard_income_series', period, summary.data?.period.from, summary.data?.period.to],
    enabled: Boolean(summary.data),
    queryFn: async () => {
      const from = summary.data!.period.from
      const toExclusive = new Date(new Date(summary.data!.period.to + 'T00:00:00').getTime() + 86400000).toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('payments')
        .select('paid_at, total_amount')
        .eq('status', 'active')
        .gte('paid_at', from)
        .lt('paid_at', toExclusive)
      if (error) throw error
      return data as { paid_at: string; total_amount: number }[]
    }
  })
  const weekly = useMemo(() => {
    const rows = rowsQuery.data ?? []
    const buckets = new Map<number, number>()
    rows.forEach((r) => {
      const day = new Date(r.paid_at).getDate()
      const week = Math.floor((day - 1) / 7) + 1
      buckets.set(week, (buckets.get(week) ?? 0) + Number(r.total_amount))
    })
    const maxWeek = Math.max(4, ...Array.from(buckets.keys()))
    return Array.from({ length: maxWeek }, (_, i) => ({ semana: `Sem ${i + 1}`, monto: buckets.get(i + 1) ?? 0 }))
  }, [rowsQuery.data])
  if (!summary.data) return null
  const tick = { fontSize: 11, fill: c.c('text-muted') }

  return (
    <Panel title="Ingresos del período" icon={BarChart3}>
      <p className="t-kpi money mb-2 text-content"><span className="mr-1 text-[0.55em] font-semibold text-content-muted">RD$</span>{money(summary.data.cobros_periodo.total_cobrado)}</p>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weekly} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.c('primary')} stopOpacity={0.95} />
                <stop offset="100%" stopColor={c.c('primary')} stopOpacity={0.4} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={c.c('line', 0.8)} strokeDasharray="3 4" />
            <XAxis dataKey="semana" tick={tick} axisLine={false} tickLine={false} />
            <YAxis tick={tick} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => compact(v)} />
            <Tooltip cursor={{ fill: c.c('primary', 0.06) }} content={<ChartTooltip format={rd} title="Ingresos" />} />
            <Bar dataKey="monto" fill={`url(#${gradientId})`} radius={[6, 6, 0, 0]} maxBarSize={36} isAnimationActive={!reduced} animationDuration={600} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}

/* ──────────────────────────── Morosidad (tendencia) ──────────────────────────── */

export function TrendPanel() {
  const query = usePortfolioHistory()
  const c = useChartColors()
  const reduced = useReducedMotion()
  const gradientId = useId().replace(/:/g, '')
  const points = useMemo(
    () => (query.data ?? []).map((p) => ({ fecha: shortDate(p.date), par: Number(p.par) })),
    [query.data]
  )
  if (query.error) return null
  const raw = query.data ?? []
  const last = raw.length > 0 ? raw[raw.length - 1] : undefined
  const first = raw.length > 1 ? raw[0] : undefined
  const change = last && first ? Number(last.par) - Number(first.par) : null
  const firstDate = first ? shortDate(first.date) : ''
  const par = last ? Number(last.par) : 0
  const tone = par >= 10 ? 'danger' : par >= 5 ? 'warning' : 'success'
  const toneText = par >= 10 ? 'text-danger' : par >= 5 ? 'text-warning-text' : 'text-success-text'
  const tick = { fontSize: 10, fill: c.c('text-muted') }

  return (
    <Panel title="Morosidad" icon={Activity} action={{ to: '/cobranza', label: 'Ver cobranza' }}>
      {!last ? (
        <p className="text-sm text-content-muted">Cargando historial…</p>
      ) : (
        <>
          <p className={`t-kpi money ${toneText}`}>{par}%</p>
          {change !== null ? (
            <p className={`text-xs font-medium ${change <= 0 ? 'text-success-text' : 'text-danger'}`}>
              {change <= 0 ? '▼' : '▲'} {Math.abs(change).toFixed(1)} pts desde el {firstDate}
            </p>
          ) : (
            <p className="text-xs text-content-muted">El historial empieza hoy; en unos días verás la tendencia.</p>
          )}
          {points.length > 1 && (
            <div className="mt-3 h-32">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={points} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c.c(tone)} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={c.c(tone)} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={c.c('line', 0.8)} strokeDasharray="3 4" />
                  <XAxis dataKey="fecha" tick={tick} axisLine={false} tickLine={false} />
                  <YAxis tick={tick} axisLine={false} tickLine={false} width={40} tickFormatter={(v: number) => `${v}%`} />
                  <Tooltip cursor={{ stroke: c.c(tone, 0.4), strokeWidth: 1 }} content={<ChartTooltip format={(v) => `${v}%`} title="Cartera vencida" />} />
                  <Area type="monotone" dataKey="par" stroke={c.c(tone)} strokeWidth={2.5} fill={`url(#${gradientId})`}
                    dot={{ r: 2.5, fill: c.c('surface'), stroke: c.c(tone), strokeWidth: 2 }} isAnimationActive={!reduced} animationDuration={700} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </Panel>
  )
}

/* ────────────────────────── Riesgo por nivel de cliente ────────────────────────── */

type RiskDist = { counts: Record<string, number>; amounts: Record<string, number>; evaluated: number; truncated: boolean }
const LEVEL_ORDER = ['Riesgo bajo', 'Riesgo medio', 'Riesgo alto', 'Sin datos suficientes']

export function RiskLevelsPanel() {
  const c = useChartColors()
  const reduced = useReducedMotion()
  const query = useQuery({
    queryKey: ['dashboard_risk_levels'],
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('risk_distribution')
      if (error) throw error
      return data as RiskDist
    }
  })
  if (query.error) return null
  const d = query.data
  const levelColor = (name: string) =>
    name === 'Riesgo bajo' ? c.c('success') : name === 'Riesgo medio' ? c.c('warning') : name === 'Riesgo alto' ? c.c('danger') : c.c('text-muted', 0.45)
  const keys = d ? [...LEVEL_ORDER.filter((k) => k in d.counts), ...Object.keys(d.counts).filter((k) => !LEVEL_ORDER.includes(k))] : []
  const donut = d ? keys.map((k) => ({ name: k, value: Number(d.counts[k]), color: levelColor(k) })) : []
  const total = donut.reduce((sum, x) => sum + x.value, 0)

  return (
    <Panel title="Riesgo por cliente" icon={UserCheck} action={{ to: '/clientes', label: 'Ver clientes' }}>
      {!d ? (
        <p className="text-sm text-content-muted">Calculando…</p>
      ) : total === 0 ? (
        <p className="py-8 text-center text-sm text-content-muted">Sin clientes con préstamo activo.</p>
      ) : (
        <>
          <div className="flex items-center gap-5">
            <div className="relative h-32 w-32 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<ChartTooltip format={(v) => `${v} cliente(s)`} />} />
                  <Pie data={donut} dataKey="value" innerRadius={40} outerRadius={58} paddingAngle={3} cornerRadius={4} stroke="none"
                    isAnimationActive={!reduced} animationDuration={700}>
                    {donut.map((x) => <Cell key={x.name} fill={x.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="money text-xl font-bold text-content">{total}</p>
                <p className="text-[11px] text-content-muted">clientes</p>
              </div>
            </div>
            <ul className="flex-1 space-y-1.5 text-xs">
              {donut.map((x) => (
                <li key={x.name} className="flex items-center justify-between gap-2 text-content-muted">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: x.color }} />{x.name}</span>
                  <span><span className="font-medium text-content">{x.value}</span> · {rd(Number(d.amounts[x.name] ?? 0))}</span>
                </li>
              ))}
            </ul>
          </div>
          {d.truncated && <p className="mt-2 text-xs text-content-muted">Se evaluaron los {d.evaluated} clientes con mayor saldo.</p>}
        </>
      )}
    </Panel>
  )
}

/* ─────────────────────── Flujo de caja (próximos 30 días) ─────────────────────── */

type Cashflow = {
  days: number; entradas: number; atrasadas: number; salidas_estimadas: number; neto_estimado: number
  semanas: { week: number; entradas: number }[]
}

export function CashflowPanel() {
  const c = useChartColors()
  const reduced = useReducedMotion()
  const gradientId = useId().replace(/:/g, '')
  const query = useQuery({
    queryKey: ['dashboard_cashflow'],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cashflow_forecast', { p_days: 30 })
      if (error) throw error
      return data as Cashflow
    }
  })
  const weeks = useMemo(
    () => (query.data?.semanas ?? []).map((w) => ({ semana: `Sem ${Number(w.week) + 1}`, monto: Number(w.entradas) })),
    [query.data]
  )
  if (query.error) return null
  const d = query.data
  const tick = { fontSize: 11, fill: c.c('text-muted') }

  return (
    <Panel title="Flujo de caja · próximos 30 días" icon={Wallet} action={{ to: '/calendario', label: 'Ver calendario' }}>
      {!d ? (
        <p className="text-sm text-content-muted">Calculando…</p>
      ) : (
        <>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-content-muted">Entradas esperadas (cuotas por vencer)</dt><dd className="money font-medium text-success-text">{rd(Number(d.entradas))}</dd></div>
            <div className="flex justify-between"><dt className="text-content-muted">Salidas estimadas</dt><dd className="money font-medium text-danger">{rd(Number(d.salidas_estimadas))}</dd></div>
            <div className="flex justify-between border-t border-line pt-1.5">
              <dt className="font-medium text-content">Flujo neto estimado</dt>
              <dd className={`money font-semibold ${Number(d.neto_estimado) >= 0 ? 'text-success-text' : 'text-danger'}`}>{rd(Number(d.neto_estimado))}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-content-muted">
            Las salidas son un estimado: el promedio mensual de tus gastos de los últimos 3 meses.
            {Number(d.atrasadas) > 0 && ` Además hay ${rd(Number(d.atrasadas))} atrasados por recuperar.`}
          </p>
          {weeks.length > 0 && (
            <div className="mt-3 h-28">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeks} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c.c('success')} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={c.c('success')} stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={c.c('line', 0.8)} strokeDasharray="3 4" />
                  <XAxis dataKey="semana" tick={tick} axisLine={false} tickLine={false} />
                  <YAxis tick={tick} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => compact(v)} />
                  <Tooltip cursor={{ fill: c.c('success', 0.07) }} content={<ChartTooltip format={rd} title="Entradas" />} />
                  <Bar dataKey="monto" fill={`url(#${gradientId})`} radius={[6, 6, 0, 0]} maxBarSize={36} isAnimationActive={!reduced} animationDuration={600} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </Panel>
  )
}
