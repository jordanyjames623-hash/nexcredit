import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Calculator, X as XIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { AssigneePicker } from '@/components/AssigneePicker'
import { UpgradeToProModal, parsePlanLimitError } from '@/components/UpgradeToProModal'
import { RiskProfile } from '@/pages/ClientDetail'
import { shortDate } from '@/lib/format'
import { money0, freqStep, FREQ_LABEL } from './lib'
import { getFileExtension, isAllowedUpload } from '@/lib/fileValidation'

// Nuevo prestamo con TODAS las opciones viejas, en 4 pasos con el aspecto actual (como el
// asistente viejo): 1 Cliente, 2 Prestamo (+ mora), 3 Evaluacion (+ garantia), 4 Resumen.
// Producto, tipo, metodo, mora, dias de gracia, fecha de inicio, garantia con foto,
// renovacion, notas, evaluacion del cliente, vista previa del calendario y resumen antes
// de crear. Recibe los datos de la calculadora por
// ?monto=&tasa=&cuotas=&frecuencia=, de una renovacion por ?renueva= y de una solicitud
// aprobada por ?solicitud=. Los colores salen de var(--nc-*).
type ScheduleRow = { number: number; due_date: string; principal_due: number; interest_due: number }

const METHOD_LABEL: Record<string, string> = {
  flat_total: 'Capital + interés (total, sin importar el tiempo)', flat_per_installment: 'Interés por cuota',
  declining_balance: 'Saldo decreciente', french: 'Cuota fija (francés)'
}
const LATE_LABEL: Record<string, string> = { none: 'Sin mora', fixed: 'Monto fijo', percent: 'Porcentaje', per_day: 'Por día', per_period: 'Por período' }

function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function NewLoanSimple() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { session } = useAuth()
  const toast = useToast()
  const today = localToday()
  const initialFreq = ['weekly', 'biweekly', 'monthly'].includes(params.get('frecuencia') ?? '') ? params.get('frecuencia')! : 'monthly'

  const [clientId, setClientId] = useState(params.get('cliente') ?? '')
  const renewedFromLoanId = params.get('renueva') || null
  const applicationId = params.get('solicitud') || null
  const [loanType, setLoanType] = useState<'capital_interest' | 'interest_only'>('capital_interest')
  // El metodo elegido decide solo, internamente, como se aplica la tasa: saldo decreciente
  // y frances siempre calculan con tasa por periodo; "Interes fijo" se separo en dos para
  // no tener que preguntarlo: sin importar el tiempo o por cuota.
  const [displayMethod, setDisplayMethod] = useState<'flat_total' | 'flat_per_installment' | 'declining_balance' | 'french'>('flat_total')
  const amortizationMethod = displayMethod === 'french' ? 'french' : displayMethod === 'declining_balance' ? 'declining_balance' : 'fixed_on_principal'
  const rateBasis = displayMethod === 'flat_total' ? 'per_term' : 'per_period'
  const [principal, setPrincipal] = useState(params.get('monto') ?? '')
  // La tasa que viene por URL solo se prellena si es un número entre 0 y 100:
  // ?tasa=999 quedaba prellenada sin ningún error visible (hallazgo 2026-10-27).
  const rawRate = params.get('tasa') ?? ''
  const initialRate = rawRate !== '' && !Number.isNaN(Number(rawRate)) && Number(rawRate) >= 0 && Number(rawRate) <= 100 ? rawRate : ''
  const [interestRate, setInterestRate] = useState(initialRate)
  const [frequency, setFrequency] = useState(initialFreq)
  const [termInstallments, setTermInstallments] = useState(params.get('cuotas') ?? '12')
  const [startDate, setStartDate] = useState(today)
  const [firstPaymentDate, setFirstPaymentDate] = useState(() => freqStep(today, initialFreq))
  const [firstPaymentTouched, setFirstPaymentTouched] = useState(false)
  const [lateFeeType, setLateFeeType] = useState<'none' | 'fixed' | 'percent' | 'per_day' | 'per_period'>('none')
  const [lateFeeValue, setLateFeeValue] = useState('0')
  const [graceDays, setGraceDays] = useState('0')
  const [notes, setNotes] = useState('')
  const [renewalThreshold, setRenewalThreshold] = useState('50')
  const [hasCollateral, setHasCollateral] = useState(false)
  const [collateralDescription, setCollateralDescription] = useState('')
  const [collateralValue, setCollateralValue] = useState('')
  const [collateralPhoto, setCollateralPhoto] = useState<File | null>(null)
  const [assignedTo, setAssignedTo] = useState(session?.user.id ?? '')
  const [showInstallmentPanel, setShowInstallmentPanel] = useState(false)
  const [desiredInstallment, setDesiredInstallment] = useState('')
  const [solvingRate, setSolvingRate] = useState(false)
  const [solveError, setSolveError] = useState<string | null>(null)
  const [solvedNote, setSolvedNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [upgradeReason, setUpgradeReason] = useState<ReturnType<typeof parsePlanLimitError>>(null)
  const [prefilled, setPrefilled] = useState(false)
  // Pasos (como el asistente viejo, pero con el aspecto actual): 1 Cliente, 2 Préstamo
  // (+ mora), 3 Evaluación (+ garantía), 4 Confirmación. Todo se muestra por pasos para
  // no tirar todas las opciones de golpe; los datos se guardan entre pasos.
  const [step, setStep] = useState(1)
  const STEPS = ['Cliente', 'Préstamo', 'Evaluación', 'Confirmación']

  const { data: clients } = useQuery({
    queryKey: ['nuevo_clients_select'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, full_name').eq('status', 'active').is('deleted_at', null).order('full_name')
      if (error) throw error
      return data as { id: string; full_name: string }[]
    }
  })

  const { data: products } = useQuery({
    queryKey: ['nuevo_loan_products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('loan_products').select('*').eq('is_active', true).order('name')
      if (error) throw error
      return data as any[]
    }
  })

  // Si viene de una solicitud aprobada, se prellenan los datos y al crear el prestamo se enlaza.
  const applicationQuery = useQuery({
    queryKey: ['nuevo_application_prefill', applicationId],
    enabled: Boolean(applicationId),
    queryFn: async () => {
      const { data, error: appError } = await supabase
        .from('loan_applications')
        .select('client_id, applicant_name, requested_amount, term_installments, frequency')
        .eq('id', applicationId)
        .single()
      if (appError) throw appError
      return data as { client_id: string | null; applicant_name: string; requested_amount: number; term_installments: number | null; frequency: 'weekly' | 'biweekly' | 'monthly' | null }
    }
  })
  useEffect(() => {
    const a = applicationQuery.data
    if (!a || prefilled) return
    if (a.client_id) setClientId(a.client_id)
    setPrincipal(String(a.requested_amount))
    if (a.term_installments) setTermInstallments(String(a.term_installments))
    if (a.frequency) setFrequency(a.frequency)
    setPrefilled(true)
  }, [applicationQuery.data, prefilled])

  const exposureQuery = useQuery({
    queryKey: ['nuevo_client_exposure', clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await supabase.from('client_balances').select('active_loans, total_pending').eq('client_id', clientId).maybeSingle()
      if (error) throw error
      return data as { active_loans: number; total_pending: number } | null
    }
  })

  function applyProduct(id: string) {
    const p = products?.find((x) => x.id === id)
    if (!p) return
    setLoanType(p.loan_type)
    setDisplayMethod(
      p.amortization_method === 'declining_balance' ? 'declining_balance'
      : p.amortization_method === 'french' ? 'french'
      : p.rate_basis === 'per_period' ? 'flat_per_installment' : 'flat_total'
    )
    setInterestRate(String(p.interest_rate)); setFrequency(p.frequency)
    if (p.term_installments) setTermInstallments(String(p.term_installments))
    setLateFeeType(p.late_fee_type); setLateFeeValue(String(p.late_fee_value))
  }

  const isCapital = loanType === 'capital_interest'
  const canPreview = principal && interestRate && (loanType === 'interest_only' || termInstallments) && firstPaymentDate
  const preview = useQuery({
    queryKey: ['nuevo_preview_schedule', loanType, amortizationMethod, principal, interestRate, rateBasis, frequency, termInstallments, firstPaymentDate],
    enabled: Boolean(canPreview),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('preview_loan_schedule', {
        p_loan_type: loanType,
        p_principal: Number(principal),
        p_interest_rate: Number(interestRate),
        p_rate_basis: rateBasis,
        p_amortization_method: loanType === 'capital_interest' ? amortizationMethod : null,
        p_frequency: frequency,
        p_term_installments: loanType === 'capital_interest' ? Number(termInstallments) : null,
        p_first_payment_date: firstPaymentDate
      })
      if (error) throw error
      return data as ScheduleRow[]
    }
  })
  const rows = preview.data ?? []
  const totalPrincipal = rows.reduce((sum, r) => sum + Number(r.principal_due), 0)
  const totalInterest = rows.reduce((sum, r) => sum + Number(r.interest_due), 0)
  const firstInstallment = rows.length > 0 ? Number(rows[0].principal_due) + Number(rows[0].interest_due) : null
  // Saldo decreciente no tiene una sola cuota fija (cada una es distinta por diseno) — ahi no aplica.
  const canFixInstallment = !isCapital || amortizationMethod !== 'declining_balance'

  function goToStep(n: number) {
    setError(null)
    setStep(n)
    window.scrollTo(0, 0)
  }
  function nextStep() {
    setError(null)
    if (step === 1 && !clientId) { setError('Selecciona un cliente.'); return }
    if (step === 2) {
      if (!principal || Number(principal) <= 0) { setError('Escribe un monto mayor que cero.'); return }
      if (!interestRate) { setError('Escribe la tasa de interés.'); return }
      if (Number.isNaN(Number(interestRate)) || Number(interestRate) < 0 || Number(interestRate) > 100) { setError('Escribe una tasa entre 0 y 100.'); return }
      if (isCapital && (!termInstallments || Number(termInstallments) < 1)) { setError('Escribe el número de cuotas.'); return }
      if (!firstPaymentDate) { setError('Elige la fecha del primer pago.'); return }
    }
    goToStep(step + 1)
  }

  async function handleSolveRate() {
    setSolveError(null)
    setSolvedNote(null)
    const desired = Number(desiredInstallment)
    const princ = Number(principal)
    const term = Number(termInstallments)
    if (!desired || desired <= 0) { setSolveError('Escribe la cuota que quieres cobrar.'); return }
    if (!princ || princ <= 0) { setSolveError('Primero escribe el capital.'); return }
    if (isCapital && (!term || term < 1)) { setSolveError('Primero escribe el número de cuotas.'); return }
    setSolvingRate(true)
    try {
      const { data, error } = await supabase.rpc('solve_rate_for_installment', {
        p_loan_type: loanType, p_principal: princ, p_desired_installment: desired,
        p_rate_basis: rateBasis, p_amortization_method: isCapital ? amortizationMethod : null,
        p_frequency: frequency, p_term_installments: isCapital ? term : null
      })
      if (error) throw error
      setInterestRate(Number(data).toFixed(2))
      setSolvedNote(`Tasa calculada: ${Number(data).toFixed(2)}% para que la cuota salga en RD$ ${money0(desired)}.`)
    } catch (err: any) {
      setSolveError(err.message ?? 'No se pudo calcular la tasa con esos datos.')
    } finally {
      setSolvingRate(false)
    }
  }

  const createLoan = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_loan', {
        p_client_id: clientId,
        p_loan_type: loanType,
        p_principal: Number(principal),
        p_interest_rate: Number(interestRate),
        p_rate_basis: rateBasis,
        p_amortization_method: loanType === 'capital_interest' ? amortizationMethod : null,
        p_frequency: frequency,
        p_term_installments: loanType === 'capital_interest' ? Number(termInstallments) : null,
        p_start_date: startDate,
        p_first_payment_date: firstPaymentDate,
        p_late_fee_type: lateFeeType,
        p_late_fee_value: Number(lateFeeValue || 0),
        p_grace_days: Number(graceDays || 0),
        p_notes: notes.trim() || null,
        p_assigned_to: assignedTo || null,
        p_renewal_threshold_percent: Number(renewalThreshold || 50),
        p_renewed_from_loan_id: renewedFromLoanId
      })
      if (error) throw error
      return data
    },
    onSuccess: async (data: string) => {
      let uploadErrorMessage: string | null = null
      if (hasCollateral) {
        let imagePath: string | null = null
        if (collateralPhoto) {
          const ext = getFileExtension(collateralPhoto.name) || 'jpg'
          const path = `${data}/${Date.now()}.${ext}`
          const { error: uploadError } = await supabase.storage.from('collateral').upload(path, collateralPhoto)
          if (!uploadError) imagePath = path
          else uploadErrorMessage = uploadError.message
        }
        await supabase.from('loans').update({
          has_collateral: true,
          collateral_description: collateralDescription.trim() || null,
          collateral_value: collateralValue ? Number(collateralValue) : null,
          collateral_image_path: imagePath
        }).eq('id', data)
      }
      if (applicationId) {
        await supabase.rpc('complete_loan_application', { p_id: applicationId, p_loan_id: data })
      }
      if (uploadErrorMessage) toast.error(`Préstamo creado, pero la foto NO se subió: ${uploadErrorMessage}`)
      else toast.success('Préstamo creado')
      navigate(`/prestamos/${data}`, { replace: true })
    },
    onError: (e: any) => {
      const reason = parsePlanLimitError(e.message)
      if (reason) setUpgradeReason(reason)
      else setError(e.message ?? 'No se pudo crear el préstamo.')
    }
  })

  function changeFrequency(v: string) {
    setFrequency(v)
    if (!firstPaymentTouched) setFirstPaymentDate(freqStep(startDate, v))
  }
  function changeStartDate(v: string) {
    setStartDate(v)
    if (!firstPaymentTouched && v) setFirstPaymentDate(freqStep(v, frequency))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!clientId) { setError('Selecciona un cliente.'); return }
    if (!principal || Number(principal) <= 0) { setError('Escribe un monto mayor que cero.'); return }
    if (!interestRate) { setError('Escribe la tasa de interés.'); return }
    if (Number.isNaN(Number(interestRate)) || Number(interestRate) < 0 || Number(interestRate) > 100) { setError('Escribe una tasa entre 0 y 100.'); return }
    if (isCapital && (!termInstallments || Number(termInstallments) < 1)) { setError('Escribe el número de cuotas.'); return }
    if (!firstPaymentDate) { setError('Elige la fecha del primer pago.'); return }
    if (hasCollateral && collateralPhoto) {
  if (!isAllowedUpload(collateralPhoto, ['png', 'jpg', 'jpeg', 'webp'], ['image/png', 'image/jpeg', 'image/webp'])) { setError('La foto de la garantía debe ser PNG, JPG o WEBP.'); return }
      if (collateralPhoto.size > 5 * 1024 * 1024) { setError('La foto de la garantía no puede pesar más de 5 MB.'); return }
    }
    createLoan.mutate()
  }

  const field = 'w-full rounded-xl bg-[var(--nc-soft)] px-3 py-2.5 text-sm text-[var(--nc-text)] outline-none placeholder:text-[var(--nc-faint)] focus:ring-2 focus:ring-[#2563EB]'
  // Las fechas llevan menos relleno y letra un poco menor: en el iPhone el campo de fecha
  // no se encoge solo y el de la izquierda quedaba encima del de la derecha.
  const dateField = 'w-full min-w-0 rounded-xl bg-[var(--nc-soft)] px-2 py-2.5 text-[13px] text-[var(--nc-text)] outline-none focus:ring-2 focus:ring-[#2563EB]'
  const label = 'mb-1 block text-xs font-medium text-[var(--nc-muted)]'
  const card = 'rounded-[22px] bg-[var(--nc-card)] p-4 space-y-3'
  const sectionTitle = 'text-base font-bold text-[var(--nc-text)]'
  const sectionSub = 'text-xs text-[var(--nc-muted)]'
  const clientRow = clients?.find((c) => c.id === clientId)
  const exposure = exposureQuery.data

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[28px] font-bold leading-tight text-[var(--nc-text)]">Nuevo préstamo</h1>
        <p className="text-sm text-[var(--nc-muted)]">Completa los datos y crea el préstamo.</p>
      </div>

      {renewedFromLoanId && <p className="rounded-xl bg-[#60A5FA]/10 px-3 py-2 text-sm text-[#60A5FA]">Esto crea una renovación — quedará vinculada al préstamo original.</p>}
      {applicationId && applicationQuery.data && (
        <p className="rounded-xl bg-[#60A5FA]/10 px-3 py-2 text-sm text-[#60A5FA]">
          Desembolsando la solicitud de {applicationQuery.data.applicant_name}.
          {applicationQuery.data.client_id ? '' : ' Todavía no es cliente: selecciónalo abajo (o créalo primero en Clientes).'}
        </p>
      )}

      <div>
        <p className="text-sm font-semibold text-[var(--nc-text)]">Paso {step} de 4 · {STEPS[step - 1]}</p>
        <div className="mt-2 flex gap-1.5" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s} className={`h-1.5 flex-1 rounded-full ${i + 1 <= step ? 'bg-[#2563EB]' : 'bg-[var(--nc-soft)]'}`} />
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">{error}</p>}

        {step === 1 && (
        <div className={card}>
          <h2 className={sectionTitle}>Cliente</h2>
          {(products?.length ?? 0) > 0 && (
            <div>
              <label className={label} htmlFor="nl-producto">Producto (opcional, prellena los campos)</label>
              <select id="nl-producto" className={field} defaultValue="" onChange={(e) => e.target.value && applyProduct(e.target.value)}>
                <option value="">Sin producto — llenar manualmente</option>
                {products!.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className={label} htmlFor="nl-cliente">Cliente</label>
            <select id="nl-cliente" required value={clientId} onChange={(e) => setClientId(e.target.value)} className={field}>
              <option value="">Selecciona…</option>
              {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
          </div>
          <AssigneePicker value={assignedTo} onChange={setAssignedTo} label="Asignar préstamo a" />
        </div>
        )}

        {step === 2 && (
        <>
        <div className={card}>
          <div className="flex items-center justify-between gap-2">
            <h2 className={sectionTitle}>Préstamo</h2>
            {canFixInstallment ? (
              <button type="button" onClick={() => setShowInstallmentPanel((v) => !v)}
                className="flex items-center gap-1 rounded-lg bg-[var(--nc-soft)] px-3 py-2 text-xs font-medium text-[var(--nc-text)]">
                <Calculator size={14} /> Fijar cuota deseada
              </button>
            ) : (
              <p className="max-w-[12rem] text-right text-xs text-[var(--nc-muted)]">Saldo decreciente no tiene una sola cuota fija.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="nl-tipo">Tipo</label>
              <select id="nl-tipo" className={field} value={loanType} onChange={(e) => setLoanType(e.target.value as any)}>
                <option value="capital_interest">Capital + interés</option>
                <option value="interest_only">Solo interés</option>
              </select>
            </div>
            {isCapital && (
              <div>
                <label className={label} htmlFor="nl-metodo">Método</label>
                <select id="nl-metodo" className={field} value={displayMethod} onChange={(e) => setDisplayMethod(e.target.value as any)}>
                  <option value="flat_total">Capital + interés (total, sin importar el tiempo)</option>
                  <option value="flat_per_installment">Interés por cuota</option>
                  <option value="declining_balance">Saldo decreciente</option>
                  <option value="french">Cuota fija (francés)</option>
                </select>
              </div>
            )}
            <div>
              <label className={label} htmlFor="nl-monto">Capital (RD$)</label>
              <input id="nl-monto" type="number" min="0.01" step="0.01" required value={principal} onChange={(e) => setPrincipal(e.target.value)} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="nl-tasa">Tasa de interés (%)</label>
              <input id="nl-tasa" type="number" min="0" max="100" step="0.01" required value={interestRate} onChange={(e) => setInterestRate(e.target.value)} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="nl-freq">Frecuencia de pago</label>
              <select id="nl-freq" value={frequency} onChange={(e) => changeFrequency(e.target.value)} className={field}>
                {Object.entries(FREQ_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            {isCapital && (
              <div>
                <label className={label} htmlFor="nl-cuotas">Número de cuotas</label>
                <input id="nl-cuotas" type="number" min="1" required value={termInstallments} onChange={(e) => setTermInstallments(e.target.value)} className={field} />
              </div>
            )}
            {/* Fechas en el celular: apiladas Y CENTRADAS (barra de 300px con márgenes
               iguales a ambos lados), lado a lado desde sm como en web. El campo de fecha
               del iPhone impone un ancho mínimo propio que ignora min-width: 0, por eso a
               lo ancho completo se veía corrido hacia la derecha; con 300px centrados y
               letra 12px en móvil el control cabe sin pelear con el ancho y queda simétrico.
               En web no cambia nada (13px, lado a lado). Versión restaurada 2026-10-26: a JC
               no le gustó el intento de ancho de columna con letra 10px. */}
            <div className="col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0 max-sm:mx-auto max-sm:w-full max-sm:max-w-[300px]">
                <label className={label} htmlFor="nl-inicio">Fecha de inicio</label>
                <input id="nl-inicio" type="date" required value={startDate} onChange={(e) => changeStartDate(e.target.value)} className={`${dateField} max-sm:text-[12px]`} />
              </div>
              <div className="min-w-0 max-sm:mx-auto max-sm:w-full max-sm:max-w-[300px]">
                <label className={label} htmlFor="nl-primero">Fecha del primer pago</label>
                <input id="nl-primero" type="date" required value={firstPaymentDate} onChange={(e) => { setFirstPaymentDate(e.target.value); setFirstPaymentTouched(true) }} className={`${dateField} max-sm:text-[12px]`} />
              </div>
            </div>
          </div>
          <p className="text-xs text-[var(--nc-muted)]">Fecha de inicio: hoy, salvo que sea un préstamo que ya traías de antes.</p>

          {showInstallmentPanel && canFixInstallment && (
            <div className="rounded-xl border border-[#2563EB]/30 bg-[#2563EB]/5 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--nc-text)]">Fijar cuota deseada</p>
                <button type="button" onClick={() => setShowInstallmentPanel(false)} aria-label="Cerrar" className="rounded-lg p-1 text-[var(--nc-muted)] hover:text-[var(--nc-text)]">
                  <XIcon size={16} />
                </button>
              </div>
              <p className="mb-3 text-xs text-[var(--nc-muted)]">
                En vez de escribir la tasa, di cuánto quieres que pague el cliente por cuota — calculamos la tasa que hace que cuadre exacto, con el capital y el plazo que ya pusiste.
              </p>
              {solveError && <p className="mb-3 rounded bg-red-500/10 px-3 py-2 text-xs text-red-400">{solveError}</p>}
              {solvedNote && <p className="mb-3 rounded bg-green-500/10 px-3 py-2 text-xs text-green-400">{solvedNote}</p>}
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className={label} htmlFor="nl-cuota-deseada">Cuota deseada (RD$)</label>
                  <input id="nl-cuota-deseada" type="number" min="0.01" step="0.01" className={field} style={{ maxWidth: '10rem' }}
                    value={desiredInstallment} onChange={(e) => setDesiredInstallment(e.target.value)} />
                </div>
                <button type="button" onClick={handleSolveRate} disabled={solvingRate} className="rounded-xl bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white">
                  {solvingRate ? 'Calculando…' : 'Calcular tasa'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className={card}>
          <h2 className={sectionTitle}>Mora por atraso</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={label} htmlFor="nl-mora-tipo">Tipo</label>
              <select id="nl-mora-tipo" className={field} value={lateFeeType} onChange={(e) => setLateFeeType(e.target.value as any)}>
                <option value="none">Ninguna</option>
                <option value="fixed">Monto fijo</option>
                <option value="percent">Porcentaje</option>
                <option value="per_day">Por día</option>
                <option value="per_period">Por período</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="nl-mora-valor">Valor</label>
              <input id="nl-mora-valor" type="number" min="0" step="0.01" disabled={lateFeeType === 'none'} className={field} value={lateFeeValue} onChange={(e) => setLateFeeValue(e.target.value)} />
            </div>
            <div>
              <label className={label} htmlFor="nl-gracia">Días de gracia</label>
              <input id="nl-gracia" type="number" min="0" className={field} value={graceDays} onChange={(e) => setGraceDays(e.target.value)} />
            </div>
          </div>
        </div>
        </>
        )}

        {step === 3 && (
        <>
        <div className={card}>
          <h2 className={sectionTitle}>Evaluación</h2>
          <p className={sectionSub}>Riesgo del cliente y calendario de pagos antes de crear.</p>
          {clientId ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-[var(--nc-border)] p-3">
                  <p className="text-xs text-[var(--nc-muted)]">Préstamos activos</p>
                  <p className="text-lg font-bold text-[var(--nc-text)]">{exposure ? exposure.active_loans : 0}</p>
                </div>
                <div className="rounded-xl border border-[var(--nc-border)] p-3">
                  <p className="text-xs text-[var(--nc-muted)]">Saldo pendiente actual</p>
                  <p className="text-lg font-bold text-[var(--nc-text)]">RD$ {money0(exposure ? Number(exposure.total_pending) : 0)}</p>
                </div>
              </div>
              <RiskProfile clientId={clientId} />
            </>
          ) : (
            <p className="text-sm text-[var(--nc-muted)]">Selecciona un cliente arriba para ver su evaluación.</p>
          )}
          <div>
            <p className="mb-2 text-sm font-semibold text-[var(--nc-text)]">Calendario de pagos</p>
            {!canPreview && <p className="rounded-xl border border-dashed border-[var(--nc-border)] p-4 text-sm text-[var(--nc-muted)]">Completa el capital, la tasa, las cuotas y la fecha del primer pago para ver el calendario.</p>}
            {canPreview && preview.isLoading && <p className="text-sm text-[var(--nc-muted)]">Calculando…</p>}
            {canPreview && preview.error && <p className="text-sm text-red-400">No se pudo calcular el calendario. Revisa los datos.</p>}
            {canPreview && !preview.isLoading && !preview.error && rows.length > 0 && (
              <div className="max-h-72 space-y-1 overflow-auto pr-1">
                {rows.map((row) => (
                  <div key={row.number} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--nc-soft)] px-3 py-2 text-sm">
                    <span className="text-[var(--nc-muted)]">#{row.number} · {shortDate(row.due_date)}</span>
                    <span className="text-[var(--nc-text)]">RD$ {money0(Number(row.principal_due) + Number(row.interest_due))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={card}>
          <h2 className={sectionTitle}>Garantía y condiciones</h2>
          <p className={sectionSub}>Datos opcionales que quedan registrados con el préstamo.</p>
          <label className="flex items-center gap-2 text-sm font-medium text-[var(--nc-text)]">
            <input type="checkbox" checked={hasCollateral} onChange={(e) => setHasCollateral(e.target.checked)} />
            Este préstamo tiene garantía
          </label>
          {hasCollateral && (
            <div className="grid gap-3 sm:grid-cols-2">
              <input className={`${field} sm:col-span-2`} placeholder="Descripción (ej. vehículo, terreno...)" aria-label="Descripción de la garantía" value={collateralDescription} onChange={(e) => setCollateralDescription(e.target.value)} />
              <input type="number" className={field} placeholder="Valor estimado (RD$)" aria-label="Valor estimado de la garantía" value={collateralValue} onChange={(e) => setCollateralValue(e.target.value)} />
              <label className={`${label} sm:col-span-2 mb-0`}>
                Foto de la garantía (opcional)
                <input type="file" accept="image/png,image/jpeg,image/webp" className={`${field} mt-1`}
                  onChange={(e) => setCollateralPhoto(e.target.files?.[0] ?? null)} />
              </label>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="nl-renovacion">Entra al Panel de Renovación al llegar a (% pagado)</label>
              <input id="nl-renovacion" type="number" min="1" max="99" className={field} value={renewalThreshold} onChange={(e) => setRenewalThreshold(e.target.value)} />
            </div>
            <div>
              <label className={label} htmlFor="nl-notas">Notas (opcional)</label>
              <input id="nl-notas" className={field} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </div>
        </>
        )}

        {step === 4 && (
        <>
        <div className={card}>
          <h2 className={sectionTitle}>Resumen</h2>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-[var(--nc-muted)]">Cliente</dt><dd className="font-medium text-[var(--nc-text)]">{clientRow?.full_name ?? '—'}</dd></div>
            <div><dt className="text-xs text-[var(--nc-muted)]">Tipo</dt><dd className="font-medium text-[var(--nc-text)]">{isCapital ? 'Capital + interés' : 'Solo interés'}</dd></div>
            {isCapital && <div><dt className="text-xs text-[var(--nc-muted)]">Método</dt><dd className="font-medium text-[var(--nc-text)]">{METHOD_LABEL[displayMethod]}</dd></div>}
            <div><dt className="text-xs text-[var(--nc-muted)]">Capital</dt><dd className="font-medium text-[var(--nc-text)]">RD$ {money0(Number(principal || 0))}</dd></div>
            <div><dt className="text-xs text-[var(--nc-muted)]">Tasa</dt><dd className="font-medium text-[var(--nc-text)]">{interestRate}% {rateBasis === 'per_term' ? 'por todo el plazo' : 'por período'}</dd></div>
            <div><dt className="text-xs text-[var(--nc-muted)]">Frecuencia</dt><dd className="font-medium text-[var(--nc-text)]">{FREQ_LABEL[frequency] ?? frequency}</dd></div>
            {isCapital && <div><dt className="text-xs text-[var(--nc-muted)]">Cuotas</dt><dd className="font-medium text-[var(--nc-text)]">{termInstallments}</dd></div>}
            <div><dt className="text-xs text-[var(--nc-muted)]">Fecha de inicio</dt><dd className="font-medium text-[var(--nc-text)]">{shortDate(startDate)}</dd></div>
            <div><dt className="text-xs text-[var(--nc-muted)]">Primer pago</dt><dd className="font-medium text-[var(--nc-text)]">{firstPaymentDate ? shortDate(firstPaymentDate) : '—'}</dd></div>
            <div><dt className="text-xs text-[var(--nc-muted)]">Mora</dt><dd className="font-medium text-[var(--nc-text)]">{lateFeeType === 'none' ? 'Sin mora' : `${LATE_LABEL[lateFeeType]} · ${lateFeeValue}`}</dd></div>
            <div><dt className="text-xs text-[var(--nc-muted)]">Días de gracia</dt><dd className="font-medium text-[var(--nc-text)]">{graceDays || '0'}</dd></div>
            <div><dt className="text-xs text-[var(--nc-muted)]">Garantía</dt><dd className="font-medium text-[var(--nc-text)]">{hasCollateral ? `${collateralDescription || 'Sí'}${collateralValue ? ` · RD$ ${money0(Number(collateralValue))}` : ''}` : 'Sin garantía'}</dd></div>
            <div><dt className="text-xs text-[var(--nc-muted)]">Renovación</dt><dd className="font-medium text-[var(--nc-text)]">Al llegar al {renewalThreshold}% pagado</dd></div>
            {notes && <div><dt className="text-xs text-[var(--nc-muted)]">Notas</dt><dd className="font-medium text-[var(--nc-text)]">{notes}</dd></div>}
          </dl>
          {isCapital && rows.length > 0 && (
            <div className="rounded-xl bg-[#2563EB]/10 p-3">
              <p className="text-xs text-[var(--nc-muted)]">Total a pagar</p>
              <p className="font-disp text-xl font-bold text-[var(--nc-text)]">RD$ {money0(totalPrincipal + totalInterest)}</p>
              <p className="text-xs text-[var(--nc-muted)]">{isCapital ? `Cuota estimada RD$ ${money0(firstInstallment ?? 0)} · Intereses totales RD$ ${money0(totalInterest)}` : ''}</p>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={() => goToStep(3)} className="rounded-xl bg-[var(--nc-soft)] px-5 py-3.5 text-base font-bold text-[var(--nc-text)]">Atrás</button>
          <button type="submit" disabled={createLoan.isPending} data-loading={createLoan.isPending} className="flex-1 rounded-xl bg-[#2563EB] py-3.5 text-base font-bold text-white">
            {createLoan.isPending ? 'Creando…' : 'Crear préstamo'}
          </button>
        </div>
        </>
        )}

        {step < 4 && (
        <div className="flex gap-2">
          {step > 1 && (
            <button type="button" onClick={() => goToStep(step - 1)} className="rounded-xl bg-[var(--nc-soft)] px-5 py-3 text-sm font-semibold text-[var(--nc-text)]">Atrás</button>
          )}
          <button type="button" onClick={nextStep} className="flex-1 rounded-xl bg-[#2563EB] py-3 text-sm font-semibold text-white">Continuar</button>
        </div>
        )}
      </form>

      {upgradeReason && <UpgradeToProModal reason={upgradeReason} onClose={() => setUpgradeReason(null)} />}
    </div>
  )
}
