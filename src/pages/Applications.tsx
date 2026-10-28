import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import { money, shortDate } from '@/lib/format'
import { useAuth } from '@/contexts/AuthContext'
import { planErrorMessage } from '@/components/UpgradeToProModal'

type Status = 'new' | 'in_review' | 'approved' | 'rejected' | 'disbursed'
type Frequency = 'weekly' | 'biweekly' | 'monthly'

type Application = {
  id: string; client_id: string | null; applicant_name: string; applicant_phone: string | null
  requested_amount: number; term_installments: number | null; frequency: Frequency | null
  purpose: string | null; notes: string | null; status: Status; decision_reason: string | null
  loan_id: string | null; created_at: string
}

const STATUS_META: Record<Status, { label: string; badge: string }> = {
  'new': { label: 'Nueva', badge: 'badge-neutral' },
  in_review: { label: 'En evaluación', badge: 'badge-warning' },
  approved: { label: 'Aprobada', badge: 'badge-success' },
  rejected: { label: 'Rechazada', badge: 'badge-danger' },
  disbursed: { label: 'Desembolsada', badge: 'badge-success' }
}

const TILE_LABEL: Record<string, string> = { 'new': 'Nuevas', in_review: 'En evaluación', approved: 'Aprobadas', rejected: 'Rechazadas' }
const FREQ_LABEL: Record<Frequency, string> = { weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual' }
const FILTERS: { v: 'all' | Status; l: string }[] = [
  { v: 'all', l: 'Todas' }, { v: 'new', l: 'Nuevas' }, { v: 'in_review', l: 'En evaluación' },
  { v: 'approved', l: 'Aprobadas' }, { v: 'rejected', l: 'Rechazadas' }, { v: 'disbursed', l: 'Desembolsadas' }
]

export function Applications() {
  const { isOwner } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'all' | Status>('all')
  const [showForm, setShowForm] = useState(false)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const listQuery = useQuery({
    queryKey: ['applications'],
    queryFn: async () => {
      const { data, error: listError } = await supabase.from('loan_applications').select('*').order('created_at', { ascending: false })
      if (listError) throw listError
      return data as Application[]
    }
  })

  const statusMutation = useMutation({
    mutationFn: async ({ id, status, why }: { id: string; status: Status; why?: string }) => {
      const { error: rpcError } = await supabase.rpc('set_application_status', { p_id: id, p_status: status, p_reason: why ?? null })
      if (rpcError) throw rpcError
    },
    onSuccess: () => {
      toast.success('Solicitud actualizada')
      setError(null); setRejectingId(null); setReason('')
      qc.invalidateQueries({ queryKey: ['applications'] })
      qc.invalidateQueries({ queryKey: ['dashboard_applications_summary'] })
    },
    onError: (e: any) => setError(planErrorMessage(e.message) ?? e.message ?? 'No se pudo actualizar la solicitud.')
  })

  const all = listQuery.data ?? []
  const rows = filter === 'all' ? all : all.filter((a) => a.status === filter)
  const count = (st: Status) => all.filter((a) => a.status === st).length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="t-h1 text-content">Solicitudes de préstamo</h1>
          <p className="text-sm text-content-muted">Registra, evalúa y aprueba solicitudes antes de desembolsar.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="btn-solid">
          <Plus size={16} className="mr-1.5" /> Nueva solicitud
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(['new', 'in_review', 'approved', 'rejected'] as Status[]).map((st) => (
          <div key={st} className="glass-card p-4">
            <p className="text-xs text-content-muted">{TILE_LABEL[st]}</p>
            <p className="mt-1 text-xl font-semibold text-content">{count(st)}</p>
          </div>
        ))}
      </div>

      {showForm && <ApplicationForm onDone={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['applications'] }); qc.invalidateQueries({ queryKey: ['dashboard_applications_summary'] }) }} />}

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.v} onClick={() => setFilter(f.v)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f.v ? 'bg-primary-fill text-white' : 'bg-navy/5 text-content-muted hover:bg-navy/10'}`}
          >
            {f.l}
          </button>
        ))}
      </div>

      {error && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {listQuery.isLoading && <p className="text-sm text-content-muted">Cargando…</p>}
      {listQuery.error && <p className="text-sm text-danger">No se pudieron cargar las solicitudes.</p>}
      {!listQuery.isLoading && rows.length === 0 && (
        <p className="glass-card p-6 text-center text-sm text-content-muted">No hay solicitudes en esta vista.</p>
      )}

      <div className="space-y-3">
        {rows.map((a) => {
          const meta = STATUS_META[a.status]
          const busy = statusMutation.isPending
          return (
            <div key={a.id} className="glass-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-content">{a.applicant_name}</p>
                  <p className="text-xs text-content-muted">
                    {a.applicant_phone ?? 'Sin teléfono'} · {shortDate(a.created_at.slice(0, 10))}
                    {a.client_id ? '' : ' · aún no es cliente'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="money font-semibold text-content">RD$ {money(a.requested_amount)}</p>
                  <span className={meta.badge}>{meta.label}</span>
                </div>
              </div>

              <p className="mt-2 text-xs text-content-muted">
                {a.term_installments ? `${a.term_installments} cuotas` : 'Plazo sin definir'}
                {a.frequency ? ` · ${FREQ_LABEL[a.frequency]}` : ''}
                {a.purpose ? ` · ${a.purpose}` : ''}
              </p>
              {a.notes && <p className="mt-1 text-xs text-content-muted">{a.notes}</p>}
              {a.status === 'rejected' && a.decision_reason && <p className="mt-1 text-xs text-danger">Motivo: {a.decision_reason}</p>}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {a.status === 'new' && (
                  <button disabled={busy} onClick={() => statusMutation.mutate({ id: a.id, status: 'in_review' })} className="btn-secondary !px-3 !py-1.5 text-xs">Pasar a evaluación</button>
                )}
                {isOwner && (a.status === 'new' || a.status === 'in_review') && (
                  <button disabled={busy} onClick={() => statusMutation.mutate({ id: a.id, status: 'approved' })} className="btn-solid !px-3 !py-1.5 text-xs">Aprobar</button>
                )}
                {isOwner && (a.status === 'new' || a.status === 'in_review' || a.status === 'approved') && (
                  <button disabled={busy} onClick={() => { setRejectingId(rejectingId === a.id ? null : a.id); setReason('') }} className="text-xs font-medium text-danger hover:underline">
                    {a.status === 'approved' ? 'Revocar aprobación' : 'Rechazar'}
                  </button>
                )}
                {isOwner && a.status === 'rejected' && (
                  <button disabled={busy} onClick={() => statusMutation.mutate({ id: a.id, status: 'in_review' })} className="text-xs font-medium text-primary hover:underline">Reabrir</button>
                )}
                {a.status === 'approved' && (
                  <button
                    onClick={() => navigate(`/prestamos/nuevo?solicitud=${a.id}${a.client_id ? `&cliente=${a.client_id}` : ''}`)}
                    className="btn-solid !px-3 !py-1.5 text-xs"
                  >
                    Crear préstamo
                  </button>
                )}
                {a.status === 'disbursed' && a.loan_id && (
                  <Link to={`/prestamos/${a.loan_id}`} className="text-xs font-medium text-primary hover:underline">Ver préstamo</Link>
                )}
              </div>

              {rejectingId === a.id && (
                <div className="mt-3 flex gap-2">
                  <input aria-label="Motivo (obligatorio)" className="field-input" placeholder="Motivo (obligatorio)" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <button
                    disabled={busy || !reason.trim()} onClick={() => statusMutation.mutate({ id: a.id, status: 'rejected', why: reason })}
                    className="btn-secondary shrink-0 !px-3 text-xs"
                  >
                    Confirmar
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ───────────────────────── Formulario ───────────────────────── */

function ApplicationForm({ onDone }: { onDone: () => void }) {
  const toast = useToast()
  const [clientId, setClientId] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [term, setTerm] = useState('')
  const [frequency, setFrequency] = useState<'' | Frequency>('')
  const [purpose, setPurpose] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const clientsQuery = useQuery({
    queryKey: ['applications-clients'],
    queryFn: async () => {
      const { data, error: clientsError } = await supabase.from('clients').select('id, full_name, phone').eq('status', 'active').is('deleted_at', null).order('full_name')
      if (clientsError) throw clientsError
      return data as { id: string; full_name: string; phone: string | null }[]
    }
  })

  function pickClient(id: string) {
    setClientId(id)
    const c = clientsQuery.data?.find((x) => x.id === id)
    if (c) { setName(c.full_name); setPhone(c.phone ?? '') }
  }

  const create = useMutation({
    mutationFn: async () => {
      const { error: rpcError } = await supabase.rpc('create_loan_application', {
        p_applicant_name: name.trim(),
        p_amount: Number(amount),
        p_client_id: clientId || null,
        p_phone: phone.trim() || null,
        p_term: term ? Number(term) : null,
        p_frequency: frequency || null,
        p_purpose: purpose.trim() || null,
        p_notes: notes.trim() || null
      })
      if (rpcError) throw rpcError
    },
    onSuccess: () => { toast.success('Solicitud registrada'); onDone() },
    onError: (e: any) => setError(planErrorMessage(e.message) ?? e.message ?? 'No se pudo guardar la solicitud.')
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('Escribe el nombre del solicitante.'); return }
    if (!Number(amount) || Number(amount) <= 0) { setError('Indica el monto solicitado.'); return }
    create.mutate()
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card space-y-3 p-5">
      <h2 className="text-sm font-semibold text-content">Nueva solicitud</h2>
      {error && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="field-label">¿Ya es cliente?</label>
          <select aria-label="¿Ya es cliente?" className="field-input" value={clientId} onChange={(e) => pickClient(e.target.value)}>
            <option value="">No, es un solicitante nuevo</option>
            {(clientsQuery.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
        </div>
        <div className="min-w-0"><label className="field-label">Nombre del solicitante</label><input aria-label="Nombre del solicitante" className="field-input w-full min-w-0" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="min-w-0"><label className="field-label">Teléfono</label><input aria-label="Teléfono" className="field-input w-full min-w-0" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div className="min-w-0"><label className="field-label">Monto solicitado (RD$)</label><input aria-label="Monto solicitado (RD$)" type="number" min="0" className="field-input money w-full min-w-0" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div className="min-w-0"><label className="field-label">Cuotas (opcional)</label><input aria-label="Cuotas (opcional)" type="number" min="1" className="field-input w-full min-w-0" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
        <div className="min-w-0">
          <label className="field-label">Frecuencia (opcional)</label>
          <select aria-label="Frecuencia (opcional)" className="field-input w-full min-w-0" value={frequency} onChange={(e) => setFrequency(e.target.value as '' | Frequency)}>
            <option value="">Sin definir</option>
            <option value="weekly">Semanal</option>
            <option value="biweekly">Quincenal</option>
            <option value="monthly">Mensual</option>
          </select>
        </div>
        <div className="min-w-0"><label className="field-label">Para qué lo necesita</label><input aria-label="Para qué lo necesita" className="field-input w-full min-w-0" value={purpose} onChange={(e) => setPurpose(e.target.value)} /></div>
        <div className="col-span-2"><label className="field-label">Notas</label><input aria-label="Notas" className="field-input" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
      <button type="submit" disabled={create.isPending} className="btn-solid">{create.isPending ? 'Guardando…' : 'Guardar solicitud'}</button>
    </form>
  )
}
