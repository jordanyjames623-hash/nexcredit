import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { money, shortDate, dateTime } from '@/lib/format'
import { downloadCsv } from '@/lib/csv'
import { downloadXlsx } from '@/lib/xlsx'
import { useAuth } from '@/contexts/AuthContext'
import { useChartColors } from '@/hooks/useChartColors'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { ChartTooltip } from '@/components/ui/ChartTooltip'

const PERIODS = [
  { v: 'today', l: 'Hoy' }, { v: 'week', l: 'Semana' }, { v: 'month', l: 'Mes' }, { v: 'year', l: 'Año' }
]
const TABS = ['financiero', 'movimientos', 'cartera', 'actividad', 'comisiones', 'riesgo'] as const
const TAB_LABEL: Record<(typeof TABS)[number], string> = {
  financiero: 'Financiero', movimientos: 'Movimientos', cartera: 'Cartera',
  actividad: 'Rendimiento por colaborador', comisiones: 'Comisiones', riesgo: 'Riesgo'
}
const MOVEMENT_LABEL: Record<string, string> = {
  LOAN_DISBURSEMENT: 'Préstamo desembolsado', LOAN_RENEWED: 'Renovación desembolsada', LOAN_RESTRUCTURED: 'Términos modificados',
  LOAN_SETTLED: 'Préstamo liquidado', PAYMENT_RECEIVED: 'Pago recibido', PAYMENT_REVERSED: 'Pago anulado',
  COMMISSION_GENERATED: 'Comisión generada', POINTS_GRANTED: 'Puntos otorgados', POINTS_REVERSED: 'Puntos anulados'
}
const MOVEMENT_FILTERS = ['Todos', ...Object.keys(MOVEMENT_LABEL)]
const PAYMENT_TYPE_LABEL: Record<string, string> = {
  regular: 'Cuota regular', principal: 'Abono a capital', interest: 'Interés', late_fee: 'Mora', custom: 'Personalizado'
}
const EXPENSE_CATEGORY_LABEL: Record<string, string> = {
  fuel: 'Combustible', transport: 'Transporte', payroll: 'Nómina', office: 'Oficina',
  commissions: 'Comisiones', services: 'Servicios', other: 'Otros'
}

type CommissionRow = { user_id: string; name: string } & Record<string, any>
type Movement = { reference: string; movement_type: string; occurred_at: string; amount: number; unit: string; metadata: any }
type Summary = { capital: { colocado: number; recuperado: number; pendiente: number }; ingresos: { interes_cobrado: number; mora_cobrada: number }; gastos: number; resultado: number }

function movementWhen(iso: string) {
  const { date, time } = dateTime(iso)
  return time ? `${date}, ${time}` : date
}

export function Reports() {
  const chartColors = useChartColors()
  const reducedMotion = useReducedMotion()
  const donutColors = [chartColors.series(0), chartColors.series(1)]
  const { isOwner, session, business, hasFeature } = useAuth()
  const [searchParams] = useSearchParams()
  const [period, setPeriod] = useState('month')
  const requestedTab = searchParams.get('tab')
  const isBasic = !hasFeature('reportes_completos')
  const [tab, setTab] = useState<(typeof TABS)[number]>(
    !isBasic && (TABS as readonly string[]).includes(requestedTab ?? '') ? (requestedTab as (typeof TABS)[number]) : 'financiero'
  )
  const visibleTabs = isBasic ? TABS.filter((t) => t === 'financiero') : TABS
  const canExportPdf = !isBasic
  const [movementFilter, setMovementFilter] = useState('Todos')

  const { data: collaborators } = useQuery({
    queryKey: ['collaborators-for-reports'],
    enabled: isOwner,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_collaborators')
      if (error) throw error
      return data as { user_id: string; full_name: string; email: string }[]
    }
  })

  const commissionRows = useQuery({
    queryKey: ['commission_report', period, isOwner, collaborators?.length],
    enabled: tab === 'comisiones',
    queryFn: async () => {
      const targets = isOwner
        ? (collaborators ?? []).map((c) => ({ id: c.user_id, name: c.full_name || c.email }))
        : [{ id: session!.user.id, name: 'Yo' }]
      const rows = await Promise.all(targets.map(async (t) => {
        const { data, error } = await supabase.rpc('commission_summary', { p_collaborator: t.id, p_period: period })
        if (error) throw error
        return { user_id: t.id, name: t.name, ...(data as object) } as CommissionRow
      }))
      return rows
    }
  })

  const riskQuery = useQuery({
    queryKey: ['portfolio_risk_report'],
    enabled: tab === 'riesgo',
    queryFn: async () => {
      const { data, error } = await supabase.rpc('portfolio_risk_report')
      if (error) throw error
      return data as {
        cartera_vigente: number; cartera_vencida: number; cartera_total: number; par: number
        castigos_count: number; castigos_monto: number
        por_colaborador: { colaborador_name: string; total_pending: number }[]
        por_producto: { loan_type: string; total_pending: number }[]
      }
    }
  })

  const adjustmentsQuery = useQuery({
    queryKey: ['manual_adjustments_report', period],
    enabled: tab === 'comisiones' && isOwner,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('point_ledger')
        .select('id, collaborator_id, points, reason, created_at, status')
        .eq('category', 'ajuste')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as { id: string; collaborator_id: string; points: number; reason: string | null; created_at: string; status: string }[]
    }
  })

  const summaryQuery = useQuery({
    queryKey: ['dashboard_summary', period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_summary', { p_period: period })
      if (error) throw error
      return data
    }
  })

  const portfolioQuery = useQuery({
    queryKey: ['portfolio_report', period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('portfolio_report', { p_period: period })
      if (error) throw error
      return data
    }
  })

  const movementsQuery = useQuery({
    queryKey: ['report_movements', movementFilter],
    enabled: tab === 'movimientos',
    queryFn: async () => {
      let q = supabase.from('financial_ledger').select('reference, movement_type, occurred_at, amount, unit, metadata')
        .eq('unit', 'DOP').order('occurred_at', { ascending: false }).limit(100)
      if (movementFilter !== 'Todos') q = q.eq('movement_type', movementFilter)
      const { data, error } = await q
      if (error) throw error
      return data as Movement[]
    }
  })

  const monthComparisonQuery = useQuery({
    queryKey: ['report_month_comparison'],
    enabled: tab === 'movimientos',
    queryFn: async () => {
      const results = await Promise.all(
        ['month', 'last_month'].map((pr) => supabase.rpc('dashboard_summary', { p_period: pr }))
      )
      return results.map((r) => r.data as Summary & { period: { from: string; to: string } })
    }
  })

  const s = summaryQuery.data
  const p = portfolioQuery.data

  function exportReport(format: 'csv' | 'xlsx') {
    if (!s || !p) return
    const rows: Record<string, unknown>[] = [
      { seccion: 'Resumen', concepto: 'Capital colocado', monto: s.capital.colocado },
      { seccion: 'Resumen', concepto: 'Capital recuperado', monto: s.capital.recuperado },
      { seccion: 'Resumen', concepto: 'Capital pendiente', monto: s.capital.pendiente },
      { seccion: 'Resumen', concepto: 'Interés cobrado', monto: s.ingresos.interes_cobrado },
      { seccion: 'Resumen', concepto: 'Interés pendiente', monto: s.ingresos.interes_pendiente },
      { seccion: 'Resumen', concepto: 'Mora cobrada', monto: s.ingresos.mora_cobrada },
      { seccion: 'Resumen', concepto: 'Mora pendiente', monto: s.ingresos.mora_pendiente },
      { seccion: 'Resumen', concepto: 'Gastos', monto: s.gastos },
      { seccion: 'Resumen', concepto: 'Resultado', monto: s.resultado }
    ]
    ;(p.pagos ?? []).forEach((x: any) => rows.push({ seccion: 'Pagos por tipo', concepto: PAYMENT_TYPE_LABEL[x.payment_type] ?? x.payment_type, cantidad: x.cantidad, monto: x.total }))
    ;(p.gastos_por_categoria ?? []).forEach((x: any) => rows.push({ seccion: 'Gastos por categoría', concepto: EXPENSE_CATEGORY_LABEL[x.category] ?? x.category, monto: x.total }))
    ;(p.por_usuario ?? []).forEach((u: any) => rows.push({
      seccion: 'Actividad de colaboradores', concepto: u.user_name, pagos_registrados: u.pagos_registrados,
      pagos_anulados: u.pagos_anulados, clientes_creados: u.clientes_creados, prestamos_creados: u.prestamos_creados, monto_cobrado: u.monto_cobrado
    }))
    const baseName = `capitalia-reporte-${period}-${p.period.from}_${p.period.to}`
    if (format === 'xlsx') downloadXlsx(`${baseName}.xlsx`, rows)
    else downloadCsv(`${baseName}.csv`, rows)
  }

  const donutData = s ? [
    { name: 'Capital recuperado', value: s.capital.recuperado },
    { name: 'Intereses + mora', value: s.ingresos.interes_cobrado + s.ingresos.mora_cobrada }
  ] : []
  const hasDonut = donutData.some((d) => d.value > 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="t-h1 text-content">Reportes</h1>
          <p className="text-sm text-content-muted">Análisis y control de tu negocio.</p>
        </div>
        <div className="print-hide flex flex-wrap items-center gap-1">
          {PERIODS.map((o) => (
            <button key={o.v} onClick={() => setPeriod(o.v)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${period === o.v ? 'bg-primary-fill text-white' : 'glass-card text-content-muted'}`}>
              {o.l}
            </button>
          ))}
          <button onClick={() => exportReport('csv')} disabled={!s || !p} className="btn-solid ml-1 !px-3 !py-1.5 text-xs">Exportar CSV</button>
          {canExportPdf && (
            <button onClick={() => exportReport('xlsx')} disabled={!s || !p} className="btn-secondary !px-3 !py-1.5 text-xs">Exportar Excel</button>
          )}
          {canExportPdf && (
            <button onClick={() => window.print()} disabled={!s || !p} className="btn-secondary !px-3 !py-1.5 text-xs">Exportar PDF</button>
          )}
        </div>
      </div>

      <div className="print-only text-sm text-content-muted">
        {business?.name ?? 'NEXCREDIT'} · Reporte de {TAB_LABEL[tab].toLowerCase()} · Generado el {new Date().toLocaleDateString('es-DO')}
      </div>

      <div className="print-hide flex flex-wrap gap-1">
        {visibleTabs.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'bg-primary-fill text-white' : 'glass-card text-content-muted'}`}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {(summaryQuery.isLoading || portfolioQuery.isLoading) && <p className="text-sm text-content-muted">Cargando…</p>}
      {(summaryQuery.error || portfolioQuery.error) && <p className="text-sm text-danger">No se pudo cargar el reporte.</p>}

      {s && p && (
        <>
          {p.scope === 'own' && <p className="text-xs text-danger">Mostrando solo tu propia actividad en este período.</p>}
          <p className="text-xs text-content-muted">{p.period.from} — {p.period.to}</p>

          {tab === 'financiero' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="glass-card">
                <h2 className="ledger-rule px-5 py-3 text-sm font-semibold text-content">Resumen financiero</h2>
                <dl className="divide-y divide-line">
                  <Row label="Capital colocado" v={s.capital.colocado} />
                  <Row label="Capital recuperado" v={s.capital.recuperado} />
                  <Row label="Capital pendiente" v={s.capital.pendiente} />
                  <Row label="Interés cobrado" v={s.ingresos.interes_cobrado} />
                  <Row label="Interés pendiente" v={s.ingresos.interes_pendiente} />
                  <Row label="Mora cobrada" v={s.ingresos.mora_cobrada} />
                  <Row label="Mora pendiente" v={s.ingresos.mora_pendiente} />
                  <Row label="Gastos" v={s.gastos} />
                  <Row label="Resultado" v={s.resultado} strong />
                </dl>
              </div>
              <div className="glass-card p-5">
                <h2 className="mb-3 text-sm font-semibold text-content">Capital vs Intereses</h2>
                {hasDonut ? (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip content={<ChartTooltip format={(v) => `RD$ ${money(v)}`} />} />
                        <Pie data={donutData} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={3} cornerRadius={4} stroke="none"
                          isAnimationActive={!reducedMotion} animationDuration={700}>
                          {donutData.map((_, i) => <Cell key={i} fill={donutColors[i % donutColors.length]} />)}
                        </Pie>
                        {/* La leyenda queda dentro de la tarjeta (ancho 100 %, texto chico, con montos). */}
                        <Legend
                          verticalAlign="bottom"
                          height={44}
                          iconSize={10}
                          wrapperStyle={{ width: '100%', left: 0, fontSize: 12, lineHeight: '18px' }}
                          formatter={(v: string, entry: any) => (
                            <span className="text-content">{v}: <span className="money font-semibold">RD$ {money(Number(entry?.payload?.value ?? 0))}</span></span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="py-10 text-center text-sm text-content-muted">Sin cobros en este período.</p>
                )}
              </div>
            </div>
          )}

          {tab === 'movimientos' && (
            <div className="space-y-4">
              <div className="glass-card p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-content"><TrendingUp size={16} className="text-primary" /> Este mes vs. mes anterior</h2>
                {monthComparisonQuery.data && (
                  <div className="grid grid-cols-2 gap-4">
                    {monthComparisonQuery.data.map((h, i) => (
                      <div key={i} className={i === 0 ? '' : 'border-l border-line pl-4'}>
                        <p className="text-xs text-content-muted">{i === 0 ? 'Este mes' : 'Mes anterior'} · {shortDate(h.period.from)} – {shortDate(h.period.to)}</p>
                        <p className={`money mt-1 text-lg font-bold ${h.resultado >= 0 ? 'text-success-text' : 'text-danger'}`}>RD$ {money(h.resultado)}</p>
                        <p className="text-xs text-content-muted">Gastos: RD$ {money(h.gastos)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <select aria-label="Filtrar movimientos" className="field-input !w-auto" value={movementFilter} onChange={(e) => setMovementFilter(e.target.value)}>
                {MOVEMENT_FILTERS.map((m) => <option key={m} value={m}>{MOVEMENT_LABEL[m] ?? m}</option>)}
              </select>
              <div className="glass-card divide-y divide-line">
                {(movementsQuery.data?.length ?? 0) === 0 && <p className="px-5 py-8 text-center text-sm text-content-muted">Sin movimientos.</p>}
                {movementsQuery.data?.map((m) => (
                  <div key={`${m.reference}-${m.movement_type}`} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-content">{MOVEMENT_LABEL[m.movement_type] ?? m.movement_type}</p>
                      <p className="text-xs text-content-muted">{movementWhen(m.occurred_at)}</p>
                    </div>
                    <p className="money text-sm font-semibold text-content">RD$ {money(m.amount)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'cartera' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="glass-card">
                <h2 className="ledger-rule px-5 py-3 text-sm font-semibold text-content">Pagos por tipo</h2>
                {(p.pagos ?? []).length === 0 && <p className="px-5 py-4 text-sm text-content-muted">Sin pagos en el período.</p>}
                <dl className="divide-y divide-line">
                  {(p.pagos ?? []).map((x: any) => (
                    <div key={x.payment_type} className="flex justify-between px-5 py-2.5 text-sm">
                      <dt className="text-content/80">{PAYMENT_TYPE_LABEL[x.payment_type] ?? x.payment_type} ({x.cantidad})</dt>
                      <dd className="money text-content">RD$ {money(x.total)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="glass-card">
                <h2 className="ledger-rule px-5 py-3 text-sm font-semibold text-content">Gastos por categoría</h2>
                {(p.gastos_por_categoria ?? []).length === 0 && <p className="px-5 py-4 text-sm text-content-muted">Sin gastos en el período.</p>}
                <dl className="divide-y divide-line">
                  {(p.gastos_por_categoria ?? []).map((x: any) => (
                    <div key={x.category} className="flex justify-between px-5 py-2.5 text-sm">
                      <dt className="text-content/80">{EXPENSE_CATEGORY_LABEL[x.category] ?? x.category}</dt>
                      <dd className="money text-content">RD$ {money(x.total)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          )}

          {tab === 'actividad' && (
            (p.por_usuario ?? []).length === 0 ? (
              <div className="glass-card px-5 py-10 text-center text-sm text-content-muted">Sin actividad en este período.</div>
            ) : (
              <div className="overflow-x-auto glass-card">
                <table className="table-modern min-w-[560px]">
                  <thead>
                    <tr className="ledger-rule text-left text-xs text-content-muted">
                      <th className="px-5 py-2 font-medium">Usuario</th>
                      <th className="px-2 py-2 text-right font-medium">Pagos</th>
                      <th className="px-2 py-2 text-right font-medium">Anulados</th>
                      <th className="px-2 py-2 text-right font-medium">Clientes</th>
                      <th className="px-2 py-2 text-right font-medium">Préstamos</th>
                      <th className="px-5 py-2 text-right font-medium">Cobrado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.por_usuario.map((u: any, i: number) => (
                      <tr key={i} className="border-t border-line">
                        <td className="px-5 py-2 text-content/80">{u.user_name ?? '—'}</td>
                        <td className="px-2 py-2 text-right">{u.pagos_registrados}</td>
                        <td className="px-2 py-2 text-right">{u.pagos_anulados}</td>
                        <td className="px-2 py-2 text-right">{u.clientes_creados}</td>
                        <td className="px-2 py-2 text-right">{u.prestamos_creados}</td>
                        <td className="money px-5 py-2 text-right text-content">RD$ {money(u.monto_cobrado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === 'comisiones' && (
            <div className="space-y-4">
              {commissionRows.isLoading && <p className="text-sm text-content-muted">Calculando…</p>}
              {commissionRows.error && <p className="text-sm text-danger">No se pudo calcular la comisión.</p>}
              {(commissionRows.data?.length ?? 0) > 0 && (
                <div className="overflow-x-auto glass-card">
                  <table className="table-modern min-w-[640px]">
                    <thead>
                      <tr className="ledger-rule text-left text-xs text-content-muted">
                        <th className="px-5 py-2 font-medium">Colaborador</th>
                        <th className="px-2 py-2 text-right font-medium">Puntos válidos</th>
                        <th className="px-2 py-2 font-medium">Nivel</th>
                        <th className="px-2 py-2 text-right font-medium">Morosidad</th>
                        <th className="px-2 py-2 text-right font-medium">Bono ajustado</th>
                        <th className="px-5 py-2 text-right font-medium">Comisión final</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commissionRows.data!.map((r) => (
                        <tr key={r.user_id} className="border-t border-line">
                          <td className="px-5 py-2 text-content/80">{r.name}</td>
                          <td className="px-2 py-2 text-right">{r.valid_points}</td>
                          <td className="px-2 py-2">{r.level_name}</td>
                          <td className="px-2 py-2 text-right">{r.delinquency_percent === null || r.delinquency_percent === undefined ? '—' : `${r.delinquency_percent}%`}</td>
                          <td className="money px-2 py-2 text-right text-content">RD$ {money(r.adjusted_bonus)}</td>
                          <td className="money px-5 py-2 text-right font-semibold text-success-text">RD$ {money(r.final_commission)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-line font-semibold">
                        <td className="px-5 py-2 text-content">Total</td>
                        <td colSpan={4}></td>
                        <td className="money px-5 py-2 text-right text-success-text">
                          RD$ {money(commissionRows.data!.reduce((sum, r) => sum + Number(r.final_commission), 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {isOwner && (
                <div className="glass-card">
                  <h2 className="ledger-rule px-5 py-3 text-sm font-semibold text-content">Ajustes manuales recientes</h2>
                  {(adjustmentsQuery.data?.length ?? 0) === 0 && <p className="px-5 py-4 text-sm text-content-muted">Sin ajustes manuales registrados.</p>}
                  <ul className="divide-y divide-line">
                    {adjustmentsQuery.data?.map((a) => (
                      <li key={a.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                        <div>
                          <p className={a.status === 'voided' ? 'text-content-muted line-through' : 'text-content'}>{a.reason ?? 'Sin motivo'}</p>
                          <p className="text-xs text-content-muted">{new Date(a.created_at).toLocaleDateString('es-DO')}</p>
                        </div>
                        <span className={`money font-semibold ${a.points < 0 ? 'text-danger' : 'text-success-text'}`}>{a.points > 0 ? '+' : ''}{a.points} pts</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === 'riesgo' && (
            <div className="space-y-4">
              {riskQuery.isLoading && <p className="text-sm text-content-muted">Calculando…</p>}
              {riskQuery.data && (
                <>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <div className="glass-card p-4">
                      <p className="text-xs text-content-muted">Cartera vigente</p>
                      <p className="money text-lg font-semibold text-success-text">RD$ {money(riskQuery.data.cartera_vigente)}</p>
                    </div>
                    <div className="glass-card p-4">
                      <p className="text-xs text-content-muted">Cartera vencida</p>
                      <p className="money text-lg font-semibold text-danger">RD$ {money(riskQuery.data.cartera_vencida)}</p>
                    </div>
                    <div className="glass-card p-4">
                      <p className="text-xs text-content-muted">PAR (% en riesgo)</p>
                      <p className="text-lg font-semibold text-content">{riskQuery.data.par}%</p>
                    </div>
                    <div className="glass-card p-4">
                      <p className="text-xs text-content-muted">Castigado</p>
                      <p className="money text-lg font-semibold text-content">RD$ {money(riskQuery.data.castigos_monto)} <span className="text-xs text-content-muted">({riskQuery.data.castigos_count})</span></p>
                    </div>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="glass-card">
                      <h2 className="ledger-rule px-5 py-3 text-sm font-semibold text-content">Exposición por colaborador</h2>
                      <dl className="divide-y divide-line">
                        {riskQuery.data.por_colaborador.map((x, i) => (
                          <div key={i} className="flex justify-between px-5 py-2.5 text-sm">
                            <dt className="text-content/80">{x.colaborador_name}</dt>
                            <dd className="money text-content">RD$ {money(x.total_pending)}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                    <div className="glass-card">
                      <h2 className="ledger-rule px-5 py-3 text-sm font-semibold text-content">Exposición por componente</h2>
                      <dl className="divide-y divide-line">
                        <div className="flex justify-between px-5 py-2.5 text-sm">
                          <dt className="text-content/80">Capital</dt>
                          <dd className="money text-content">RD$ {money(s.capital.pendiente)}</dd>
                        </div>
                        <div className="flex justify-between px-5 py-2.5 text-sm">
                          <dt className="text-content/80">Interés</dt>
                          <dd className="money text-content">RD$ {money(s.ingresos.interes_pendiente)}</dd>
                        </div>
                        <div className="flex justify-between px-5 py-2.5 text-sm">
                          <dt className="text-content/80">Mora</dt>
                          <dd className="money text-content">RD$ {money(s.ingresos.mora_pendiente)}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Row({ label, v, strong }: { label: string; v: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between px-5 py-2.5 text-sm ${strong ? 'font-semibold' : ''}`}>
      <dt className="text-content/80">{label}</dt>
      <dd className="money text-content">RD$ {money(v)}</dd>
    </div>
  )
}
