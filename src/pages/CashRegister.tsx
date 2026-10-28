import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Wallet, Lock, Unlock, History } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { reportDayMetrics } from '@/lib/nextexRelay'
import { useAuth } from '@/contexts/AuthContext'
import { money, dateTime } from '@/lib/format'
import { PageHeader } from '@/components/ui/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { AssigneePicker } from '@/components/AssigneePicker'
import { useToast } from '@/components/ui/Toast'

// Caja / cuadre de cobradores. La base de datos ya trae el diseño: open_cash_session, close_cash_session
// y cash_session_running_total calculan todo (lo esperado se saca de los pagos en efectivo del período);
// aquí solo se construye la pantalla sobre esas funciones, sin tocar su cálculo.

type CashSession = {
  id: string; collector_id: string; opening_amount: number; opened_at: string; status: 'open' | 'closed'
  expected_amount: number | null; delivered_amount: number | null; difference: number | null
  difference_reason: string | null; closed_at: string | null
}

export function CashRegister() {
  const { session } = useAuth()
  const myId = session?.user.id ?? ''
  const [openModal, setOpenModal] = useState(false)
  const [closeModal, setCloseModal] = useState<CashSession | null>(null)

  const mine = useQuery({
    queryKey: ['cash-sessions', 'mine', myId],
    enabled: Boolean(myId),
    queryFn: async () => {
      const { data, error } = await supabase.from('cash_sessions').select('*').eq('collector_id', myId)
        .order('opened_at', { ascending: false }).limit(15)
      if (error) throw error
      return data as CashSession[]
    }
  })
  const myOpen = mine.data?.find((s) => s.status === 'open') ?? null

  // Visible para el propietario o para quien tenga el permiso 'cash_sessions.view_all'; si la consulta
  // no tiene acceso (RLS), simplemente no se muestra esta sección — no hace falta comprobarlo aparte.
  const team = useQuery({
    queryKey: ['cash-sessions', 'team'],
    queryFn: async () => {
      const { data, error } = await supabase.from('cash_sessions').select('*').order('opened_at', { ascending: false }).limit(40)
      if (error) throw error
      const ids = Array.from(new Set((data as CashSession[]).map((s) => s.collector_id)))
      const { data: people } = await supabase.from('profiles').select('id, full_name').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
      const names = new Map((people ?? []).map((p: any) => [p.id, p.full_name]))
      return (data as CashSession[]).map((s) => ({ ...s, collector_name: names.get(s.collector_id) ?? '—' }))
    }
  })
  const showTeam = (team.data?.length ?? 0) > 0 && !team.isError

  return (
    <div className="space-y-6">
      <PageHeader title="Caja" description="Abre tu caja al empezar a cobrar y ciérrala al final para cuadrar lo entregado contra lo esperado." />

      <div className="glass-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Wallet size={18} className="text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-content">Mi caja</h2>
        </div>

        {mine.isLoading ? (
          <p className="text-sm text-content-muted">Cargando…</p>
        ) : myOpen ? (
          <OpenSessionCard session={myOpen} onClose={() => setCloseModal(myOpen)} />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-content-muted">No tienes una caja abierta en este momento.</p>
            <button onClick={() => setOpenModal(true)} className="btn-solid">
              <Unlock size={16} aria-hidden="true" /> Abrir caja
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
          <SessionTable rows={mine.data!.filter((s) => s.status === 'closed')} />
        </div>
      )}

      {showTeam && (
        <div className="glass-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <History size={18} className="text-content-muted" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-content">Cajas del equipo</h2>
          </div>
          <SessionTable rows={team.data as any} showCollector />
        </div>
      )}

      {openModal && <OpenSessionModal onClose={() => setOpenModal(false)} />}
      {closeModal && <CloseSessionModal session={closeModal} onClose={() => setCloseModal(null)} />}
    </div>
  )
}

function OpenSessionCard({ session, onClose }: { session: CashSession; onClose: () => void }) {
  const { data: running } = useQuery({
    queryKey: ['cash-session-running', session.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cash_session_running_total', { p_session_id: session.id })
      if (error) throw error
      // numeric puede volver serializado como texto (precisión arbitraria) según la capa que lo entregue;
      // se convierte explícito en vez de confiar en el "as number" para no arriesgarse con eso.
      return Number(data)
    },
    refetchInterval: 30_000
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <p className="t-label">Abierta desde</p>
          <p className="text-sm font-medium text-content">{dateTime(session.opened_at).date} · {dateTime(session.opened_at).time}</p>
        </div>
        <div>
          <p className="t-label">Monto inicial</p>
          <p className="money text-sm font-medium text-content">RD$ {money(session.opening_amount)}</p>
        </div>
        <div>
          <p className="t-label">Esperado ahora (efectivo)</p>
          <p className="money text-base font-semibold text-primary-dark">{running === undefined ? '…' : `RD$ ${money(running)}`}</p>
        </div>
      </div>
      <button onClick={onClose} className="btn-secondary">
        <Lock size={16} aria-hidden="true" /> Cerrar caja
      </button>
    </div>
  )
}

function SessionTable({ rows, showCollector }: { rows: (CashSession & { collector_name?: string })[]; showCollector?: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-content-muted">Sin cajas cerradas todavía.</p>
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="table-modern min-w-[520px]">
        <thead>
          <tr>
            {showCollector && <th>Cobrador</th>}
            <th>Abierta</th>
            <th className="text-right">Inicial</th>
            <th className="text-right">Esperado</th>
            <th className="text-right">Entregado</th>
            <th className="text-right">Diferencia</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {showCollector && <td className="text-content">{r.collector_name}</td>}
              <td className="text-content-muted">{dateTime(r.opened_at).date}</td>
              <td className="money text-right text-content">{money(r.opening_amount)}</td>
              <td className="money text-right text-content">{r.expected_amount !== null ? money(r.expected_amount) : '—'}</td>
              <td className="money text-right text-content">{r.delivered_amount !== null ? money(r.delivered_amount) : '—'}</td>
              <td className={`money text-right font-semibold ${r.difference ? (r.difference > 0 ? 'text-success-text' : 'text-danger') : 'text-content-muted'}`}>
                {r.difference !== null ? money(r.difference) : '—'}
                {r.difference_reason && <span className="block text-[11px] font-normal text-content-muted">{r.difference_reason}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function OpenSessionModal({ onClose }: { onClose: () => void }) {
  const { session } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [amount, setAmount] = useState('0')
  const [collectorId, setCollectorId] = useState(session?.user.id ?? '')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('open_cash_session', {
        p_opening_amount: Number(amount || 0),
        p_collector_id: collectorId || null
      })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Caja abierta'); qc.invalidateQueries({ queryKey: ['cash-sessions'] }); onClose() },
    onError: (e: any) => setError(e.message ?? 'No se pudo abrir la caja.')
  })

  return (
    <Modal title="Abrir caja" onClose={onClose} size="sm">
      <form onSubmit={(e) => { e.preventDefault(); setError(null); mutation.mutate() }} className="space-y-4">
        {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        <AssigneePicker value={collectorId} onChange={setCollectorId} label="Abrir caja para" />
        <div>
          <label className="field-label" htmlFor="opening">Monto inicial (RD$)</label>
          <input id="opening" type="number" min="0" step="0.01" required className="field-input money" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <button type="submit" disabled={mutation.isPending} className="btn-solid w-full">{mutation.isPending ? 'Abriendo…' : 'Abrir caja'}</button>
      </form>
    </Modal>
  )
}

function CloseSessionModal({ session, onClose }: { session: CashSession; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  // NEXCREDIT-2: al cerrar la caja se envían las métricas del día a nextex (un POST por
  // métrica). Es fuego-y-olvido: si falla, la caja igual queda cerrada y el próximo
  // cierre reintenta; el día ya enviado no se vuelve a enviar.
  const { business, session: auth } = useAuth()
  const [delivered, setDelivered] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Lo esperado se conoce de antemano (misma función que usa la tarjeta de caja abierta), así que el
  // campo de motivo aparece antes de cerrar, no después — close_cash_session exige el motivo en la
  // misma llamada cuando hay diferencia; no hay un paso de "vista previa" separado en el servidor.
  const { data: expected } = useQuery({
    queryKey: ['cash-session-running', session.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cash_session_running_total', { p_session_id: session.id })
      if (error) throw error
      // numeric puede volver serializado como texto (precisión arbitraria) según la capa que lo entregue;
      // se convierte explícito en vez de confiar en el "as number" para no arriesgarse con eso.
      return Number(data)
    }
  })
  const difference = expected !== undefined && delivered.trim() ? Number(delivered) - expected : null
  const needsReason = difference !== null && Math.abs(difference) > 0.004

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('close_cash_session', {
        p_session_id: session.id,
        p_delivered_amount: Number(delivered || 0),
        p_difference_reason: reason.trim() || null
      })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Caja cerrada'); qc.invalidateQueries({ queryKey: ['cash-sessions'] }); void reportDayMetrics(business?.id ?? null, auth?.user.id ?? ''); onClose() },
    onError: (e: any) => setError(e.message ?? 'No se pudo cerrar la caja.')
  })

  return (
    <Modal title="Cerrar caja" subtitle="Lo esperado se calcula solo con los pagos en efectivo de esta caja." onClose={onClose} size="sm">
      <form onSubmit={(e) => { e.preventDefault(); setError(null); mutation.mutate() }} className="space-y-4">
        {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        <p className="rounded-lg bg-background px-3 py-2 text-sm">
          <span className="text-content-muted">Esperado ahora: </span>
          <span className="money font-semibold text-content">{expected === undefined ? '…' : `RD$ ${money(expected)}`}</span>
        </p>
        <div>
          <label className="field-label" htmlFor="delivered">Efectivo entregado (RD$)</label>
          <input id="delivered" type="number" min="0" step="0.01" required className="field-input money" value={delivered} onChange={(e) => setDelivered(e.target.value)} />
        </div>
        {needsReason && (
          <div>
            <label className="field-label" htmlFor="reason">Motivo de la diferencia (RD$ {money(difference!)})</label>
            <input id="reason" required className="field-input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        <button type="submit" disabled={mutation.isPending} className="btn-solid w-full">{mutation.isPending ? 'Cerrando…' : 'Cerrar caja'}</button>
      </form>
    </Modal>
  )
}
