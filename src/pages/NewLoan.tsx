import { useState, useEffect, type FormEvent } from 'react'
import { Calculator, X as XIcon } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import { money, shortDate } from '@/lib/format'
import { useAuth } from '@/contexts/AuthContext'
import { AssigneePicker } from '@/components/AssigneePicker'
import { UpgradeToProModal, parsePlanLimitError } from '@/components/UpgradeToProModal'
import { PageHeader } from '@/components/ui/PageHeader'
import { Stepper, type Step } from '@/components/ui/Stepper'
import { FormSection } from '@/components/ui/FormSection'
import { RiskProfile } from '@/pages/ClientDetail'

type ScheduleRow = { number: number; due_date: string; principal_due: number; interest_due: number }

const STEPS: Step[] = [
  { id: 'cliente', label: 'Cliente', description: 'Quién recibe el préstamo' },
  { id: 'prestamo', label: 'Préstamo', description: 'Monto, tasa y plazo' },
  { id: 'evaluacion', label: 'Evaluación', description: 'Riesgo, garantía y calendario' },
  { id: 'confirmacion', label: 'Confirmación', description: 'Revisa y crea' }
]
const FREQ_LABEL: Record<string, string> = { weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual' }
const METHOD_LABEL: Record<string, string> = {
  flat_total: 'Capital + interés (total, sin importar el tiempo)', flat_per_installment: 'Interés por cuota',
  declining_balance: 'Saldo decreciente', french: 'Cuota fija (francés)'
}
const LATE_LABEL: Record<string, string> = { none: 'Sin mora', fixed: 'Monto fijo', percent: 'Porcentaje', per_day: 'Por día', per_period: 'Por período' }

export function NewLoan() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [clientId, setClientId] = useState(params.get('cliente') ?? '')
  const renewedFromLoanId = params.get('renueva') || null
  const [renewalThreshold, setRenewalThreshold] = useState('50')
  const [loanType, setLoanType] = useState<'capital_interest' | 'interest_only'>('capital_interest')
  // El método elegido decide solo, internamente, cómo se aplica la tasa — ya no es una pregunta aparte.
  // Saldo decreciente y francés siempre calculan con tasa por período (el motor los rechaza con "por todo
  // el plazo"); "Interés fijo" se separó en dos para no tener que preguntarlo: sin importar el tiempo
  // (el total de interés es el mismo, dé 6 u 12 cuotas) o por cuota (el interés se multiplica por el
  // número de cuotas).
  const [displayMethod, setDisplayMethod] = useState<'flat_total' | 'flat_per_installment' | 'declining_balance' | 'french'>('flat_total')
  const amortizationMethod = displayMethod === 'french' ? 'french' : displayMethod === 'declining_balance' ? 'declining_balance' : 'fixed_on_principal'
  const rateBasis = displayMethod === 'flat_total' ? 'per_term' : 'per_period'
  const [principal, setPrincipal] = useState('')
  const [interestRate, setInterestRate] = useState('')
  const [frequency, setFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>('monthly')
  const [termInstallments, setTermInstallments] = useState('12')
  const [firstPaymentDate, setFirstPaymentDate] = useState('')
  // Por defecto, hoy — igual que siempre. Para un préstamo que ya traías de antes (ver "Marcar cuotas
  // ya pagadas" en la ficha del préstamo), cámbiala a la fecha real en que lo diste.
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [showInstallmentPanel, setShowInstallmentPanel] = useState(false)
  const [desiredInstallment, setDesiredInstallment] = useState('')
  const [solvingRate, setSolvingRate] = useState(false)
  const [solveError, setSolveError] = useState<string | null>(null)
  const [solvedNote, setSolvedNote] = useState<string | null>(null)
  const [lateFeeType, setLateFeeType] = useState<'none' | 'fixed' | 'percent' | 'per_day' | 'per_period'>('none')
  const [lateFeeValue, setLateFeeValue] = useState('0')
  const [graceDays, setGraceDays] = useState('0')
  const [notes, setNotes] = useState('')
  const [hasCollateral, setHasCollateral] = useState(false)
  const [collateralDescription, setCollateralDescription] = useState('')
  const [collateralValue, setCollateralValue] = useState('')
  const [collateralPhoto, setCollateralPhoto] = useState<File | null>(null)
  const { session } = useAuth()
  const toast = useToast()
  const [assignedTo, setAssignedTo] = useState(session?.user.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [upgradeReason, setUpgradeReason] = useState<ReturnType<typeof parsePlanLimitError>>(null)

  const [step, setStep] = useState(0)

  // Si viene de una solicitud aprobada, se prellenan los datos y al crear el préstamo se enlaza.
  const applicationId = params.get('solicitud') || null
  const [prefilled, setPrefilled] = useState(false)
  const applicationQuery = useQuery({
    queryKey: ['application-prefill', applicationId],
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

  const { data: clients } = useQuery({
    queryKey: ['clients-select'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, full_name').eq('status', 'active').is('deleted_at', null).order('full_name')
      if (error) throw error
      return data as { id: string; full_name: string }[]
    }
  })

  const { data: products } = useQuery({
    queryKey: ['loan-products-select'],
    queryFn: async () => {
      const { data, error } = await supabase.from('loan_products').select('*').eq('is_active', true).order('name')
      if (error) throw error
      return data as any[]
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

  const canPreview = principal && interestRate && (loanType === 'interest_only' || termInstallments) && firstPaymentDate

  const preview = useQuery({
    queryKey: ['preview-schedule', loanType, amortizationMethod, principal, interestRate, rateBasis, frequency, termInstallments, firstPaymentDate],
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
      if (hasCollateral) {
        let imagePath: string | null = null
        if (collateralPhoto) {
          const ext = collateralPhoto.name.split('.').pop()?.toLowerCase() || 'jpg'
          const path = `${data}/${Date.now()}.${ext}`
          const { error: uploadError } = await supabase.storage.from('collateral').upload(path, collateralPhoto)
          if (!uploadError) imagePath = path
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
      toast.success('Préstamo creado')
      navigate(`/prestamos/${data}`, { replace: true })
    },
    onError: (e: any) => {
      const reason = parsePlanLimitError(e.message)
      if (reason) setUpgradeReason(reason)
      else setError(e.message ?? 'No se pudo crear el préstamo.')
    }
  })

  const clientRow = clients?.find((c) => c.id === clientId)
  const rows = preview.data ?? []
  const isCapital = loanType === 'capital_interest'
  const totalPrincipal = rows.reduce((sum, r) => sum + Number(r.principal_due), 0)
  const totalInterest = rows.reduce((sum, r) => sum + Number(r.interest_due), 0)
  const firstInstallment = rows.length > 0 ? Number(rows[0].principal_due) + Number(rows[0].interest_due) : null
  const isLast = step === STEPS.length - 1
  // Saldo decreciente no tiene una sola cuota fija (cada una es distinta por diseño) — ahí no aplica.
  const canFixInstallment = !isCapital || amortizationMethod !== 'declining_balance'

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
      setSolvedNote(`Tasa calculada: ${Number(data).toFixed(2)}% para que la cuota salga en ${money(desired)}.`)
    } catch (err: any) {
      setSolveError(err.message ?? 'No se pudo calcular la tasa con esos datos.')
    } finally {
      setSolvingRate(false)
    }
  }

  function goTo(next: number) {
    setStep(next)
    setError(null)
  }

  useEffect(() => { document.getElementById('loan-step-heading')?.focus() }, [step])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!isLast) {
      if (step === 0 && !clientId) { setError('Selecciona un cliente.'); return }
      setStep(step + 1)
      return
    }
    if (!clientId) { setError('Selecciona un cliente.'); setStep(0); return }
    createLoan.mutate()
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Nuevo préstamo" description="Completa los datos del cliente y del préstamo para registrar un nuevo crédito." />

      {renewedFromLoanId && <p className="rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary-dark">Esto crea una renovación — quedará vinculada al préstamo original.</p>}
      {applicationId && applicationQuery.data && (
        <p className="rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Desembolsando la solicitud de {applicationQuery.data.applicant_name}.
          {applicationQuery.data.client_id ? '' : ' Todavía no es cliente: selecciónalo en el paso 1 (o créalo primero en Clientes).'}
        </p>
      )}

      <div className="glass-card p-5">
        <Stepper steps={STEPS} current={step} onSelect={goTo} />
        <p className="mt-3 text-sm font-semibold text-content sm:hidden">Paso {step + 1} de {STEPS.length}: {STEPS[step].label}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form onSubmit={handleSubmit} className="glass-card space-y-6 p-5 sm:p-6">
          {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

          <div key={step} className="page-enter space-y-6">
            {step === 0 && (
              <FormSection headingId="loan-step-heading" title="Datos del cliente" description="Elige a quién se le presta y quién dará seguimiento al préstamo.">
                {(products?.length ?? 0) > 0 && (
                  <div>
                    <label className="field-label" htmlFor="product">Producto (opcional, prellena los campos)</label>
                    <select id="product" className="field-input" defaultValue="" onChange={(e) => e.target.value && applyProduct(e.target.value)}>
                      <option value="">Sin producto — llenar manualmente</option>
                      {products!.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="field-label" htmlFor="client">Cliente</label>
                  <select id="client" required className="field-input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                    <option value="">Selecciona…</option>
                    {clients?.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                  </select>
                </div>
                <AssigneePicker value={assignedTo} onChange={setAssignedTo} label="Asignar préstamo a" />
              </FormSection>
            )}

            {step === 1 && (
              <FormSection
                headingId="loan-step-heading" title="Información del préstamo"
                description="Define el monto, la tasa, el plazo y las condiciones de mora."
                action={
                  canFixInstallment ? (
                    <button type="button" onClick={() => setShowInstallmentPanel((v) => !v)}
                      className="btn-secondary !px-3 !py-2 text-xs" aria-expanded={showInstallmentPanel}>
                      <Calculator size={14} aria-hidden="true" /> Fijar cuota deseada
                    </button>
                  ) : (
                    <p className="max-w-[12rem] text-right text-xs text-content-muted">
                      Saldo decreciente no tiene una sola cuota fija.
                    </p>
                  )
                }
              >
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="min-w-0">
                    <label className="field-label" htmlFor="loanType">Tipo</label>
                    <select id="loanType" className="field-input w-full min-w-0" value={loanType} onChange={(e) => setLoanType(e.target.value as any)}>
                      <option value="capital_interest">Capital + interés</option>
                      <option value="interest_only">Solo interés</option>
                    </select>
                  </div>
                  {isCapital && (
                    <div className="min-w-0">
                      <label className="field-label" htmlFor="method">Método</label>
                      <select id="method" className="field-input w-full min-w-0" value={displayMethod} onChange={(e) => setDisplayMethod(e.target.value as any)}>
                        <option value="flat_total">Capital + interés (total, sin importar el tiempo)</option>
                        <option value="flat_per_installment">Interés por cuota</option>
                        <option value="declining_balance">Saldo decreciente</option>
                        <option value="french">Cuota fija (francés)</option>
                      </select>
                    </div>
                  )}
                  <div className="min-w-0">
                    <label className="field-label" htmlFor="principal">Capital (RD$)</label>
                    <input id="principal" required type="number" min="0.01" step="0.01" className="field-input money w-full min-w-0"
                      value={principal} onChange={(e) => setPrincipal(e.target.value)} />
                  </div>
                  <div className="min-w-0">
                    <label className="field-label" htmlFor="rate">Tasa de interés (%)</label>
                    <input id="rate" required type="number" min="0" step="0.01" className="field-input money w-full min-w-0"
                      value={interestRate} onChange={(e) => setInterestRate(e.target.value)} />
                  </div>
                  <div className="min-w-0">
                    <label className="field-label" htmlFor="frequency">Frecuencia de pago</label>
                    <select id="frequency" className="field-input w-full min-w-0" value={frequency} onChange={(e) => setFrequency(e.target.value as any)}>
                      <option value="weekly">Semanal</option>
                      <option value="biweekly">Quincenal</option>
                      <option value="monthly">Mensual</option>
                    </select>
                  </div>
                  {isCapital && (
                    <div className="min-w-0">
                      <label className="field-label" htmlFor="term">Número de cuotas</label>
                      <input id="term" required type="number" min="1" className="field-input w-full min-w-0"
                        value={termInstallments} onChange={(e) => setTermInstallments(e.target.value)} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <label className="field-label" htmlFor="startDate">Fecha de inicio</label>
                    <input id="startDate" required type="date" className="field-input w-full min-w-0"
                      value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div className="min-w-0">
                    <label className="field-label" htmlFor="firstPayment">Fecha del primer pago</label>
                    <input id="firstPayment" required type="date" className="field-input w-full min-w-0"
                      value={firstPaymentDate} onChange={(e) => setFirstPaymentDate(e.target.value)} />
                  </div>
                  <p className="col-span-2 -mt-1 text-xs text-content-muted">Fecha de inicio: hoy, salvo que sea un préstamo que ya traías de antes.</p>
                </div>

                {showInstallmentPanel && canFixInstallment && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold text-content">Fijar cuota deseada</p>
                      <button type="button" onClick={() => setShowInstallmentPanel(false)} aria-label="Cerrar" className="rounded-lg p-1 text-content-muted hover:text-content">
                        <XIcon size={16} />
                      </button>
                    </div>
                    <p className="mb-3 text-xs text-content-muted">
                      En vez de escribir la tasa, di cuánto quieres que pague el cliente por cuota — calculamos la tasa que hace que cuadre exacto, con el capital y el plazo que ya pusiste.
                    </p>
                    {solveError && <p className="mb-3 rounded bg-danger/10 px-3 py-2 text-xs text-danger">{solveError}</p>}
                    {solvedNote && <p className="mb-3 rounded bg-success/10 px-3 py-2 text-xs text-success-text">{solvedNote}</p>}
                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <label className="field-label" htmlFor="desiredInstallment">Cuota deseada (RD$)</label>
                        <input id="desiredInstallment" type="number" min="0.01" step="0.01" className="field-input money !w-40"
                          value={desiredInstallment} onChange={(e) => setDesiredInstallment(e.target.value)} />
                      </div>
                      <button type="button" onClick={handleSolveRate} disabled={solvingRate} className="btn-solid !px-4 !py-2 text-sm">
                        {solvingRate ? 'Calculando…' : 'Calcular tasa'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-line p-4">
                  <p className="mb-3 text-sm font-semibold text-content">Mora por atraso</p>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="field-label" htmlFor="lateFeeType">Tipo</label>
                      <select id="lateFeeType" className="field-input" value={lateFeeType} onChange={(e) => setLateFeeType(e.target.value as any)}>
                        <option value="none">Ninguna</option>
                        <option value="fixed">Monto fijo</option>
                        <option value="percent">Porcentaje</option>
                        <option value="per_day">Por día</option>
                        <option value="per_period">Por período</option>
                      </select>
                    </div>
                    <div>
                      <label className="field-label" htmlFor="lateFeeValue">Valor</label>
                      <input id="lateFeeValue" type="number" min="0" step="0.01" disabled={lateFeeType === 'none'}
                        className="field-input money" value={lateFeeValue} onChange={(e) => setLateFeeValue(e.target.value)} />
                    </div>
                    <div>
                      <label className="field-label" htmlFor="graceDays">Días de gracia</label>
                      <input id="graceDays" type="number" min="0" className="field-input" value={graceDays} onChange={(e) => setGraceDays(e.target.value)} />
                    </div>
                  </div>
                </div>
              </FormSection>
            )}

            {step === 2 && (
              <>
                <FormSection headingId="loan-step-heading" title="Evaluación y análisis" description="Revisa el riesgo del cliente y el calendario de pagos antes de continuar.">
                  {clientId ? <ClientExposure clientId={clientId} /> : <p className="text-sm text-content-muted">Selecciona un cliente en el paso 1 para ver su evaluación.</p>}
                  {clientId && <RiskProfile clientId={clientId} />}
                </FormSection>

                <FormSection title="Garantía y condiciones" description="Datos opcionales que quedan registrados con el préstamo.">
                  <div className="rounded-xl border border-line p-4">
                    <label className="flex items-center gap-2 text-sm font-medium text-content">
                      <input type="checkbox" checked={hasCollateral} onChange={(e) => setHasCollateral(e.target.checked)} />
                      Este préstamo tiene garantía
                    </label>
                    {hasCollateral && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <input className="field-input sm:col-span-2" placeholder="Descripción (ej. vehículo, terreno...)" aria-label="Descripción de la garantía" value={collateralDescription} onChange={(e) => setCollateralDescription(e.target.value)} />
                        <input type="number" className="field-input money" placeholder="Valor estimado (RD$)" aria-label="Valor estimado de la garantía" value={collateralValue} onChange={(e) => setCollateralValue(e.target.value)} />
                        <label className="field-label mb-0 sm:col-span-2">
                          Foto de la garantía (opcional)
                          <input type="file" accept="image/png,image/jpeg,image/webp,image/heic" className="field-input mt-1"
                            onChange={(e) => setCollateralPhoto(e.target.files?.[0] ?? null)} />
                        </label>
                      </div>
                    )}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="field-label" htmlFor="renewalThreshold">Entra al Panel de Renovación al llegar a (% pagado)</label>
                      <input id="renewalThreshold" type="number" min="1" max="99" className="field-input" value={renewalThreshold} onChange={(e) => setRenewalThreshold(e.target.value)} />
                    </div>
                    <div>
                      <label className="field-label" htmlFor="notes">Notas (opcional)</label>
                      <input id="notes" className="field-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </div>
                  </div>
                </FormSection>

                <FormSection title="Calendario de pagos" description="Vista previa calculada con los datos del paso 2.">
                  <SchedulePreview rows={rows} loading={preview.isLoading} failed={Boolean(preview.error)} ready={Boolean(canPreview)} />
                </FormSection>
              </>
            )}

            {step === 3 && (
              <>
                <FormSection headingId="loan-step-heading" title="Confirma el préstamo" description="Revisa que todo esté correcto. Al crearlo se genera el calendario de pagos.">
                  <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                    <ReviewItem label="Cliente" value={clientRow?.full_name ?? '—'} />
                    <ReviewItem label="Tipo" value={isCapital ? 'Capital + interés' : 'Solo interés'} />
                    {isCapital && <ReviewItem label="Método" value={METHOD_LABEL[displayMethod] ?? displayMethod} />}
                    <ReviewItem label="Capital" value={`RD$ ${money(Number(principal || 0))}`} />
                    <ReviewItem label="Tasa" value={`${interestRate}% ${rateBasis === 'per_term' ? 'por todo el plazo' : 'por período'}`} />
                    <ReviewItem label="Frecuencia" value={FREQ_LABEL[frequency] ?? frequency} />
                    {isCapital && <ReviewItem label="Cuotas" value={termInstallments} />}
                    <ReviewItem label="Fecha de inicio" value={shortDate(startDate)} />
                    <ReviewItem label="Primer pago" value={shortDate(firstPaymentDate)} />
                    <ReviewItem label="Mora" value={lateFeeType === 'none' ? 'Sin mora' : `${LATE_LABEL[lateFeeType]} · ${lateFeeValue}`} />
                    <ReviewItem label="Días de gracia" value={graceDays || '0'} />
                    <ReviewItem label="Garantía" value={hasCollateral ? `${collateralDescription || 'Sí'}${collateralValue ? ` · RD$ ${money(Number(collateralValue))}` : ''}` : 'Sin garantía'} />
                    <ReviewItem label="Renovación" value={`Al llegar al ${renewalThreshold}% pagado`} />
                    {notes && <ReviewItem label="Notas" value={notes} />}
                  </dl>
                </FormSection>
                <SchedulePreview rows={rows} loading={preview.isLoading} failed={Boolean(preview.error)} ready={Boolean(canPreview)} />
              </>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-line pt-4">
            {step > 0 ? (
              <button type="button" onClick={() => goTo(step - 1)} className="btn-ghost">← Atrás</button>
            ) : (
              <Link to="/prestamos" className="btn-ghost">Cancelar</Link>
            )}
            <button type="submit" disabled={createLoan.isPending} data-loading={createLoan.isPending} className="btn-solid">
              {isLast ? 'Crear préstamo' : 'Continuar →'}
            </button>
          </div>
        </form>

        <aside aria-label="Resumen del crédito" className="glass-card h-fit p-5 lg:sticky lg:top-24">
          <h2 className="t-h3 mb-4 text-content">Resumen del crédito</h2>
          <dl className="space-y-3 text-sm">
            <SummaryRow label="Cliente" value={clientRow?.full_name ?? '—'} />
            <SummaryRow label="Monto solicitado" value={principal ? `RD$ ${money(Number(principal))}` : '—'} strong />
            <SummaryRow label="Plazo" value={isCapital ? (termInstallments ? `${termInstallments} cuotas · ${FREQ_LABEL[frequency]}` : '—') : `Solo interés · ${FREQ_LABEL[frequency]}`} />
            <SummaryRow label="Tasa" value={interestRate ? `${interestRate}% ${rateBasis === 'per_term' ? 'total' : 'por período'}` : '—'} />
            <SummaryRow label={isCapital ? 'Cuota estimada' : 'Interés por período'} value={firstInstallment !== null ? `RD$ ${money(firstInstallment)}` : '—'} />
            {isCapital && <SummaryRow label="Intereses totales" value={rows.length > 0 ? `RD$ ${money(totalInterest)}` : '—'} />}
          </dl>
          {isCapital && (
            <div className="mt-4 rounded-xl bg-primary/10 p-3">
              <p className="t-label">Total a pagar</p>
              <p className="t-kpi money text-primary-dark">{rows.length > 0 ? `RD$ ${money(totalPrincipal + totalInterest)}` : '—'}</p>
            </div>
          )}
          {preview.isLoading && <p className="mt-3 text-xs text-content-muted">Calculando…</p>}
          {hasCollateral && <p className="mt-3 text-xs text-content-muted">Con garantía{collateralValue ? ` · RD$ ${money(Number(collateralValue))}` : ''}</p>}
        </aside>
      </div>

      {upgradeReason && <UpgradeToProModal reason={upgradeReason} onClose={() => setUpgradeReason(null)} />}
    </div>
  )
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-content-muted">{label}</dt>
      <dd className={`text-right ${strong ? 'money text-base font-semibold text-content' : 'font-medium text-content'}`}>{value}</dd>
    </div>
  )
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-content-muted">{label}</dt>
      <dd className="font-medium text-content">{value}</dd>
    </div>
  )
}

// Exposición actual del cliente: cuánto debe hoy y cuántos préstamos activos tiene.
function ClientExposure({ clientId }: { clientId: string }) {
  const { data } = useQuery({
    queryKey: ['client-exposure', clientId],
    queryFn: async () => {
      const { data: row, error } = await supabase.from('client_balances').select('active_loans, total_pending').eq('client_id', clientId).maybeSingle()
      if (error) throw error
      return row as { active_loans: number; total_pending: number } | null
    }
  })
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-xl border border-line p-3">
        <p className="t-label">Préstamos activos</p>
        <p className="t-kpi money text-content">{data ? data.active_loans : 0}</p>
      </div>
      <div className="rounded-xl border border-line p-3">
        <p className="t-label">Saldo pendiente actual</p>
        <p className="t-kpi money text-content">RD$ {money(data ? Number(data.total_pending) : 0)}</p>
      </div>
    </div>
  )
}

function SchedulePreview({ rows, loading, failed, ready }: { rows: ScheduleRow[]; loading: boolean; failed: boolean; ready: boolean }) {
  if (!ready) return <p className="rounded-xl border border-dashed border-line p-4 text-sm text-content-muted">Completa el capital, la tasa, las cuotas y la fecha del primer pago (paso 2) para ver el calendario.</p>
  if (loading) return <p className="text-sm text-content-muted">Calculando…</p>
  if (failed) return <p className="text-sm text-danger" role="alert">No se pudo calcular el calendario. Revisa los datos.</p>
  return (
    <div className="max-h-72 overflow-auto rounded-xl border border-line">
      <table className="table-modern">
        <thead>
          <tr>
            <th>#</th>
            <th>Fecha</th>
            <th className="text-right">Capital</th>
            <th className="text-right">Interés</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.number}>
              <td className="text-content-muted">{row.number}</td>
              <td className="text-content-muted">{shortDate(row.due_date)}</td>
              <td className="money text-right text-content">{money(row.principal_due)}</td>
              <td className="money text-right text-content">{money(row.interest_due)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
