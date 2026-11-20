// Rutear — panel nuevo
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Route, Wallet, Lock, History, Play } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { money, dateTime } from '@/lib/format'
import { PageHeader } from '@/components/ui/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'


// Rutear: abrir un ruteo por ruta con un capital inicial, ver el resumen en vivo
// y cerrar con cuadre. La base de datos ya trae el diseño: open_ruteo, ruteo_resumen
// y close_cash_session calculan todo; aquí solo se construye la pantalla sobre esas
// funciones, sin tocar su cálculo. Las sesiones de ruteo son cash_sessions con
// route_id no nulo.


type RuteoSession = {
  id: string; collector_id: string; route_id: string | null; opening_amount: number; opened_at: string; status: 'open' | 'closed'
  expected_amount: number | null; delivered_amount: number | null; difference: number | null
  difference_reason: string | null; closed_at: string | null
  collector_name?: string
}


type RuteoResumen = {
  opening_amount: number; collected_cash: number; collected_transfer: number; collected_off_route_cash: number
  lent: number; expenses: number; expected_cash: number; target_amount: number; target_clients: number
  collected_clients: number; delivered_amount: number | null; difference: number | null
}


type RouteBalance = {
  route_id: string; name: string; is_active: boolean; client_count: number; total_pending: number
  overdue_clients: number; scoped_to_viewer?: boolean
}


function normalizeResumen(data: unknown): RuteoResumen {
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>
  const num = (v: unknown) => Number(v ?? 0)
  return {
    opening_amount: num(row?.opening_amount),
    collected_cash: num(row?.collected_cash),
    collected_transfer: num(row?.collected_transfer),
    collected_off_route_cash: num(row?.collected_off_route_cash),
    lent: num(row?.lent),
    expenses: num(row?.expenses),
    expected_cash: num(row?.expected_cash),
    target_amount: num(row?.target_amount),
    target_clients: num(row?.target_clients),
    collected_clients: num(row?.collected_clients),
    delivered_amount: row?.delivered_amount == null ? null : num(row?.delivered_amount),
    difference: row?.difference == null ? null : num(row?.difference)
  }
}


export function Rutear() {
  const { session } = useAuth()
  const myId = session?.user.id ?? ''
  const [openModal, setOpenModal] = useState(false)
  const [closeModal, setCloseModal] = useState<RuteoSession | null>(null)
  const [filterCollector, setFilterCollector] = useState('')
  const [filterRoute, setFilterRoute] = useState('')
  const [filterDate, setFilterDate] = useState('')


  const routes = useQuery({
    queryKey: ['route-balances'],
    queryFn: async () => {
      const { data, error } = await supabase.from('route_balances')
        .select('route_id, name, is_active, client_count, total_pending, overdue_clients, scoped_to_viewer')
        .eq('is_active', true).order('name')
      if (error) throw error
      return data as RouteBalance[]
    }
  })
  const routeNames = new Map((routes.data ?? []).map((r) => [r.route_id, r.name]))


  const mine = useQuery({
    queryKey: ['cash-sessions', 'ruteo', 'mine', myId],
    enabled: Boolean(myId),
    queryFn: async () => {
      const { data, error } = await supabase.from('cash_sessions').select('*').eq('collector_id', myId)
        .not('route_id', 'is', null).order('opened_at', { ascending: false }).limit(15)
      if (error) throw error
      return data as RuteoSession[]
    }
  })
  const myOpen = mine.data?.find((s) => s.status === 'open') ?? null


  // Visible para el propietario o para quien tenga acceso (RLS); si la consulta no
  // devuelve filas, simplemente no se muestra esta sección.
  const team = useQuery({
    queryKey: ['cash-sessions', 'ruteo', 'team'],
    queryFn: async () => {
      const { data, error } = await supabase.from('cash_sessions').select('*').not('route_id', 'is', null)
        .order('opened_at', { ascending: false }).limit(40)
      if (error) throw error
      const ids = Array.from(new Set((data as RuteoSession[]).map((s) => s.collector_id)))
      const { data: people } = await supabase.from('profiles').select('id, full_name').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
      const names = new Map((people ?? []).map((p: any) => [p.id, p.full_name]))
      return (data as RuteoSession[]).map((s) => ({ ...s, collector_name: names.get(s.collector_id) ?? '—' }))
    }
  })
  const showTeam = (team.data?.length ?? 0) > 0 && !team.isError
  const collectors = Array.from(new Map((team.data ?? []).map((s) => [s.collector_id, s.collector_name ?? '—'])).entries())
  const history = (team.data ?? []).filter((s) =>
    (!filterCollector || s.collector_id === filterCollector) &&
    (!filterRoute || s.route_id === filterRoute) &&
    (!filterDate || s.opened_at.slice(0, 10) === filterDate)
  )


  return (
    <div className="space-y-6">
      <PageHeader title="Rutear" description="Abre tu ruteo al empezar a cobrar una ruta y ciérralo al final para cuadrar lo entregado contra lo esperado." />


      <div className="glass-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Wallet size={18} className="text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-content">Mi ruteo</h2>
        </div>


        {mine.isLoading ? (
          <p className="text-sm text-content-muted">Cargando…</p>
        ) : myOpen ? (
          <OpenRuteoCard session={myOpen} routeName={myOpen.route_id ? routeNames.get(myOpen.route_id) : undefined} onClose={() => setCloseModal(myOpen)} />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-content-muted">No tienes un ruteo abierto en este momento.</p>
            <button onClick={() => setOpenModal(true)} className="btn-solid">
              <Play size={16} aria-hidden="true" /> Abrir ruteo
            </button>
          </div>
        )}
      </div>


      {(mine.data?.length ?? 0) > 0 && (
        <div className="glass-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <History size={18} className="text-content-muted" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-content">Mi historial</h2>
          </div>
          <RuteoTable rows={mine.data!.filter((s) => s.status === 'closed')} routeNames={routeNames} />
        </div>
      )}


      {showTeam && (
        <div className="glass-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <History size={18} className="text-content-muted" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-content">Ruteos del equipo</h2>
          </div>
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="field-label" htmlFor="filter-employee">Empleado</label>
              <select id="filter-employee" className="field-input" value={filterCollector} onChange={(e) => setFilterCollector(e.target.value)}>
                <option value="">Todos</option>
                {collectors.map(([id, name]) => (<option key={id} value={id}>{name}</option>))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="filter-route">Ruta</label>
              <select id="filter-route" className="field-input" value={filterRoute} onChange={(e) => setFilterRoute(e.target.value)}>
                <option value="">Todas</option>
                {(routes.data ?? []).map((r) => (<option key={r.route_id} value={r.route_id}>{r.name}</option>))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="filter-date">Fecha</label>
              <input id="filter-date" type="date" className="field-input" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
            </div>
          </div>
          <RuteoTable rows={history} routeNames={routeNames} showCollector />
        </div>
      )}


      {openModal && <OpenRuteoModal routes={routes.data ?? []} onClose={() => setOpenModal(false)} />}
      {closeModal && <CloseRuteoModal session={closeModal} onClose={() => setCloseModal(null)} />}
    </div>
  )
}


function OpenRuteoCard({ session, routeName, onClose }: { session: RuteoSession; routeName?: string; onClose: () => void }) {
  const { data: resumen } = useQuery({
    queryKey: ['ruteo-resumen', session.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ruteo_resumen', { p_session_id: session.id })
      if (error) throw error
      return normalizeResumen(data)
    },
    refetchInterval: 30000
  })


  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <p className="t-label">Ruta</p>
          <p className="flex items-center gap-1 text-sm font-medium text-content"><Route size={16} aria-hidden="true" /> {routeName ?? '—'}</p>
        </div>
        <div>
          <p className="t-label">Abierta desde</p>
          <p className="text-sm font-medium text-content">{dateTime(session.opened_at).date} · {dateTime(session.opened_at).time}</p>
        </div>
        <div>
          <p className="t-label">Capital inicial</p>
          <p className="money text-sm font-medium text-content">RD$ {money(session.opening_amount)}</p>
        </div>
        <div>
          <p className="t-label">Cobrado en efectivo</p>
          <p className="money text-sm font-medium text-content">{resumen === undefined ? '…' : `RD$ ${money(resumen.collected_cash)}`}</p>
        </div>
        <div>
          <p className="t-label">Cobrado por transferencia</p>
          <p className="money text-sm font-medium text-content">{resumen === undefined ? '…' : `RD$ ${money(resumen.collected_transfer)}`}</p>
        </div>
        <div>
          <p className="t-label">Cobrado fuera de ruta (efectivo)</p>
          <p className="money text-sm font-medium text-content">{resumen === undefined ? '…' : `RD$ ${money(resumen.collected_off_route_cash)}`}</p>
        </div>
        <div>
          <p className="t-label">Prestado</p>
          <p className="money text-sm font-medium text-content">{resumen === undefined ? '…' : `RD$ ${money(resumen.lent)}`}</p>
        </div>
        <div>
          <p className="t-label">Gastos</p>
          <p className="money text-sm font-medium text-content">{resumen === undefined ? '…' : `RD$ ${money(resumen.expenses)}`}</p>
        </div>
        <div>
          <p className="t-label">Esperado ahora (efectivo)</p>
          <p className="money text-base font-semibold text-primary-dark">{resumen === undefined ? '…' : `RD$ ${money(resumen.expected_cash)}`}</p>
        </div>
        <div>
          <p className="t-label">Meta de la ruta</p>
          <p className="money text-sm font-medium text-content">{resumen === undefined ? '…' : `RD$ ${money(resumen.target_amount)}`}</p>
        </div>
        <div>
          <p className="t-label">Clientes cobrados</p>
          <p className="text-sm font-medium text-content">{resumen === undefined ? '…' : `${resumen.collected_clients} de ${resumen.target_clients}`}</p>
        </div>
      </div>
      <button onClick={onClose} className="btn-secondary">
        <Lock size={16} aria-hidden="true" /> Cerrar ruteo
      </button>
    </div>
  )
}


function OpenRuteoModal({ routes, onClose }: { routes: RouteBalance[]; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [routeId, setRouteId] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)


  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('open_ruteo', {
        p_route_id: routeId,
        p_opening_amount: Number(amount || 0)
      })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Ruteo abierto'); qc.invalidateQueries({ queryKey: ['cash-sessions'] }); onClose() },
    onError: (e: any) => setError(e.message ?? 'No se pudo abrir el ruteo.')
  })


  return (
    <Modal title="Abrir ruteo" subtitle="Elige la ruta y el capital con el que sales a cobrar." onClose={onClose} size="sm">
      <form onSubmit={(e) => { e.preventDefault(); setError(null); mutation.mutate() }} className="space-y-4">
        {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        <div>
          <label className="field-label" htmlFor="route">Ruta</label>
          <select id="route" required className="field-input" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            <option value="">Selecciona una ruta</option>
            {routes.map((r) => (<option key={r.route_id} value={r.route_id}>{r.name}</option>))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="opening">Capital inicial (RD$)</label>
          <input id="opening" type="number" min="0" step="0.01" required className="field-input money" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <button type="submit" disabled={mutation.isPending} className="btn-solid w-full">
          <Play size={16} aria-hidden="true" /> {mutation.isPending ? 'Abriendo…' : 'Abrir ruteo'}
        </button>
      </form>
    </Modal>
  )
}


function RuteoTable({ rows, routeNames, showCollector }: { rows: (RuteoSession & { collector_name?: string })[]; routeNames: Map<string, string>; showCollector?: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-content-muted">Sin ruteos todavía.</p>
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="table-modern min-w-[640px]">
        <thead>
          <tr>
            {showCollector && <th>Cobrador</th>}
            <th>Ruta</th>
            <th>Abierta</th>
            <th>Cerrada</th>
            <th>Inicial</th>
            <th>Entregado</th>
            <th>Diferencia</th>
            <th>Motivo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              {showCollector && <td>{s.collector_name ?? '—'}</td>}
              <td>{s.route_id ? routeNames.get(s.route_id) ?? '—' : '—'}</td>
              <td>{dateTime(s.opened_at).date} · {dateTime(s.opened_at).time}</td>
              <td>{s.closed_at ? `${dateTime(s.closed_at).date} · ${dateTime(s.closed_at).time}` : '—'}</td>
              <td className="money">RD$ {money(s.opening_amount)}</td>
              <td className="money">{s.delivered_amount == null ? '—' : `RD$ ${money(s.delivered_amount)}`}</td>
              <td className="money">{s.difference == null ? '—' : `RD$ ${money(s.difference)}`}</td>
              <td>{s.difference_reason ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}


function CloseRuteoModal({ session, onClose }: { session: RuteoSession; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { session: authSession } = useAuth()
  const myEmail = authSession?.user.email ?? ''
  const [password, setPassword] = useState('')
  const [verified, setVerified] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [delivered, setDelivered] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)


  // Lo esperado se conoce de antemano (mismo resumen que usa la tarjeta del ruteo
  // abierto), así que el campo de motivo aparece antes de cerrar, no después —
  // close_cash_session exige el motivo en la misma llamada cuando hay diferencia.
  const { data: resumen } = useQuery({
    queryKey: ['ruteo-resumen', session.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ruteo_resumen', { p_session_id: session.id })
      if (error) throw error
      return normalizeResumen(data)
    },
    refetchInterval: 30000
  })
  const expected = resumen === undefined ? undefined : resumen.expected_cash
  const difference = expected !== undefined && delivered.trim() ? Number(delivered) - expected : null
  const needsReason = difference !== null && Math.abs(difference) > 0.004
  const differenceLabel = difference === null ? null : Math.abs(difference) <= 0.004 ? 'Cuadrado' : difference > 0 ? 'Sobrante' : 'Faltante'


  async function verifyPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setVerifying(true)
    const { error } = await supabase.auth.signInWithPassword({ email: myEmail, password })
    setVerifying(false)
    if (error) { setError(error.message ?? 'La contraseña no es correcta.'); return }
    setVerified(true)
  }


  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('close_cash_session', {
        p_session_id: session.id,
        p_delivered_amount: Number(delivered || 0),
        p_difference_reason: reason.trim() || null
      })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Ruteo cerrado'); qc.invalidateQueries({ queryKey: ['cash-sessions'] }); onClose() },
    onError: (e: any) => setError(e.message ?? 'No se pudo cerrar el ruteo.')
  })


  return (
    <Modal title="Cerrar ruteo" subtitle="Primero confirma tu contraseña y luego entrega el efectivo para cuadrar." onClose={onClose} size="sm">
      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      {!verified ? (
        <form onSubmit={verifyPassword} className="space-y-4">
          <p className="text-sm text-content-muted">Confirma que eres tú con tu contraseña ({myEmail || 'sin correo en la sesión'}).</p>
          <div>
            <label className="field-label" htmlFor="password">Contraseña</label>
            <input id="password" type="password" required autoComplete="current-password" className="field-input" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button type="submit" disabled={verifying} className="btn-solid w-full">
            <Lock size={16} aria-hidden="true" /> {verifying ? 'Verificando…' : 'Verificar contraseña'}
          </button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); setError(null); mutation.mutate() }} className="space-y-4">
          <p className="rounded-lg bg-background px-3 py-2 text-sm">
            <span className="text-content-muted">Esperado ahora: </span>
            <span className="money font-semibold text-content">{expected === undefined ? '…' : `RD$ ${money(expected)}`}</span>
          </p>
          <div>
            <label className="field-label" htmlFor="delivered">Monto devuelto (RD$)</label>
            <input id="delivered" type="number" min="0" step="0.01" required className="field-input money" value={delivered} onChange={(e) => setDelivered(e.target.value)} />
          </div>
          {difference !== null && differenceLabel && (
            <p className="rounded-lg bg-background px-3 py-2 text-sm">
              <span className="text-content-muted">Diferencia: </span>
              <span className="money font-semibold text-content">{differenceLabel} · RD$ {money(difference)}</span>
            </p>
          )}
          {needsReason && (
            <div>
              <label className="field-label" htmlFor="reason">Motivo de la diferencia (RD$ {money(difference!)})</label>
              <input id="reason" required className="field-input" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
          <button type="submit" disabled={mutation.isPending} className="btn-solid w-full">{mutation.isPending ? 'Cerrando…' : 'Cerrar ruteo'}</button>
        </form>
      )}
    </Modal>
  )
}
