import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Banknote, Calculator, CreditCard, DollarSign, MessageCircle, Phone, UserPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { type CalendarRow } from '@/components/dashboard/shared'
import { money0, initials, avatarColor, telLink, waLink, relDayEs } from './lib'
import { GreetingHeader } from './GreetingHeader'

// Inicio de la maqueta interactiva: saludo + fecha + campana, tarjeta azul "CAPITAL EN
// LA CALLE" con 3 mini-stats, 4 acciones, "Para cobrar hoy" en UNA tarjeta con una fila
// por cliente (no por cuota) y botones Telefono / WhatsApp / Cobrar a la derecha, grafica
// de cobros de la semana y dona de salud de la cartera. Los colores salen de var(--nc-*),
// asi que el boton claro/oscuro junto a la campana cambia la pantalla entera.
// Fecha local (no UTC): con UTC, despues de las 8 p. m. en RD el "hoy" saltaba al dia siguiente.
function localIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function rdDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' })
}

const ACTIONS = [
  { icon: DollarSign, color: '#2563EB', label: 'Nuevo préstamo', to: '/prestamos/nuevo' },
  { icon: CreditCard, color: '#F59E0B', label: 'Registrar pago', to: '/prestamos' },
  { icon: UserPlus, color: '#22C55E', label: 'Nuevo cliente', to: '/clientes/nuevo' },
  { icon: Calculator, color: '#EF4444', label: 'Calculadora', to: '/calculadora' }
]
const WEEK_DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

type PendingClient = {
  client_id: string; client_name: string; loan_id: string; installment_number: number
  total: number; due_date: string; overdueCount: number
}

type HomeData = {
  capital_pendiente: number
  calendar: CalendarRow[]
  balances: { loan_id: string; client_id: string; status: string; days_overdue: number }[]
  clients: { id: string; full_name: string; phone: string | null; whatsapp: string | null }[]
  overdue: { loan_id: string; number: number; due_date: string; effective_status: string; total_pending: number; total_due: number }[]
  progress: { loan_id: string; total: number; paid: number }[]
  payments: { total_amount: number; paid_at: string; status: string }[]
}

export function Home() {
  const now = new Date()
  const todayIso = localIso(now)
  const weekEndIso = localIso(new Date(now.getTime() + 6 * 86400000))

  // Inicio combinado (2026-10-29): una sola llamada trae calendario, saldos, clientes,
  // cuotas vencidas, progreso y pagos, más el capital pendiente calculado exactamente
  // como dashboard_summary (suma de pending_principal). Las 7 consultas anteriores
  // salían en paralelo pero eran 7 viajes a la base en cada apertura en frío; ahora
  // es 1. Todo el cálculo derivado debajo queda igual que antes.
  const homeQuery = useQuery({
    queryKey: ['nuevo_home_all', todayIso, weekEndIso],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('home_dashboard', { p_from: todayIso, p_to: weekEndIso, p_today: todayIso })
      if (error) throw error
      return data as HomeData
    }
  })

  const homeData = homeQuery.data ?? null
  const cartera = homeData?.capital_pendiente ?? 0
  const balances = homeData?.balances ?? []
  const activos = balances.filter((l) => l.status === 'active').length
  const alDia = balances.filter((l) => l.status === 'active' && l.days_overdue === 0).length
  const atrasados = balances.filter((l) => l.status === 'active' && l.days_overdue > 0).length
  const saldados = balances.filter((l) => l.status === 'paid').length
  const pctDia = alDia + atrasados > 0 ? Math.round((alDia / (alDia + atrasados)) * 100) : 0
  const clients = homeData?.clients ?? []
  const clientById = new Map(clients.map((c) => [c.id, c]))
  const loanClient = new Map(balances.map((l) => [l.loan_id, l.client_id]))
  const progress = new Map((homeData?.progress ?? []).map((r) => [r.loan_id, { total: r.total, paid: r.paid }]))

  const calendarToday = (homeData?.calendar ?? []).filter((r) => r.due_date === todayIso && r.status !== 'paid')
  const todayDueTotal = calendarToday.reduce((sum, r) => sum + Number(r.total_due), 0)

  // Una fila por cliente (como en la maqueta): si tiene cuotas vencidas, la fila muestra la
  // vencida mas antigua y cuantas tiene vencidas; si no, su cuota de hoy.
  const overdueByClient = new Map<string, { loan_id: string; number: number; due_date: string; total: number }[]>()
  ;(homeData?.overdue ?? []).forEach((r) => {
    const cid = loanClient.get(r.loan_id)
    if (!cid) return
    const arr = overdueByClient.get(cid) ?? []
    arr.push({ loan_id: r.loan_id, number: r.number, due_date: r.due_date, total: Number(r.total_pending) > 0 ? Number(r.total_pending) : Number(r.total_due) })
    overdueByClient.set(cid, arr)
  })
  const pendingClients: PendingClient[] = []
  overdueByClient.forEach((arr, cid) => {
    arr.sort((a, b) => (a.due_date < b.due_date ? -1 : 1))
    const next = arr[0]
    pendingClients.push({ client_id: cid, client_name: clientById.get(cid)?.full_name ?? '—', loan_id: next.loan_id, installment_number: next.number, total: next.total, due_date: next.due_date, overdueCount: arr.length })
  })
  const overdueClientIds = new Set(overdueByClient.keys())
  calendarToday.forEach((r) => {
    if (overdueClientIds.has(r.client_id)) return
    if (pendingClients.some((p) => p.client_id === r.client_id)) return
    pendingClients.push({ client_id: r.client_id, client_name: r.client_name, loan_id: r.loan_id, installment_number: r.installment_number, total: Number(r.total_due), due_date: r.due_date, overdueCount: 0 })
  })
  pendingClients.sort((a, b) => {
    const ao = a.overdueCount > 0, bo = b.overdueCount > 0
    if (ao !== bo) return ao ? -1 : 1
    return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0
  })

  const payments = (homeData?.payments ?? []).filter((p) => p.status === 'active')
  const todayPayments = payments.filter((p) => rdDate(p.paid_at) === todayIso)
  const cobradoHoy = todayPayments.reduce((sum, p) => sum + Number(p.total_amount), 0)
  const dayIdx = (now.getDay() + 6) % 7
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayIdx)
  const weekDates = Array.from({ length: 7 }, (_, i) => localIso(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)))
  const weekSums = weekDates.map((d) => payments.filter((p) => rdDate(p.paid_at) === d).reduce((sum, p) => sum + Number(p.total_amount), 0))
  const weekTotal = weekSums.reduce((a, b) => a + b, 0)
  const maxWeek = Math.max(0, ...weekSums)
  const bestDayIdx = weekSums.indexOf(maxWeek)
  const bestDayName = bestDayIdx >= 0
    ? new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + bestDayIdx).toLocaleDateString('es-DO', { weekday: 'long' })
    : ''
  const fmtK = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1).replace('.0', '')}k` : String(Math.round(v)))
  const circ = 2 * Math.PI * 42

  return (
    <div className="space-y-5">
      <GreetingHeader />

      <div className="relative overflow-hidden rounded-[20px] bg-gradient-to-br from-[#2563EB] to-[#3B82F6] p-4 shadow-sm">
        <span className="pointer-events-none absolute -right-2 top-1/2 -translate-y-1/2 select-none text-[120px] font-bold leading-none text-white/10" aria-hidden="true">$</span>
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/80">Capital en la calle</p>
          <p className="font-disp mt-1 text-3xl font-bold text-white">RD$ {money0(cartera)}</p>
          <p className="mt-1 text-sm text-white/80">En {activos} préstamos activos de {clients.length} clientes. Así va tu negocio hoy:</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white/10 p-2">
              <p className="text-[11px] text-white/70">Cobrado hoy</p>
              <p className="font-disp text-sm font-bold text-white">RD$ {money0(cobradoHoy)}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2">
              <p className="text-[11px] text-white/70">Vence hoy</p>
              <p className="text-[11px] text-white/70">{calendarToday.length} cuotas</p>
              <p className="font-disp text-sm font-bold text-white">RD$ {money0(todayDueTotal)}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2">
              <p className="text-[11px] text-white/70">Esta semana</p>
              <p className="font-disp text-sm font-bold text-white">RD$ {money0(weekTotal)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {ACTIONS.map((a) => (
          <Link key={a.label} to={a.to} className="flex flex-col items-center gap-2 rounded-2xl bg-[var(--nc-card)] p-3 text-center active:scale-[0.98]">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ backgroundColor: a.color }}>
              <a.icon size={18} />
            </span>
            <span className="text-[11px] font-medium leading-tight text-[var(--nc-text)]">{a.label}</span>
          </Link>
        ))}
      </div>

      <div className="rounded-[22px] bg-[var(--nc-card)] p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-[var(--nc-text)]">Para cobrar hoy</h2>
          <span className="rounded-full bg-red-400/10 px-2.5 py-0.5 text-xs font-semibold text-red-400">{pendingClients.length} pendientes</span>
        </div>
        <p className="mt-1 text-xs text-[var(--nc-muted)]">Toca un botón y resuelve sin cambiar de pantalla.</p>
        {homeQuery.isLoading && <p className="mt-3 text-sm text-[var(--nc-muted)]">Cargando…</p>}
        {!homeQuery.isLoading && pendingClients.length === 0 && (
          <p className="mt-3 text-center text-sm text-[var(--nc-muted)]">Nada por cobrar hoy.</p>
        )}
        <div className="divide-y divide-[var(--nc-border)]">
          {pendingClients.map((r) => {
            const c = clientById.get(r.client_id)
            const phone = c?.phone ?? c?.whatsapp ?? null
            const wa = waLink(phone, `Hola ${r.client_name}, te recordamos tu cuota de RD$ ${money0(r.total)} en NEXCREDIT.`)
            const tel = telLink(phone)
            const p = progress?.get(r.loan_id)
            const status = r.overdueCount === 0 ? 'vence hoy' : r.overdueCount === 1 ? `vencido ${relDayEs(r.due_date)}` : `${r.overdueCount} cuotas vencidas`
            return (
              <div key={r.client_id} className="flex items-center gap-3 py-3 first:pt-3 last:pb-0">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: avatarColor(r.client_id) }}>
                  {initials(r.client_name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[var(--nc-text)]">{r.client_name}</span>
                  <span className="block truncate text-xs text-[var(--nc-muted)]">
                    Cuota {r.installment_number}{p ? ` de ${p.total}` : ''} · {status}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="font-disp text-sm font-bold text-[var(--nc-text)]">RD$ {money0(r.total)}</span>
                  <span className="flex items-center gap-1.5">
                    {tel && (
                      <a href={tel} aria-label="Llamar" className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--nc-soft)] text-[var(--nc-text)]"><Phone size={16} /></a>
                    )}
                    {wa && (
                      <a href={wa} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--nc-soft)] text-green-400"><MessageCircle size={16} /></a>
                    )}
                    <Link to={`/registrar-pago/${r.loan_id}`} className="flex items-center gap-1 rounded-lg bg-[#60A5FA] px-3 py-2 text-sm font-semibold text-[#0B1120]">
                      <Banknote size={15} /> Cobrar
                    </Link>
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-[22px] bg-[var(--nc-card)] p-4">
          <h2 className="text-base font-bold text-[var(--nc-text)]">Cobros de la semana</h2>
          <p className="text-xs text-[var(--nc-muted)]">Total RD$ {money0(weekTotal)}{maxWeek > 0 ? ` · el ${bestDayName} fue tu mejor día.` : '.'}</p>
          <div className="mt-4 flex h-28 items-end gap-2">
            {weekSums.map((v, i) => (
              <div key={WEEK_DAYS[i]} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] text-[var(--nc-muted)]">{fmtK(v)}</span>
                <div className="w-full rounded-t-md bg-gradient-to-t from-[#2563EB] to-[#3B82F6]" style={{ height: `${maxWeek > 0 ? Math.max(6, (v / maxWeek) * 100) : 6}%` }} />
                <span className="text-[10px] text-[var(--nc-muted)]">{WEEK_DAYS[i]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[22px] bg-[var(--nc-card)] p-4">
          <h2 className="text-base font-bold text-[var(--nc-text)]">Salud de tu cartera</h2>
          <p className="text-xs text-[var(--nc-muted)]">Cómo están tus préstamos hoy.</p>
          <div className="mt-3 flex items-center gap-4">
            <div className="relative h-24 w-24 shrink-0">
              <svg viewBox="0 0 96 96" className="h-24 w-24 -rotate-90">
                <circle cx="48" cy="48" r="42" fill="none" stroke="var(--nc-border)" strokeWidth="8" />
                <circle cx="48" cy="48" r="42" fill="none" stroke="#3B82F6" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={circ} strokeDashoffset={circ - (pctDia / 100) * circ} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-disp text-lg font-bold text-[var(--nc-text)]">{pctDia}%</span>
                <span className="text-[10px] text-[var(--nc-muted)]">al día</span>
              </div>
            </div>
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-center gap-2 text-[var(--nc-text)]"><span className="h-2.5 w-2.5 rounded-full bg-[#3B82F6]" /> Al día <span className="font-bold">{alDia}</span></li>
              <li className="flex items-center gap-2 text-[var(--nc-text)]"><span className="h-2.5 w-2.5 rounded-full bg-[#F97316]" /> Atrasados <span className="font-bold">{atrasados}</span></li>
              <li className="flex items-center gap-2 text-[var(--nc-text)]"><span className="h-2.5 w-2.5 rounded-full bg-slate-400" /> Saldados <span className="font-bold">{saldados}</span></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
