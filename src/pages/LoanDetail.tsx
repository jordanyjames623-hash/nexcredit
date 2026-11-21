import { useMemo, useState, type FormEvent, type ChangeEvent } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { ArrowLeft, HandCoins, Pencil, Trash2, History } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from '@/lib/format'
import { enqueuePayment } from '@/lib/paymentQueue'
import { money, shortDate } from '@/lib/format'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useAuth } from '@/contexts/AuthContext'
import { Receipt, type ReceiptData } from '@/components/Receipt'

type LoanRow = {
  id: string; client_id: string; loan_number: number; status: string; loan_type: string
  principal: number; current_principal: number; interest_rate: number; frequency: string
  term_installments: number | null; start_date: string; first_payment_date: string; notes: string | null
  rate_basis: string; amortization_method: string | null
  grace_days: number; late_fee_type: string; late_fee_value: number
  has_collateral: boolean; collateral_description: string | null; collateral_value: number | null; collateral_image_path: string | null
}
type InstallmentRow = {
  installment_id: string; number: number; due_date: string; status: string; effective_status: string
  principal_due: number; interest_due: number; late_fee_accrued: number
  total_due: number; total_paid: number; total_pending: number; days_late: number
}
type PaymentRow = {
  id: string; receipt_number: number; payment_type: string; total_amount: number
  paid_at: string; status: string; created_by: string | null; created_by_name: string | null; void_reason: string | null
}

const TABS = ['cuotas', 'pagos', 'movimientos', 'notas'] as const
const TAB_LABEL: Record<(typeof TABS)[number], string> = { cuotas: 'Cuotas', pagos: 'Pagos', movimientos: 'Movimientos', notas: 'Notas' }
const MOVEMENT_LABEL: Record<string, string> = {
  LOAN_DISBURSEMENT: 'Préstamo desembolsado', LOAN_RENEWED: 'Renovación desembolsada', LOAN_RESTRUCTURED: 'Términos modificados',
  LOAN_SETTLED: 'Préstamo liquidado', PAYMENT_RECEIVED: 'Pago recibido', PAYMENT_REVERSED: 'Pago anulado',
  POINTS_GRANTED: 'Puntos otorgados', POINTS_REVERSED: 'Puntos anulados'
}
const FREQ_LABEL: Record<string, string> = { weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual' }
const TYPE_LABEL: Record<string, string> = { capital_interest: 'Capital + interés', interest_only: 'Solo intereses' }
const PAYMENT_TYPES = [
  { key: 'regular', label: 'Cuota regular' },
  { key: 'principal', label: 'Abono a capital' },
  { key: 'interest', label: 'Interés' },
  { key: 'late_fee', label: 'Mora' },
  { key: 'custom', label: 'Personalizado' }
] as const

export function LoanDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showDelete, setShowDelete] = useState(false)
  const qc = useQueryClient()
  const isOnline = useOnlineStatus()
  const { isOwner, session } = useAuth()
  const currentUserId = session?.user.id
  const [tab, setTab] = useState<(typeof TABS)[number]>('cuotas')
  const [showPayForm, setShowPayForm] = useState(false)
  const [showMarkOld, setShowMarkOld] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)

  function canVoid(p: PaymentRow) {
    return isOwner || p.created_by === currentUserId
  }

  const loanQuery = useQuery({
    queryKey: ['loan', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('loans').select('*').eq('id', id).single()
      if (error) throw error
      return data as LoanRow
    }
  })

  const clientQuery = useQuery({
    queryKey: ['loan-client', loanQuery.data?.client_id],
    enabled: Boolean(loanQuery.data),
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, full_name, phone').eq('id', loanQuery.data!.client_id).single()
      if (error) throw error
      return data
    }
  })

  const installmentsQuery = useQuery({
    queryKey: ['installments', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('installment_details')
        .select('installment_id, number, due_date, status, effective_status, principal_due, interest_due, late_fee_accrued, total_due, total_paid, total_pending, days_late')
        .eq('loan_id', id)
        .order('number')
      if (error) throw error
      return data as InstallmentRow[]
    }
  })

  const paymentsQuery = useQuery({
    queryKey: ['payments', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_details')
        .select('id, receipt_number, payment_type, total_amount, paid_at, status, created_by, created_by_name, void_reason')
        .eq('loan_id', id)
        .order('receipt_number', { ascending: false })
      if (error) throw error
      return data as PaymentRow[]
    }
  })

  const movementsQuery = useQuery({
    queryKey: ['movements', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_ledger')
        .select('reference, movement_type, occurred_at, amount, unit, metadata')
        .eq('loan_id', id)
        .order('occurred_at', { ascending: false })
      if (error) throw error
      return data as { reference: string; movement_type: string; occurred_at: string; amount: number; unit: string; metadata: any }[]
    }
  })

  const [loadingReceiptId, setLoadingReceiptId] = useState<string | null>(null)
  async function openPastReceipt(paymentId: string) {
    setLoadingReceiptId(paymentId)
    const { data, error } = await supabase
      .from('payment_details')
      .select('receipt_number, payment_type, paid_at, principal_amount, interest_amount, late_fee_amount, total_amount, pending_principal_after, next_due_date, next_installment_amount, status, payment_method')
      .eq('id', paymentId)
      .single()
    let enriched = data as ReceiptData | null
    if (!error && data) {
      // La cuota que cubrió el pago: payments.installment_id + las cuotas ya cargadas.
      try {
        const { data: pay } = await supabase.from('payments').select('installment_id').eq('id', paymentId).single()
        const instId = (pay as { installment_id?: string | null } | null)?.installment_id ?? null
        const rows = installmentsQuery.data ?? []
        const row = instId ? rows.find((r) => r.installment_id === instId) : undefined
        if (row) enriched = { ...data, installment_number: row.number, installment_total: rows.length } as ReceiptData
      } catch { /* sin cuota: el recibo igual abre */ }
    }
    setLoadingReceiptId(null)
    if (enriched) setReceipt(enriched)
  }

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ['loan', id] })
    qc.invalidateQueries({ queryKey: ['installments', id] })
    qc.invalidateQueries({ queryKey: ['payments', id] })
    qc.invalidateQueries({ queryKey: ['loans'] })
  }

  const deleteLoan = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('loans').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    // Sin esto la lista mostraba el prestamo borrado hasta refrescar: el borrado solo
    // navegaba a /prestamos sin invalidar las consultas de la lista nueva (nuevo_loans_*)
    // ni el inicio combinado, y la cache de 30 s las servia intactas.
    onSuccess: () => {
      invalidateAll()
      qc.invalidateQueries({ queryKey: ['nuevo_loans_balances'] })
      qc.invalidateQueries({ queryKey: ['nuevo_loans_meta'] })
      qc.invalidateQueries({ queryKey: ['nuevo_loans_installments'] })
      qc.invalidateQueries({ queryKey: ['nuevo_loans_saldado_dates'] })
      qc.invalidateQueries({ queryKey: ['nuevo_home_all'] })
      navigate('/prestamos')
    },
    onError: (e: any) => setDeleteError(e.message ?? 'No se pudo eliminar el préstamo.')
  })

  function handleDeleteLoan() {
    setDeleteError(null)
    setShowDelete(true)
  }

  // Anular ya NO usa window.prompt: el diálogo nativo se descarta solo en el navegador
  // automatizado y la anulación se cancelaba en silencio sin ningún aviso; en el celular el
  // prompt nativo también es frágil. Ahora el motivo se pide en un Modal propio (2026-10-26).
  const [voidTarget, setVoidTarget] = useState<PaymentRow | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const voidPayment = useMutation({
    mutationFn: async ({ paymentId, reason }: { paymentId: string; reason: string }) => {
      const { error } = await supabase.rpc('void_payment', { p_payment_id: paymentId, p_reason: reason })
      if (error) throw error
    },
    onSuccess: () => { setVoidTarget(null); setVoidReason(''); invalidateAll() },
    onError: (e: any) => { window.alert(e.message ?? 'No se pudo anular el pago.') }
  })

  const progress = useMemo(() => {
    const rows = installmentsQuery.data ?? []
    const totalDue = rows.reduce((s, r) => s + Number(r.total_due), 0)
    // Total pagado = efectivo total recibido (pagos activos). No se calcula desde
    // las cuotas: un abono a capital que cae en una cuota ya iniciada ya esta en
    // total_paid de esa cuota (sumarlo aparte lo cuenta dos veces), y el que va a
    // cuotas futuras no esta en ninguna cuota (no sumarlo lo deja fuera).
    // Los pagos de solo intereses NO cuentan: son una prorroga (extienden el
    // prestamo un periodo), no un abono; no avanzan el prestamo ni su progreso.
    const totalPaid = (paymentsQuery.data ?? [])
      .filter((p) => p.status === 'active' && p.payment_type !== 'interest')
      .reduce((s, p) => s + Number(p.total_amount), 0)
    const percent = totalDue > 0 ? Math.min(100, Math.round((totalPaid / totalDue) * 100)) : 0
    return { totalDue, totalPaid, percent }
  }, [installmentsQuery.data, paymentsQuery.data])

  if (loanQuery.isLoading) return <p className="text-sm text-content-muted">Cargando…</p>
  if (loanQuery.error || !loanQuery.data) return <p className="text-sm text-danger">Préstamo no encontrado.</p>
  const loan = loanQuery.data
  const latestActivePayment = paymentsQuery.data?.find((p) => p.status === 'active')
  const circumference = 2 * Math.PI * 42

  return (
    <div className="space-y-6">
      <Link to="/prestamos" className="inline-flex items-center gap-1.5 text-sm text-content-muted hover:text-content">
        <ArrowLeft size={16} /> Préstamos
      </Link>

      {deleteError && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{deleteError}</p>}

      <div className="glass-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">PR-{String(loan.loan_number).padStart(4, '0')}</p>
              {isOwner && (
                <button onClick={handleDeleteLoan} disabled={deleteLoan.isPending} className="text-content/30 hover:text-danger" aria-label="Eliminar préstamo">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <h1 className="t-h1 text-content">
              {clientQuery.isLoading ? 'Cargando…' : (clientQuery.data?.full_name ?? '—')}
              {clientQuery.data && <Link to={`/clientes/${clientQuery.data.id}`} className="ml-2 text-sm font-normal text-primary hover:underline">Ver cliente</Link>}
            </h1>
            <p className="money mt-1 text-2xl font-semibold text-content">RD$ {money(loan.principal)}</p>
            <span className={loan.status === 'paid' ? 'badge-success' : progress.totalDue > progress.totalPaid && (installmentsQuery.data ?? []).some((i) => i.days_late > 0) ? 'badge-danger' : 'badge-warning'}>
              {loan.status === 'paid' ? 'Finalizado' : 'Activo'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative h-24 w-24 shrink-0">
              <svg viewBox="0 0 96 96" className="h-24 w-24 -rotate-90">
                <circle cx="48" cy="48" r="42" fill="none" style={{ stroke: 'rgb(var(--c-line))' }} strokeWidth="8" />
                <circle
                  cx="48" cy="48" r="42" fill="none" style={{ stroke: 'rgb(var(--c-primary))', transition: 'stroke-dashoffset 0.4s ease' }} strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference - (progress.percent / 100) * circumference}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-semibold text-content">{progress.percent}%</span>
                <span className="text-[10px] text-content-muted">Pagado</span>
              </div>
            </div>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 text-sm sm:grid-cols-4">
          <InfoField label="Tasa" value={`${loan.interest_rate}%`} />
          <InfoField label="Tipo" value={TYPE_LABEL[loan.loan_type] ?? loan.loan_type} />
          <InfoField label="Plazo" value={loan.term_installments ? `${loan.term_installments} cuotas` : '—'} />
          <InfoField label="Frecuencia" value={FREQ_LABEL[loan.frequency] ?? loan.frequency} />
          <InfoField label="Fecha inicio" value={shortDate(loan.start_date)} />
          <InfoField label="Próximo pago" value={shortDate((installmentsQuery.data ?? []).find((i) => i.effective_status !== 'paid')?.due_date ?? null)} />
          <InfoField label="Capital pendiente" value={`RD$ ${money(loan.current_principal)}`} />
          <InfoField label="Total pagado" value={`RD$ ${money(progress.totalPaid)}`} />
        </dl>

        {loan.status === 'active' && (
          <>
            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={() => navigate(`/registrar-pago/${loan.id}`)} className="btn-solid w-full sm:w-auto">
                <HandCoins size={16} className="mr-1.5" /> Registrar pago
              </button>
              {isOwner && (
                <button onClick={() => setShowEdit(true)} className="btn-secondary w-full sm:w-auto">
                  <Pencil size={16} className="mr-1.5" /> Editar préstamo
                </button>
              )}
              {(paymentsQuery.data?.length ?? 0) === 0 && (
                <button onClick={() => setShowMarkOld(true)} className="btn-secondary w-full sm:w-auto">
                  <History size={16} className="mr-1.5" /> Marcar cuotas ya pagadas
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex gap-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'bg-primary-fill text-white' : 'glass-card text-content-muted hover:text-content'}`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === 'cuotas' && (
        <div className="glass-card overflow-x-auto">
          <table className="table-modern min-w-[420px]">
            <thead>
              <tr className="ledger-rule text-left text-xs text-content-muted">
                <th className="px-5 py-2 font-medium">#</th>
                <th className="px-2 py-2 font-medium">Vence</th>
                <th className="px-2 py-2 font-medium">Estado</th>
                <th className="px-5 py-2 text-right font-medium">Pendiente</th>
              </tr>
            </thead>
            <tbody>
              {installmentsQuery.data?.map((i) => (
                <tr key={i.installment_id} className="border-t border-line">
                  <td className="px-5 py-2 text-content-muted">{i.number}</td>
                  <td className="px-2 py-2 text-content-muted">{shortDate(i.due_date)}</td>
                  <td className="px-2 py-2"><StatusPill status={i.effective_status} /></td>
                  <td className="money px-5 py-2 text-right text-content">{i.effective_status === 'paid' ? '—' : `RD$ ${money(i.total_pending)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'pagos' && (
        <div className="glass-card">
          {paymentsQuery.data?.length === 0 && <p className="px-5 py-8 text-center text-sm text-content-muted">Sin pagos registrados.</p>}
          <ul className="divide-y divide-line">
            {paymentsQuery.data?.map((p) => (
              <li key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => openPastReceipt(p.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') openPastReceipt(p.id) }}
                className="flex cursor-pointer items-center justify-between px-5 py-3 hover:bg-background"
              >
                <div>
                  <p className={`text-sm font-medium ${p.status === 'voided' ? 'text-content-muted line-through' : 'text-content'}`}>
                    Recibo #{p.receipt_number} · {shortDate(p.paid_at.slice(0, 10))}
                  </p>
                  <p className="text-xs text-content-muted">
                    {p.created_by_name ?? '—'}{p.status === 'voided' && p.void_reason ? ` · Anulado: ${p.void_reason}` : ''}
                    {p.status === 'active' && loadingReceiptId !== p.id && ' · Ver comprobante'}
                    {loadingReceiptId === p.id && ' · Abriendo…'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className={`money text-sm font-semibold ${p.status === 'voided' ? 'text-content-muted line-through' : 'text-success-text'}`}>RD$ {money(p.total_amount)}</p>
                  {p.status === 'active' && canVoid(p) && isOnline && latestActivePayment?.id === p.id && (
                    <button onClick={(e) => { e.stopPropagation(); setVoidTarget(p) }} onKeyDown={(e) => e.stopPropagation()} className="text-xs text-danger hover:underline">Anular</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'movimientos' && (
        <div className="glass-card">
          {(movementsQuery.data?.length ?? 0) === 0 && <p className="px-5 py-8 text-center text-sm text-content-muted">Sin movimientos todavía.</p>}
          <ul className="divide-y divide-line">
            {movementsQuery.data?.map((m) => (
              <li key={`${m.reference}-${m.movement_type}`} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-content">{MOVEMENT_LABEL[m.movement_type] ?? m.movement_type}</p>
                  <p className="text-xs text-content-muted">{new Date(m.occurred_at).toLocaleString('es-DO')}</p>
                </div>
                <p className="money text-sm font-semibold text-content">
                  {m.unit === 'points' ? `${m.amount > 0 ? '+' : ''}${m.amount} pts` : `RD$ ${money(m.amount)}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'notas' && (
        <div className="space-y-4">
          <div className="glass-card p-5">
            <p className="text-sm text-content">{loan.notes || 'Sin notas para este préstamo.'}</p>
          </div>
          <CollateralEditor loan={loan} onSaved={invalidateAll} />
        </div>
      )}

      {showPayForm && clientQuery.data && (
        <RegisterPaymentModal
          loanId={loan.id}
          loanNumber={loan.loan_number}
          clientName={clientQuery.data.full_name}
          onClose={() => setShowPayForm(false)}
          onDone={(data) => { invalidateAll(); setShowPayForm(false); setReceipt(data) }}
          onQueued={() => setShowPayForm(false)}
        />
      )}

      {showMarkOld && (
        <MarkOldPaymentsModal
          loanId={loan.id}
          installments={(installmentsQuery.data ?? []).filter((i) => i.effective_status !== 'paid')}
          onClose={() => setShowMarkOld(false)}
          onDone={() => { invalidateAll(); setShowMarkOld(false) }}
        />
      )}

      {showEdit && (
        <EditLoanModal
          loan={loan}
          onClose={() => setShowEdit(false)}
          onSaved={() => { invalidateAll(); setShowEdit(false) }}
        />
      )}

      {receipt && clientQuery.data && (
        <Receipt payment={receipt} clientName={clientQuery.data.full_name} loanNumber={loan.loan_number} onClose={() => setReceipt(null)} />
      )}

      {showDelete && (
        <Modal title="Eliminar préstamo" subtitle={`PR-${String(loan.loan_number).padStart(4, '0')} · ${clientQuery.data?.full_name ?? ''}`} onClose={() => setShowDelete(false)} size="sm">
          <div className="space-y-4">
            <p className="text-sm text-content-muted">Los pagos ya registrados permanecen en el historial. Esta acción queda registrada en el historial de auditoría.</p>
            <div className="flex gap-2">
              <button onClick={() => { setShowDelete(false); deleteLoan.mutate() }} disabled={deleteLoan.isPending} className="btn-solid">
                {deleteLoan.isPending ? 'Eliminando…' : 'Eliminar préstamo'}
              </button>
              <button onClick={() => setShowDelete(false)} className="text-sm text-content-muted">Cancelar</button>
            </div>
          </div>
        </Modal>
      )}

      {voidTarget && (
        <Modal title="Anular pago" subtitle={`Recibo #${voidTarget.receipt_number} · RD$ ${money(voidTarget.total_amount)}`} onClose={() => setVoidTarget(null)} size="sm">
          <div className="space-y-4">
            <div>
              <label className="field-label" htmlFor="void-reason">Motivo de la anulación</label>
              <input id="void-reason" className="field-input" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Mínimo 3 caracteres" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => voidPayment.mutate({ paymentId: voidTarget.id, reason: voidReason.trim() })} disabled={voidPayment.isPending || voidReason.trim().length < 3} className="btn-solid">
                {voidPayment.isPending ? 'Anulando…' : 'Anular pago'}
              </button>
              <button onClick={() => setVoidTarget(null)} className="text-sm text-content-muted">Cancelar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-content-muted">{label}</dt>
      <dd className="font-medium text-content">{value}</dd>
    </div>
  )
}

function CollateralEditor({ loan, onSaved }: { loan: LoanRow; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [hasCollateral, setHasCollateral] = useState(loan.has_collateral)
  const [description, setDescription] = useState(loan.collateral_description ?? '')
  const [value, setValue] = useState(loan.collateral_value?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const photoQuery = useQuery({
    queryKey: ['collateral-photo', loan.collateral_image_path],
    enabled: Boolean(loan.collateral_image_path),
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('collateral').createSignedUrl(loan.collateral_image_path!, 3600)
      if (error) throw error
      return data.signedUrl
    }
  })

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('loans').update({
        has_collateral: hasCollateral,
        collateral_description: hasCollateral ? (description.trim() || null) : null,
        collateral_value: hasCollateral && value ? Number(value) : null
      }).eq('id', loan.id)
      if (error) throw error
    },
    onSuccess: () => { setEditing(false); onSaved() },
    onError: (e: any) => setError(e.message ?? 'No se pudo guardar la garantía.')
  })

  async function handlePhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError('La imagen no puede pesar más de 5 MB.'); return }
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (!['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      setError('Solo se permiten imágenes PNG, JPG o WEBP.')
      return
    }
    setError(null); setUploading(true)
    const path = `${loan.id}/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage.from('collateral').upload(path, file)
    if (uploadError) { setUploading(false); setError(uploadError.message); return }
    const { error: dbError } = await supabase.from('loans').update({ collateral_image_path: path }).eq('id', loan.id)
    setUploading(false)
    if (dbError) { setError(dbError.message); return }
    onSaved()
  }

  const photoBlock = (
    <div className="mt-3">
      {loan.collateral_image_path && photoQuery.data ? (
        <img src={photoQuery.data} alt="Garantía" className="h-40 w-full rounded-lg object-cover" />
      ) : loan.collateral_image_path ? (
        <p className="text-xs text-content-muted">Cargando foto…</p>
      ) : null}
      <label className="btn-secondary mt-2 inline-block cursor-pointer !px-3 !py-2 text-xs">
        {uploading ? 'Subiendo…' : loan.collateral_image_path ? 'Cambiar foto' : 'Agregar foto'}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/heic" className="hidden" onChange={handlePhoto} disabled={uploading} />
      </label>
    </div>
  )

  if (!editing) {
    return (
      <div className="glass-card p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-content">Garantía</h2>
          <button onClick={() => setEditing(true)} className="text-xs text-primary hover:underline">Editar</button>
        </div>
        {error && <p className="mb-2 rounded bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        {loan.has_collateral ? (
          <div className="text-sm text-content">
            <p>{loan.collateral_description || 'Sin descripción'}</p>
            {loan.collateral_value !== null && <p className="money text-content-muted">Valor estimado: RD$ {money(loan.collateral_value)}</p>}
            {photoBlock}
          </div>
        ) : (
          <p className="text-sm text-content-muted">Sin garantía registrada.</p>
        )}
      </div>
    )
  }

  return (
    <div className="glass-card space-y-3 p-5">
      <h2 className="text-sm font-semibold text-content">Garantía</h2>
      {error && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <label className="flex items-center gap-2 text-sm text-content">
        <input type="checkbox" checked={hasCollateral} onChange={(e) => setHasCollateral(e.target.checked)} />
        Este préstamo tiene garantía
      </label>
      {hasCollateral && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <input aria-label="Descripción" className="field-input col-span-2" placeholder="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} />
            <input aria-label="Valor estimado (RD$)" type="number" className="field-input money" placeholder="Valor estimado (RD$)" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          {photoBlock}
        </>
      )}
      <div className="flex gap-2">
        <button onClick={() => save.mutate()} disabled={save.isPending} className="btn-solid">{save.isPending ? 'Guardando…' : 'Guardar'}</button>
        <button onClick={() => setEditing(false)} className="text-sm text-content-muted">Cancelar</button>
      </div>
    </div>
  )
}

// Editar prestamo (solo dueno, solo prestamos activos): terminos y datos en un solo
// guardado. Los terminos van por la RPC update_loan_terms (ver MIGRACION-EDITAR-PRESTAMO.sql):
// sin pagos reconstruye todas las cuotas; con pagos solo reconstruye las futuras sin
// nada pagado (las pagadas o iniciadas no se tocan). Los datos (notas, mora, gracia) se
// guardan con un UPDATE directo del dueno (la mora y la gracia las protege el trigger
// guard_sensitive_update para no-duenos). El metodo de amortizacion y la base de la tasa
// NO se editan: se mandan los valores actuales y la reconstruccion los reusa.
const LATE_LABEL_EDIT: Record<string, string> = { none: 'Sin mora', fixed: 'Monto fijo', percent: 'Porcentaje', per_day: 'Por día', per_period: 'Por período' }

function EditLoanModal({ loan, onClose, onSaved }: {
  loan: LoanRow
  onClose: () => void
  onSaved: () => void
}) {
  const isCapital = loan.loan_type === 'capital_interest'
  const [principal, setPrincipal] = useState(String(loan.principal))
  const [interestRate, setInterestRate] = useState(String(loan.interest_rate))
  const [termInstallments, setTermInstallments] = useState(loan.term_installments ? String(loan.term_installments) : '')
  const [frequency, setFrequency] = useState(loan.frequency)
  const [notes, setNotes] = useState(loan.notes ?? '')
  const [lateFeeType, setLateFeeType] = useState(loan.late_fee_type ?? 'none')
  const [lateFeeValue, setLateFeeValue] = useState(loan.late_fee_value ? String(loan.late_fee_value) : '')
  const [graceDays, setGraceDays] = useState(loan.grace_days ? String(loan.grace_days) : '')
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  const termsChanged = Number(principal) !== Number(loan.principal)
    || Number(interestRate) !== Number(loan.interest_rate)
    || (isCapital && Number(termInstallments) !== Number(loan.term_installments))
    || frequency !== loan.frequency
  const dataChanged = (notes.trim() || null) !== (loan.notes ?? null)
    || lateFeeType !== (loan.late_fee_type ?? 'none')
    || Number(lateFeeValue || 0) !== Number(loan.late_fee_value || 0)
    || Number(graceDays || 0) !== Number(loan.grace_days || 0)

  const mutation = useMutation({
    mutationFn: async () => {
      if (termsChanged) {
        const { error } = await supabase.rpc('update_loan_terms', {
          p_loan_id: loan.id,
          p_principal: Number(principal),
          p_interest_rate: Number(interestRate),
          p_rate_basis: loan.rate_basis,
          p_amortization_method: loan.amortization_method,
          p_frequency: frequency,
          p_term_installments: isCapital ? Number(termInstallments) : null,
          p_start_date: loan.start_date,
          p_first_payment_date: loan.first_payment_date
        })
        if (error) throw error
      }
      if (dataChanged) {
        const { error: dataError } = await supabase.from('loans').update({
          notes: notes.trim() || null,
          late_fee_type: lateFeeType,
          late_fee_value: Number(lateFeeValue || 0),
          grace_days: Number(graceDays || 0)
        }).eq('id', loan.id)
        if (dataError) throw dataError
      }
    },
    onSuccess: () => { toast.success('Préstamo actualizado'); onSaved() },
    onError: (e: any) => setError(e.message ?? 'No se pudo guardar los cambios.')
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!principal || Number(principal) <= 0) { setError('Escribe un monto mayor que cero.'); return }
    if (interestRate === '' || Number.isNaN(Number(interestRate)) || Number(interestRate) < 0 || Number(interestRate) > 100) { setError('Escribe una tasa entre 0 y 100.'); return }
    if (isCapital && (!termInstallments || Number(termInstallments) < 1)) { setError('Escribe el número de cuotas.'); return }
    if (Number(lateFeeValue || 0) < 0) { setError('El valor de la mora no puede ser negativo.'); return }
    if (Number(graceDays || 0) < 0) { setError('Los días de gracia no pueden ser negativos.'); return }
    mutation.mutate()
  }

  return (
    <Modal title="Editar préstamo" subtitle={`PR-${String(loan.loan_number).padStart(4, '0')}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        <div>
          <p className="mb-2 text-sm font-semibold text-content">Términos</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="el-monto">Capital (RD$)</label>
              <input id="el-monto" type="number" min="0.01" step="0.01" required className="field-input money" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
            </div>
            <div>
              <label className="field-label" htmlFor="el-tasa">Tasa de interés (%)</label>
              <input id="el-tasa" type="number" min="0" max="100" step="0.01" required className="field-input money" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} />
            </div>
            {isCapital && (
              <div>
                <label className="field-label" htmlFor="el-cuotas">Número de cuotas</label>
                <input id="el-cuotas" type="number" min="1" required className="field-input" value={termInstallments} onChange={(e) => setTermInstallments(e.target.value)} />
              </div>
            )}
            <div>
              <label className="field-label" htmlFor="el-freq">Frecuencia de pago</label>
              <select id="el-freq" className="field-input" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                {Object.entries(FREQ_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          {termsChanged && (
            <p className="mt-2 text-xs text-content-muted">Las cuotas pendientes se recalculan con los nuevos términos. Las cuotas ya pagadas no cambian.</p>
          )}
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-content">Datos</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="field-label" htmlFor="el-mora-tipo">Mora</label>
              <select id="el-mora-tipo" className="field-input" value={lateFeeType} onChange={(e) => setLateFeeType(e.target.value)}>
                {Object.entries(LATE_LABEL_EDIT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="el-mora-valor">Valor de mora</label>
              <input id="el-mora-valor" type="number" min="0" step="0.01" disabled={lateFeeType === 'none'} className="field-input money" value={lateFeeValue} onChange={(e) => setLateFeeValue(e.target.value)} />
            </div>
            <div>
              <label className="field-label" htmlFor="el-gracia">Días de gracia</label>
              <input id="el-gracia" type="number" min="0" className="field-input" value={graceDays} onChange={(e) => setGraceDays(e.target.value)} />
            </div>
          </div>
          <div className="mt-3">
            <label className="field-label" htmlFor="el-notas">Notas</label>
            <input id="el-notas" className="field-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <button type="submit" disabled={mutation.isPending || (!termsChanged && !dataChanged)} className="btn-solid w-full disabled:opacity-50">
          {mutation.isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>
    </Modal>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = { paid: 'badge-success', overdue: 'badge-danger', partial: 'badge-warning', pending: 'badge-neutral' }
  const label: Record<string, string> = { paid: 'Pagada', overdue: 'Vencida', partial: 'Parcial', pending: 'Pendiente' }
  return <span className={map[status] ?? 'badge-neutral'}>{label[status] ?? status}</span>
}

// Para préstamos que ya existían antes de usar NEXCREDIT: en vez de registrar uno por uno cada pago que
// el cliente ya hizo en la vida real, se marcan de una vez las primeras N cuotas — cada una con SU
// PROPIA fecha de vencimiento como fecha de pago (se asume que se pagaron puntuales; si alguna tuvo una
// fecha distinta, se corrige después con "Registrar pago" normal, que si acepta elegir otra fecha... en
// realidad no la pide, así que para una fecha distinta puntual conviene anular y re-ingresar esa una).
// Solo aparece mientras el préstamo no tenga ningún pago registrado todavía — su único propósito es el
// arranque de un préstamo importado, no un atajo de uso diario.
function MarkOldPaymentsModal({ loanId, installments, onClose, onDone }: {
  loanId: string
  installments: { number: number; due_date: string }[]
  onClose: () => void
  onDone: () => void
}) {
  const [count, setCount] = useState(Math.min(1, installments.length))
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const toast = useToast()

  const selected = installments.slice(0, count)

  const mutation = useMutation({
    mutationFn: async () => {
      for (let idx = 0; idx < selected.length; idx++) {
        setProgress(idx + 1)
        const key = `old-import-${loanId}-${selected[idx].number}-${crypto.randomUUID()}`
        const { data, error } = await supabase.rpc('register_payment', {
          p_loan_id: loanId, p_payment_type: 'regular', p_amount: null, p_principal: 0, p_interest: 0, p_late_fee: 0,
          p_idempotency_key: key, p_notes: 'Importado — pago anterior a usar NEXCREDIT', p_payment_method: 'cash',
          p_paid_at: selected[idx].due_date
        })
        if (error) throw new Error(`Cuota #${selected[idx].number}: ${error.message}`)
        void data
      }
    },
    onSuccess: () => { toast.success(`${selected.length} cuota(s) marcada(s) como pagada(s)`); onDone() },
    onError: (e: any) => setError(e.message ?? 'No se pudo completar. Las cuotas ya procesadas antes del error quedaron registradas.')
  })

  return (
    <Modal title="Marcar cuotas ya pagadas" subtitle="Para un préstamo que ya traías de antes de usar NEXCREDIT." onClose={onClose} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-content-muted">
          Cada cuota se registra con su propia fecha de vencimiento como fecha de pago (se asume que se pagaron puntuales).
          Si alguna fue en una fecha distinta, regístrala aparte con "Registrar pago" después de esto.
        </p>
        {error && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        <div>
          <label className="field-label" htmlFor="old-count">¿Cuántas cuotas ya se pagaron?</label>
          <input id="old-count" type="number" min={1} max={installments.length} className="field-input"
            value={count} onChange={(e) => setCount(Math.max(1, Math.min(installments.length, Number(e.target.value))))} />
        </div>
        {selected.length > 0 && (
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-line p-2 text-sm text-content-muted">
            {selected.map((i) => (
              <li key={i.number}>Cuota #{i.number} — {shortDate(i.due_date)}</li>
            ))}
          </ul>
        )}
        <button onClick={() => { setError(null); mutation.mutate() }} disabled={mutation.isPending || selected.length === 0} className="btn-solid w-full">
          {mutation.isPending ? `Registrando cuota ${progress} de ${selected.length}…` : `Marcar ${selected.length} cuota(s) como pagada(s)`}
        </button>
      </div>
    </Modal>
  )
}

function RegisterPaymentModal({ loanId, loanNumber, clientName, onClose, onDone, onQueued }: {
  loanId: string; loanNumber: number; clientName: string
  onClose: () => void; onDone: (payment: ReceiptData) => void; onQueued: () => void
}) {
  const [type, setType] = useState<(typeof PAYMENT_TYPES)[number]['key']>('regular')
  const [amount, setAmount] = useState('')
  const [principalAmt, setPrincipalAmt] = useState('')
  const [interestAmt, setInterestAmt] = useState('')
  const [lateFeeAmt, setLateFeeAmt] = useState('')
  const [notes, setNotes] = useState('')
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>('cash')
  const [error, setError] = useState<string | null>(null)
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const toast = useToast()

  function currentFields() {
    return {
      p_loan_id: loanId,
      p_payment_type: type,
      p_amount: type === 'regular' ? (amount.trim() ? Number(amount) : null) : type === 'custom' ? null : Number(amount),
      p_principal: type === 'custom' ? Number(principalAmt || 0) : 0,
      p_interest: type === 'custom' ? Number(interestAmt || 0) : 0,
      p_late_fee: type === 'custom' ? Number(lateFeeAmt || 0) : 0,
      p_payment_method: method,
      p_paid_at: new Date().toISOString()
    }
  }

  // Un pago sin conexión se guarda en este dispositivo con SU PROPIA llave de idempotencia y se envía solo
  // al recuperar señal (ver lib/paymentQueue.ts): el servidor nunca lo aplica dos veces, aunque se reintente.
  function queueOffline() {
    const f = currentFields()
    enqueuePayment({
      idempotency_key: idempotencyKey, loan_id: loanId, loan_number: loanNumber, client_name: clientName,
      payment_type: f.p_payment_type, amount: f.p_amount, principal: f.p_principal, interest: f.p_interest,
      late_fee: f.p_late_fee, payment_method: f.p_payment_method, notes: notes.trim() || null
    })
    toast.success('Pago guardado. Se enviará al recuperar señal.')
    onQueued()
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const f = currentFields()
      const { data, error } = await supabase.rpc('register_payment', {
        ...f, p_idempotency_key: idempotencyKey, p_notes: notes.trim() || null
      })
      if (error) throw error
      return data as ReceiptData
    },
    onSuccess: (data) => { toast.success('Pago registrado'); onDone(data) },
    onError: (e: any) => {
      // Mismo criterio que lib/paymentQueue.ts: sin código de Postgres, la petición nunca llegó a responder.
      const networkIssue = !e?.code
      if (networkIssue) { queueOffline(); return }
      setError(e.message ?? 'No se pudo registrar el pago.')
    }
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!navigator.onLine) { queueOffline(); return }
    mutation.mutate()
  }

  const previewTotal = type === 'custom'
    ? (Number(principalAmt || 0) + Number(interestAmt || 0) + Number(lateFeeAmt || 0))
    : (amount ? Number(amount) : null)

  return (
    <Modal title="Registrar pago" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        <div className="flex flex-wrap gap-1">
          {PAYMENT_TYPES.map((t) => (
            <button type="button" key={t.key} onClick={() => setType(t.key)}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${type === t.key ? 'bg-primary-fill text-white' : 'bg-background text-content-muted hover:bg-line/40'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {type === 'custom' ? (
          <div className="grid grid-cols-3 gap-3">
            <div><label className="field-label" htmlFor="p">Capital</label><input id="p" type="number" min="0" step="0.01" className="field-input money" value={principalAmt} onChange={(e) => setPrincipalAmt(e.target.value)} /></div>
            <div><label className="field-label" htmlFor="i">Interés</label><input id="i" type="number" min="0" step="0.01" className="field-input money" value={interestAmt} onChange={(e) => setInterestAmt(e.target.value)} /></div>
            <div><label className="field-label" htmlFor="l">Mora</label><input id="l" type="number" min="0" step="0.01" className="field-input money" value={lateFeeAmt} onChange={(e) => setLateFeeAmt(e.target.value)} /></div>
          </div>
        ) : (
          <div>
            <label className="field-label" htmlFor="amount">Monto {type === 'regular' && '(vacío = pago completo de la cuota)'}</label>
            <input id="amount" type="number" min="0" step="0.01" required={type !== 'regular'} className="field-input money" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        )}

        <div>
          <label className="field-label" htmlFor="method">Método de pago</label>
          <select id="method" className="field-input" value={method} onChange={(e) => setMethod(e.target.value as (typeof PAYMENT_METHODS)[number])}>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
          </select>
        </div>

        <div><label className="field-label" htmlFor="notes">Notas (opcional)</label><input id="notes" className="field-input" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

        {previewTotal !== null && (
          <div className="flex items-center justify-between rounded-lg bg-background px-3 py-2.5 text-sm">
            <span className="text-content-muted">Total a registrar</span>
            <span className="money font-semibold text-content">RD$ {money(previewTotal)}</span>
          </div>
        )}

        <button type="submit" disabled={mutation.isPending} className="btn-solid w-full">
          {mutation.isPending ? 'Registrando…' : 'Confirmar pago'}
        </button>
      </form>
    </Modal>
  )
}
