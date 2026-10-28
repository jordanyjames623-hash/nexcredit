import { useId, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ArrowUpRight, ArrowDownRight, type LucideIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useChartColors } from '@/hooks/useChartColors'

export const PERIODS = [
  { v: 'today', l: 'Hoy' }, { v: 'week', l: 'Esta semana' }, { v: 'biweek', l: 'Esta quincena' },
  { v: 'month', l: 'Este mes' }, { v: 'last_month', l: 'Mes anterior' }, { v: 'year', l: 'Este año' }
]

export function money(n: number) {
  return new Intl.NumberFormat('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

// Números compactos para los ejes de las gráficas: 1,250,000 → 1.3M · 45,000 → 45k
export function compact(n: number) {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 10_000) return `${Math.round(n / 1_000)}k`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return String(Math.round(n))
}

// Variación porcentual; null cuando no hay base de comparación.
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

export type Summary = {
  period: { from: string; to: string }
  capital: { colocado: number; recuperado: number; pendiente: number }
  ingresos: { interes_cobrado: number; interes_pendiente: number; mora_cobrada: number; mora_pendiente: number }
  cartera: {
    prestamos_activos: number; prestamos_vencidos: number; prestamos_pagados: number; prestamos_total: number
    cuotas_pendientes: number; pagos_hoy: number; proximos_pagos: number
  }
  cobros_periodo: { monto_a_cobrar: number; total_cobrado: number }
  gastos: number
  resultado: number
}

export type CalendarRow = {
  due_date: string; client_id: string; client_name: string; loan_id: string; loan_number: number
  installment_number: number; total_due: number; status: string
}

export type Risk = {
  par: number; cartera_total: number; cartera_vigente: number; cartera_vencida: number
  castigos_count: number; castigos_monto: number
  por_colaborador: { colaborador_name: string | null; total_pending: number }[]
}

export type Alerts = { cuotas_vencidas: number; vencen_hoy: number; sin_pago_reciente: number }
export type MonthRow = { month: string; total: number }
export type HistoryPoint = { date: string; par: number; cartera_total: number; cartera_vencida: number }

export function useSummary(period: string, enabled = true) {
  return useQuery({
    queryKey: ['dashboard_summary', period],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_summary', { p_period: period })
      if (error) throw error
      return data as Summary
    }
  })
}

export function useRisk(enabled = true) {
  return useQuery({
    queryKey: ['dashboard_risk'],
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('portfolio_risk_report')
      if (error) throw error
      return data as Risk
    }
  })
}

export function useAlerts() {
  return useQuery({
    queryKey: ['dashboard_alerts'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_alerts')
      if (error) throw error
      return data as Alerts
    }
  })
}

export function useMonthlyCollections() {
  return useQuery({
    queryKey: ['dashboard_monthly_collections'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('monthly_collections', { p_months: 6 })
      if (error) throw error
      return data as MonthRow[]
    }
  })
}

export function usePortfolioHistory(enabled = true) {
  return useQuery({
    queryKey: ['dashboard_portfolio_history'],
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('portfolio_history', { p_days: 90 })
      if (error) throw error
      return data as HistoryPoint[]
    }
  })
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />
}

export function Panel({ title, icon: Icon, action, children, className }: {
  title: string; icon?: LucideIcon; action?: { to: string; label: string }; children: ReactNode; className?: string
}) {
  return (
    <section className={`glass-card p-5 ${className ?? ''}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-content">
          {Icon && (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon size={15} aria-hidden="true" />
            </span>
          )}
          <span className="truncate">{title}</span>
        </h2>
        {action && (
          <Link to={action.to} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
            {action.label}
            <ArrowRight size={12} aria-hidden="true" />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

// Mini gráfico de tendencia (SVG puro, sin librerías): solo se dibuja cuando hay datos reales.
export function Sparkline({ data, tone = 'primary' }: { data: number[]; tone?: 'primary' | 'success' | 'danger' | 'warning' }) {
  const colors = useChartColors()
  const gradientId = useId().replace(/:/g, '')
  if (data.length < 2) return null
  const width = 96
  const height = 34
  const pad = 2
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const points = data.map((v, i) => [pad + (i * (width - pad * 2)) / (data.length - 1), height - pad - ((v - min) / span) * (height - pad * 2)])
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = `${line} L${points[points.length - 1][0].toFixed(1)} ${height} L${points[0][0].toFixed(1)} ${height} Z`
  const color = colors.c(tone)
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

type Tone = 'ink' | 'paid' | 'due' | 'gold'
const VALUE_TONE: Record<Tone, string> = { ink: 'text-content', paid: 'text-success-text', due: 'text-danger', gold: 'text-primary-dark' }
const CHIP_TONE: Record<Tone, string> = { ink: 'bg-primary/10 text-primary', paid: 'bg-success/10 text-success-text', due: 'bg-danger/10 text-danger', gold: 'bg-primary/10 text-primary' }
const SPARK_TONE = { ink: 'primary', paid: 'success', due: 'danger', gold: 'primary' } as const

// Tarjeta KPI: icono, título, cifra dominante, variación y (si hay datos) mini gráfico.
export function KpiTile({ label, value, icon: Icon, sub, tone = 'ink', delta, deltaLabel = 'vs. mes anterior', upIsGood = true, spark }: {
  label: string; value: string; icon?: LucideIcon; sub?: string; tone?: Tone
  delta?: number | null; deltaLabel?: string; upIsGood?: boolean; spark?: number[]
}) {
  const d = delta ?? null
  const good = d === null ? true : upIsGood ? d >= 0 : d <= 0
  const currency = value.match(/^(RD\$)\s+(.*)$/)
  return (
    <div className="glass-card card-hover relative overflow-hidden p-4">
      <div className="flex items-center gap-2.5">
        {Icon && (
          <span data-parallax className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${CHIP_TONE[tone]}`}>
            <Icon size={18} aria-hidden="true" />
          </span>
        )}
        <p className="t-label line-clamp-2 leading-tight">{label}</p>
      </div>
      <div className="mt-3 flex min-h-[34px] items-end justify-between gap-2">
        <p className={`t-kpi money min-w-0 truncate ${VALUE_TONE[tone]}`} title={value}>
          {currency ? (<><span className="mr-1 text-[0.55em] font-semibold text-content-muted">{currency[1]}</span>{currency[2]}</>) : value}
        </p>
        {spark && spark.length > 1 && (
          <span className="hidden shrink-0 sm:block lg:hidden xl:block"><Sparkline data={spark} tone={SPARK_TONE[tone]} /></span>
        )}
      </div>
      {d !== null && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${good ? 'bg-success/10 text-success-text' : 'bg-danger/10 text-danger'}`}>
            {d >= 0 ? <ArrowUpRight size={12} aria-hidden="true" /> : <ArrowDownRight size={12} aria-hidden="true" />}
            {Math.abs(d).toFixed(1)}%
          </span>
          <span className="text-content-muted">{deltaLabel}</span>
        </div>
      )}
      {sub && <p className={`text-xs text-content-muted ${d !== null ? 'mt-1' : 'mt-2'}`}>{sub}</p>}
    </div>
  )
}
