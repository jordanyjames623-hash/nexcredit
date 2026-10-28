import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Calculator } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { money, shortDate } from '@/lib/format'
import { QuoteReceipt, type QuoteReceiptData } from '@/components/QuoteReceipt'

type ScheduleRow = { number: number; due_date: string; principal_due: number; interest_due: number }

export function Quote() {
  const [prospectName, setProspectName] = useState('')
  const [principal, setPrincipal] = useState('10000')
  const [interestRate, setInterestRate] = useState('10')
  const [loanType, setLoanType] = useState<'capital_interest' | 'interest_only'>('capital_interest')
  const [rateBasis, setRateBasis] = useState<'per_term' | 'per_period'>('per_term')
  const [amortizationMethod, setAmortizationMethod] = useState<'fixed_on_principal' | 'declining_balance' | 'french'>('fixed_on_principal')
  const [frequency, setFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>('monthly')
  const [termInstallments, setTermInstallments] = useState('12')
  const [firstPaymentDate, setFirstPaymentDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10)
  })
  const [showReceipt, setShowReceipt] = useState(false)

  const canPreview = principal && interestRate && (loanType === 'interest_only' || termInstallments) && firstPaymentDate

  const preview = useQuery({
    queryKey: ['quote-preview', loanType, amortizationMethod, principal, interestRate, rateBasis, frequency, termInstallments, firstPaymentDate],
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
  const totalPrincipal = rows.reduce((s, r) => s + Number(r.principal_due), 0)
  const totalInterest = rows.reduce((s, r) => s + Number(r.interest_due), 0)
  const totalToPay = totalPrincipal + totalInterest
  const firstInstallment = rows[0] ? Number(rows[0].principal_due) + Number(rows[0].interest_due) : 0

  const receiptData: QuoteReceiptData = {
    prospect_name: prospectName.trim(),
    loan_type: loanType,
    principal: Number(principal),
    interest_rate: Number(interestRate),
    rate_basis: rateBasis,
    frequency,
    term_installments: loanType === 'capital_interest' ? Number(termInstallments) : null,
    first_payment_date: firstPaymentDate,
    first_installment_amount: firstInstallment,
    total_principal: totalPrincipal,
    total_interest: totalInterest,
    total_to_pay: totalToPay,
    quoted_at: new Date().toISOString()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 t-h1 text-content"><Calculator size={20} className="text-primary" /> Calculadora</h1>
        <p className="text-sm text-content-muted">Calcula y comparte una propuesta antes de crear el préstamo real.</p>
      </div>

      <div className="glass-card space-y-4 p-5">
        <div>
          <label className="field-label">Nombre del prospecto (opcional, solo para el mensaje)</label>
          <input aria-label="Nombre del prospecto (opcional, solo para el mensaje)" className="field-input" value={prospectName} onChange={(e) => setProspectName(e.target.value)} placeholder="Ej. Ana García" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="min-w-0">
            <label className="field-label">Tipo</label>
            <select aria-label="Tipo" className="field-input w-full min-w-0" value={loanType} onChange={(e) => setLoanType(e.target.value as any)}>
              <option value="capital_interest">Capital + interés</option>
              <option value="interest_only">Solo intereses</option>
            </select>
          </div>
          <div className="min-w-0">
            <label className="field-label">Monto (RD$)</label>
            <input aria-label="Monto (RD$)" type="number" className="field-input money w-full min-w-0" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
          </div>
          <div className="min-w-0">
            <label className="field-label">Tasa de interés (%)</label>
            <input aria-label="Tasa de interés (%)" type="number" step="0.01" className="field-input w-full min-w-0" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} />
          </div>
          <div className="min-w-0">
            <label className="field-label">Base de la tasa</label>
            <select aria-label="Base de la tasa" className="field-input w-full min-w-0" value={rateBasis} onChange={(e) => setRateBasis(e.target.value as any)}>
              <option value="per_term">Total del préstamo</option>
              <option value="per_period">Por período</option>
            </select>
          </div>
          <div className="min-w-0">
            <label className="field-label">Frecuencia</label>
            <select aria-label="Frecuencia" className="field-input w-full min-w-0" value={frequency} onChange={(e) => setFrequency(e.target.value as any)}>
              <option value="weekly">Semanal</option>
              <option value="biweekly">Quincenal</option>
              <option value="monthly">Mensual</option>
            </select>
          </div>
          {loanType === 'capital_interest' && (
            <div className="min-w-0">
              <label className="field-label">Plazo (cuotas)</label>
              <input aria-label="Plazo (cuotas)" type="number" className="field-input w-full min-w-0" value={termInstallments} onChange={(e) => setTermInstallments(e.target.value)} />
            </div>
          )}
          {loanType === 'capital_interest' && (
            <div className="min-w-0">
              <label className="field-label">Método</label>
              <select aria-label="Método" className="field-input w-full min-w-0" value={amortizationMethod} onChange={(e) => setAmortizationMethod(e.target.value as any)}>
                <option value="fixed_on_principal">Interés fijo sobre capital inicial</option>
                <option value="declining_balance">Saldo decreciente</option>
                <option value="french">Cuota fija (francés)</option>
              </select>
            </div>
          )}
          <div className="min-w-0">
            <label className="field-label">Primer pago</label>
            <input aria-label="Primer pago" type="date" className="field-input w-full min-w-0" value={firstPaymentDate} onChange={(e) => setFirstPaymentDate(e.target.value)} />
          </div>
        </div>
      </div>

      {preview.isLoading && <p className="text-sm text-content-muted">Calculando…</p>}
      {preview.error && <p className="text-sm text-danger">No se pudo calcular. Revisa los datos.</p>}

      {rows.length > 0 && (
        <>
          {/* Resultado (maqueta v86): una sola tarjeta azul con la cuota destacada */}
          <div className="relative overflow-hidden rounded-[20px] bg-gradient-to-b from-[#2C6CEE] to-primary-fill p-5 text-white shadow-[0_12px_24px_-14px_rgba(37,99,235,0.9)]">
            <div aria-hidden="true" className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10" />
            <p className="relative text-sm text-white/80">{loanType === 'capital_interest' ? 'Cuota aprox.' : 'Pago mensual'}</p>
            <p className="money relative mt-1 text-3xl font-extrabold">RD$ {money(firstInstallment)}</p>
            <p className="relative mt-4 text-sm text-white/85">Interés total · RD$ {money(totalInterest)}</p>
            <p className="relative mt-1 text-sm text-white/85">Total a pagar · RD$ {money(totalToPay)}</p>
          </div>

          <button onClick={() => setShowReceipt(true)} className="btn-solid">
            <FileText size={16} className="mr-1.5" /> Ver cotización para compartir
          </button>

          <div className="glass-card">
            <h2 className="ledger-rule px-5 py-3 text-sm font-semibold text-content">Calendario de pagos</h2>
            <div className="max-h-80 overflow-y-auto">
              <table className="table-modern">
                <thead>
                  <tr className="ledger-rule text-left text-xs text-content-muted">
                    <th className="px-5 py-2 font-medium">#</th>
                    <th className="px-2 py-2 font-medium">Fecha</th>
                    <th className="px-2 py-2 text-right font-medium">Capital</th>
                    <th className="px-2 py-2 text-right font-medium">Interés</th>
                    <th className="px-5 py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.number} className="border-t border-line">
                      <td className="px-5 py-2 text-content-muted">{row.number}</td>
                      <td className="px-2 py-2 text-content-muted">{shortDate(row.due_date)}</td>
                      <td className="money px-2 py-2 text-right text-content">{money(row.principal_due)}</td>
                      <td className="money px-2 py-2 text-right text-content">{money(row.interest_due)}</td>
                      <td className="money px-5 py-2 text-right font-semibold text-content">{money(Number(row.principal_due) + Number(row.interest_due))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showReceipt && <QuoteReceipt quote={receiptData} onClose={() => setShowReceipt(false)} />}
    </div>
  )
}
