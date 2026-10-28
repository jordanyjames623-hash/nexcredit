import { useState, type FormEvent } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Pencil, Trash2, Plus, KeyRound, Copy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { money, shortDate } from '@/lib/format'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { BranchPicker, useBranchPickerEnabled } from '@/components/BranchPicker'
import { LocationCapture } from '@/components/LocationCapture'

type ClientRow = {
  branch_id?: string | null
  id: string; full_name: string; phone: string | null; whatsapp: string | null
  address: string | null; sector: string | null; municipality: string | null
  reference_note: string | null; document_id: string | null; notes: string | null; status: string
  portal_pin_set_at: string | null
  latitude: number | null; longitude: number | null
}
type LoanRow = {
  loan_id: string; loan_number: number; loan_type: string; status: string
  principal: number; pending_principal: number; pending_interest: number; pending_late_fee: number
  next_due_date: string | null; days_overdue: number
}
type Balance = { active_loans: number; pending_principal: number; pending_interest: number; pending_late_fee: number; total_pending: number }
type PaymentRow = { id: string; loan_number: number; receipt_number: number; total_amount: number; paid_at: string; status: string; payment_type: string }
type ActivityRow = { id: string; action: string; user_name: string | null; amount: number | null; created_at: string }

const TABS = ['resumen', 'prestamos', 'pagos', 'historial'] as const
const TAB_LABEL: Record<(typeof TABS)[number], string> = {
  resumen: 'Resumen', prestamos: 'Préstamos', pagos: 'Pagos', historial: 'Historial'
}
const PAYMENT_TYPE_LABEL: Record<string, string> = {
  regular: 'Cuota regular', principal: 'Abono a capital', interest: 'Interés', late_fee: 'Mora', custom: 'Personalizado'
}
const ACTION_LABEL: Record<string, string> = {
  client_created: 'Cliente creado', client_updated: 'Cliente editado', client_deleted: 'Cliente eliminado',
  loan_created: 'Préstamo creado', loan_updated: 'Préstamo editado',
  payment_registered: 'Pago registrado', payment_voided: 'Pago anulado'
}

export function ClientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { isOwner } = useAuth()
  const [tab, setTab] = useState<(typeof TABS)[number]>('resumen')
  const [editing, setEditing] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  const clientQuery = useQuery({
    queryKey: ['client', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, business_id, full_name, phone, whatsapp, document_id, address, sector, municipality, reference_note, notes, status, registered_at, created_by, created_at, updated_at, deleted_at, deleted_by, assigned_to, branch_id, portal_pin_set_at, portal_pin_failed_attempts, portal_pin_locked_until, latitude, longitude, location_captured_at, portal_pin_lockout_count, portal_unlock_code_expires_at, portal_unlock_attempts, portal_unlock_requested_at').eq('id', id).is('deleted_at', null).single()
      if (error) throw error
      return data as ClientRow
    }
  })

  const balanceQuery = useQuery({
    queryKey: ['client-balance', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('client_balances').select('*').eq('client_id', id).maybeSingle()
      if (error) throw error
      return data as Balance | null
    }
  })

  const loansQuery = useQuery({
    queryKey: ['client-loans', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loan_balances')
        .select('loan_id, loan_number, loan_type, status, principal, pending_principal, pending_interest, pending_late_fee, next_due_date, days_overdue')
        .eq('client_id', id)
        .order('loan_number', { ascending: false })
      if (error) throw error
      return data as LoanRow[]
    }
  })

  const paymentsQuery = useQuery({
    queryKey: ['client-payments', id],
    enabled: tab === 'pagos',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_details')
        .select('id, loan_number, receipt_number, total_amount, paid_at, status, payment_type')
        .eq('client_id', id)
        .order('paid_at', { ascending: false })
      if (error) throw error
      return data as PaymentRow[]
    }
  })

  const activityQuery = useQuery({
    queryKey: ['client-activity', id],
    enabled: tab === 'historial',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('id, action, user_name, amount, created_at')
        .eq('client_id', id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as ActivityRow[]
    }
  })

  const [deleteError, setDeleteError] = useState<string | null>(null)
  const deleteMutation = useMutation({
    mutationFn: async () => {
      // SEC-006: no borrar un cliente con préstamos activos. La consulta va directo a
      // loans (status + deleted_at exactos) en vez de la vista, para no depender de su filtro.
      const { data: activeLoans, error: loansError } = await supabase
        .from('loans')
        .select('id')
        .eq('client_id', id)
        .eq('status', 'active')
        .is('deleted_at', null)
        .limit(1)
      if (loansError) throw loansError
      if ((activeLoans ?? []).length > 0) {
        throw new Error('Este cliente tiene préstamos activos y no se puede eliminar. Salda sus préstamos primero.')
      }
      const { error } = await supabase.from('clients').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['nuevo_clients'] })
      qc.invalidateQueries({ queryKey: ['client', id] })
      navigate('/clientes')
    },
    onError: (e: any) => setDeleteError(e.message ?? 'No se pudo eliminar el cliente.')
  })

  function handleDelete() {
    setDeleteError(null)
    setShowDelete(true)
  }

  if (clientQuery.isLoading) return <p className="text-sm text-content-muted">Cargando…</p>
  if (!clientQuery.data) return <p className="text-sm text-danger">Cliente no encontrado.</p>
  const client = clientQuery.data
  const b = balanceQuery.data
  const isOverdue = (b?.pending_principal ?? 0) > 0 && (loansQuery.data ?? []).some((l) => l.days_overdue > 0)

  return (
    <div className="space-y-6">
      {deleteError && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{deleteError}</p>}
      {showDelete && (
        <Modal title="Eliminar cliente" subtitle={client.full_name} onClose={() => setShowDelete(false)} size="sm">
          <div className="space-y-4">
            <p className="text-sm text-content-muted">Esta acción queda registrada en el historial de auditoría.</p>
            <div className="flex gap-2">
              <button onClick={() => { setShowDelete(false); deleteMutation.mutate() }} disabled={deleteMutation.isPending} className="btn-solid">
                {deleteMutation.isPending ? 'Eliminando…' : 'Eliminar cliente'}
              </button>
              <button onClick={() => setShowDelete(false)} className="text-sm text-content-muted">Cancelar</button>
            </div>
          </div>
        </Modal>
      )}
      <div className="glass-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-navy text-lg font-semibold text-on-navy">
              {client.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="t-h1 text-content">{client.full_name}</h1>
                <span className={client.status === 'inactive' ? 'badge-danger' : isOverdue ? 'badge-danger' : 'badge-success'}>
                  {client.status === 'inactive' ? 'Inactivo' : isOverdue ? 'Vencido' : 'Activo'}
                </span>
              </div>
              <p className="text-sm text-content-muted">{client.phone ?? 'sin teléfono'}{client.sector ? ` · ${client.sector}` : ''}</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={() => setEditing((v) => !v)} className="rounded p-2 text-content-muted hover:bg-background hover:text-content" aria-label="Editar">
              <Pencil size={16} />
            </button>
            {isOwner && (
              <button onClick={handleDelete} className="rounded p-2 text-danger/70 hover:bg-danger/10 hover:text-danger" aria-label="Eliminar">
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        {editing ? (
          <EditClientForm client={client} onDone={() => { setEditing(false); qc.invalidateQueries({ queryKey: ['client', id] }) }} />
        ) : (
          <dl className="mt-4 grid gap-x-6 gap-y-1 border-t border-line pt-4 text-sm sm:grid-cols-2">
            {client.document_id && <Row label="Cédula" value={client.document_id} />}
            {client.whatsapp && <Row label="WhatsApp" value={client.whatsapp} />}
            {client.address && <Row label="Dirección" value={client.address} />}
            {client.municipality && <Row label="Municipio" value={client.municipality} />}
            {client.reference_note && <Row label="Referencia" value={client.reference_note} />}
            {client.notes && <Row label="Notas" value={client.notes} />}
          </dl>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              tab === t ? 'bg-primary-fill text-white' : 'glass-card text-content-muted hover:text-content'
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === 'resumen' && (
        <div className="glass-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-content">Resumen financiero</h2>
          <dl className="grid gap-3 sm:grid-cols-2">
            <SummaryRow label="Préstamos activos" value={String(b?.active_loans ?? 0)} />
            <SummaryRow label="Capital pendiente" value={`RD$ ${money(b?.pending_principal ?? 0)}`} />
            <SummaryRow label="Intereses pendientes" value={`RD$ ${money(b?.pending_interest ?? 0)}`} />
            <SummaryRow label="Mora" value={`RD$ ${money(b?.pending_late_fee ?? 0)}`} />
          </dl>
          <div className="mt-3 border-t border-line pt-3">
            <SummaryRow label="Total pendiente" value={`RD$ ${money(b?.total_pending ?? 0)}`} strong />
          </div>
        </div>
      )}

      {tab === 'resumen' && (
        <>
          <RiskProfile clientId={client.id} />
          {isOwner && <PortalAccessPanel client={client} onChanged={() => qc.invalidateQueries({ queryKey: ['client', id] })} />}
        </>
      )}

      {tab === 'prestamos' && (
        <div className="glass-card">
          <div className="ledger-rule flex items-center justify-between px-5 py-3">
            <h2 className="text-sm font-semibold text-content">Préstamos</h2>
            <Link to={`/prestamos/nuevo?cliente=${client.id}`} className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              <Plus size={14} /> Nuevo préstamo
            </Link>
          </div>
          {loansQuery.isLoading && <p className="px-5 py-4 text-sm text-content-muted">Cargando…</p>}
          {loansQuery.data?.length === 0 && <p className="px-5 py-8 text-center text-sm text-content-muted">Sin préstamos todavía.</p>}
          <ul className="divide-y divide-line">
            {loansQuery.data?.map((l) => (
              <li key={l.loan_id}>
                <Link to={`/prestamos/${l.loan_id}`} className="flex items-center justify-between px-5 py-3 hover:bg-background">
                  <div>
                    <p className="text-sm font-medium text-content">
                      Préstamo #{l.loan_number}
                      {l.status === 'paid' && <span className="badge-success ml-2">Pagado</span>}
                      {l.days_overdue > 0 && l.status === 'active' && <span className="badge-danger ml-2">{l.days_overdue}d vencido</span>}
                    </p>
                    <p className="text-xs text-content-muted">Capital RD$ {money(l.principal)} · Próxima cuota {shortDate(l.next_due_date)}</p>
                  </div>
                  <p className="money text-sm font-semibold text-content">RD$ {money(l.pending_principal + l.pending_interest + l.pending_late_fee)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'pagos' && (
        <div className="glass-card">
          <h2 className="ledger-rule px-5 py-3 text-sm font-semibold text-content">Pagos</h2>
          {paymentsQuery.isLoading && <p className="px-5 py-4 text-sm text-content-muted">Cargando…</p>}
          {paymentsQuery.data?.length === 0 && <p className="px-5 py-8 text-center text-sm text-content-muted">Sin pagos todavía.</p>}
          <ul className="divide-y divide-line">
            {paymentsQuery.data?.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className={`text-sm ${p.status === 'voided' ? 'text-content-muted line-through' : 'text-content'}`}>
                    Recibo #{p.receipt_number} · Préstamo #{p.loan_number}
                  </p>
                  <p className="text-xs text-content-muted">{PAYMENT_TYPE_LABEL[p.payment_type] ?? p.payment_type} · {shortDate(p.paid_at.slice(0, 10))}</p>
                </div>
                <p className={`money text-sm font-semibold ${p.status === 'voided' ? 'text-content-muted line-through' : 'text-success-text'}`}>RD$ {money(p.total_amount)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'historial' && (
        <div className="glass-card">
          <h2 className="ledger-rule px-5 py-3 text-sm font-semibold text-content">Historial</h2>
          {activityQuery.data?.length === 0 && <p className="px-5 py-8 text-center text-sm text-content-muted">Sin actividad registrada.</p>}
          <ul className="divide-y divide-line">
            {activityQuery.data?.map((a) => (
              <li key={a.id} className="px-5 py-3">
                <p className="text-sm text-content">{ACTION_LABEL[a.action] ?? a.action}</p>
                <p className="text-xs text-content-muted">
                  {a.user_name ?? '—'} · {new Date(a.created_at).toLocaleString('es-DO')}
                  {a.amount !== null ? ` · RD$ ${money(a.amount)}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

type RiskFactor = { key: string; label: string; weight_percent: number; computable: boolean; score: number | null; explanation: string }
type RiskScore = { score: number | null; level: string; factors: RiskFactor[] }

// Acceso del cliente a su propio portal de solo consulta (web aparte, cédula + PIN — no es una cuenta de
// staff). El PIN nunca se vuelve a mostrar una vez guardado; solo se puede reemplazar, nunca leer.
function PortalAccessPanel({ client, onChanged }: { client: ClientRow; onChanged: () => void }) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  const setPinMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('set_client_portal_pin', { p_client_id: client.id, p_pin: pin.trim() })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Acceso al portal activado'); setEditing(false); setPin(''); onChanged() },
    onError: (e: any) => setError(e.message ?? 'No se pudo guardar el PIN.')
  })

  const clearMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('clear_client_portal_pin', { p_client_id: client.id })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Acceso al portal desactivado'); onChanged() }
  })

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/portal/entrar`)
    toast.success('Enlace copiado')
  }

  return (
    <div className="glass-card space-y-3 p-5">
      <div className="flex items-center gap-2">
        <KeyRound size={18} className="text-primary" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-content">Acceso al portal del cliente</h2>
      </div>
      <p className="text-sm text-content-muted">
        Con su cédula y un PIN, el cliente puede entrar a una web aparte a consultar sus préstamos, saldo y recibos — sin poder cambiar nada.
      </p>

      {!client.document_id && <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning-text">Este cliente necesita tener la cédula registrada antes de activar su acceso.</p>}

      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); setError(null); setPinMutation.mutate() }} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="field-label" htmlFor="portal-pin">PIN (4 a 6 dígitos)</label>
            <input id="portal-pin" required inputMode="numeric" pattern="[0-9]{4,6}" maxLength={6} className="field-input w-32"
              value={pin} onChange={(e) => setPin(e.target.value)} />
          </div>
          <button type="submit" disabled={setPinMutation.isPending} className="btn-solid">{setPinMutation.isPending ? 'Guardando…' : 'Guardar PIN'}</button>
          <button type="button" onClick={() => { setEditing(false); setPin(''); setError(null) }} className="text-sm text-content-muted">Cancelar</button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setEditing(true)} disabled={!client.document_id} className="btn-secondary">
            {client.portal_pin_set_at ? 'Cambiar PIN' : 'Activar acceso'}
          </button>
          {client.portal_pin_set_at && (
            <>
              <button onClick={copyLink} className="flex items-center gap-1.5 text-sm text-primary hover:underline"><Copy size={14} aria-hidden="true" /> Copiar enlace del portal</button>
              <button onClick={() => clearMutation.mutate()} disabled={clearMutation.isPending} className="text-sm text-danger hover:underline">Desactivar acceso</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function RiskProfile({ clientId }: { clientId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['client-risk', clientId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('client_risk_score', { p_client_id: clientId })
      if (error) throw error
      return data as RiskScore
    }
  })

  if (isLoading) return null
  if (!data) return null

  const levelColor = data.level === 'Riesgo bajo' ? 'text-success-text' : data.level === 'Riesgo medio' ? 'text-warning-text' : 'text-danger'

  return (
    <div className="glass-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-content">Perfil de riesgo</h2>
        {data.score !== null ? (
          <div className="text-right">
            <p className={`text-lg font-bold ${levelColor}`}>{data.score}/100</p>
            <p className={`text-xs ${levelColor}`}>{data.level}</p>
          </div>
        ) : (
          <span className="badge-neutral">Sin datos suficientes</span>
        )}
      </div>
      <div className="space-y-2.5">
        {data.factors.map((f) => (
          <div key={f.key}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-content-muted">{f.label} <span className="text-content-muted">({f.weight_percent}%)</span></span>
              <span className={f.score === null ? 'text-content-muted' : 'font-medium text-content'}>{f.score ?? '—'}</span>
            </div>
            {f.score !== null && (
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-primary" style={{ width: `${f.score}%` }} />
              </div>
            )}
            <p className="mt-0.5 text-xs text-content-muted">{f.explanation}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <dt className="text-content-muted">{label}</dt>
      <dd className="text-right text-content">{value}</dd>
    </div>
  )
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-sm text-content-muted">{label}</dt>
      <dd className={`money text-content ${strong ? 'text-lg font-semibold' : 'text-sm'}`}>{value}</dd>
    </div>
  )
}

function EditClientForm({ client, onDone }: { client: ClientRow; onDone: () => void }) {
  const [fullName, setFullName] = useState(client.full_name)
  const [phone, setPhone] = useState(client.phone ?? '')
  const [whatsapp, setWhatsapp] = useState(client.whatsapp ?? '')
  const [address, setAddress] = useState(client.address ?? '')
  const [sector, setSector] = useState(client.sector ?? '')
  const [notes, setNotes] = useState(client.notes ?? '')
  const [branchId, setBranchId] = useState(client.branch_id ?? '')
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    client.latitude !== null && client.longitude !== null ? { lat: client.latitude, lng: client.longitude } : null
  )
  const canEditBranch = useBranchPickerEnabled()
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        full_name: fullName.trim(), phone: phone.trim() || null, whatsapp: whatsapp.trim() || null,
        address: address.trim() || null, sector: sector.trim() || null, notes: notes.trim() || null,
        latitude: location?.lat ?? null, longitude: location?.lng ?? null,
        location_captured_at: location ? new Date().toISOString() : null
      }
      // Solo el propietario del plan Business toca la sucursal; sus préstamos la siguen.
      if (canEditBranch) payload.branch_id = branchId || null
      const { error } = await supabase.from('clients').update(payload).eq('id', client.id)
      if (error) throw error
    },
    onSuccess: onDone,
    onError: (e: any) => setError(e.message ?? 'No se pudo guardar.')
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!fullName.trim()) { setError('El nombre es obligatorio.'); return }
    mutation.mutate()
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3 border-t border-line pt-4">
      {error && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0"><label className="field-label">Nombre completo</label><input aria-label="Nombre completo" className="field-input w-full min-w-0" value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
        <div className="min-w-0"><label className="field-label">Teléfono</label><input aria-label="Teléfono" className="field-input w-full min-w-0" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div className="min-w-0"><label className="field-label">WhatsApp</label><input aria-label="WhatsApp" className="field-input w-full min-w-0" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} /></div>
        <div className="min-w-0"><label className="field-label">Sector</label><input aria-label="Sector" className="field-input w-full min-w-0" value={sector} onChange={(e) => setSector(e.target.value)} /></div>
        <div className="col-span-2"><label className="field-label">Dirección</label><input aria-label="Dirección" className="field-input" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        <div className="col-span-2"><label className="field-label">Notas</label><input aria-label="Notas" className="field-input" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <div className="col-span-2"><BranchPicker value={branchId} onChange={setBranchId} emptyLabel="Sin sucursal" /></div>
        <div className="col-span-2"><LocationCapture value={location} onChange={setLocation} /></div>
      </div>
      <button type="submit" disabled={mutation.isPending} className="btn-solid">{mutation.isPending ? 'Guardando…' : 'Guardar cambios'}</button>
    </form>
  )
}
