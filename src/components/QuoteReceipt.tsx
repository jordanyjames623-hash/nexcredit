import { Portal } from '@/components/ui/Portal'
import { useEffect } from 'react'
import { printElement, removePrintFrames } from '@/lib/printElement'
import { Printer, Share2, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { money, shortDate, dateTime } from '@/lib/format'

const TYPE_LABEL: Record<string, string> = { capital_interest: 'Capital + interés', interest_only: 'Solo intereses' }
const FREQ_LABEL: Record<string, string> = { weekly: 'semanal', biweekly: 'quincenal', monthly: 'mensual' }

export type QuoteReceiptData = {
  prospect_name: string
  loan_type: 'capital_interest' | 'interest_only'
  principal: number
  interest_rate: number
  rate_basis: 'per_term' | 'per_period'
  frequency: 'weekly' | 'biweekly' | 'monthly'
  term_installments: number | null
  first_payment_date: string
  first_installment_amount: number
  total_principal: number
  total_interest: number
  total_to_pay: number
  quoted_at: string
}

export function QuoteReceipt({ quote, onClose }: { quote: QuoteReceiptData; onClose: () => void }) {
  const { business } = useAuth()
  const { date, time } = dateTime(quote.quoted_at)

  async function share() {
    const text = `Cotización — ${business?.name ?? 'NEXCREDIT'}\n` +
      (quote.prospect_name ? `Para: ${quote.prospect_name}\n` : '') +
      `Monto: RD$ ${money(quote.principal)}\nTotal a pagar: RD$ ${money(quote.total_to_pay)}\nFecha: ${date}${time ? ` ${time}` : ''}`
    if (navigator.share) {
      try { await navigator.share({ title: 'Cotización', text }) } catch { /* el usuario canceló */ }
    } else {
      await navigator.clipboard.writeText(text)
      window.alert('Cotización copiada al portapapeles.')
    }
  }

  // Al cerrar el comprobante se descarta el documento oculto de impresión.
  useEffect(() => removePrintFrames, [])

  async function print() {
    // Se imprime en un documento aislado; si el navegador no lo permite, se imprime la página como respaldo.
    try {
      const el = document.getElementById('quote-receipt-content')
      if (!el) throw new Error('sin comprobante')
      await printElement(el)
    } catch {
      window.print()
    }
  }

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 p-0 backdrop-blur-sm print:static print:bg-transparent print:p-0 print:backdrop-blur-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="glass-card relative max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-b-none border-primary/30 p-0 shadow-2xl print:max-h-none print:w-full print:max-w-none print:rounded-none print:border-0 print:shadow-none sm:rounded-b-xl"
        onClick={(e) => e.stopPropagation()}
        id="quote-receipt-content"
      >
        <button onClick={onClose} className="absolute right-3 top-3 rounded-full p-1.5 text-content-muted hover:bg-background hover:text-content print:hidden" aria-label="Cerrar">
          <X size={18} />
        </button>

        <div className="bg-navy px-6 pb-5 pt-7 text-center print:bg-transparent">
          {business?.logo_url ? (
            <img src={business.logo_url} alt="" className="mx-auto mb-2 h-12 w-12 rounded-full object-cover ring-2 ring-primary/40" />
          ) : (
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark text-lg font-bold text-white">
              {(business?.name ?? 'C').charAt(0).toUpperCase()}
            </div>
          )}
          <p className="text-lg font-semibold text-on-navy print:text-content">{business?.name ?? 'NEXCREDIT'}</p>
          {business?.owner_name && <p className="text-xs text-on-navy/60 print:text-content-muted">{business.owner_name}</p>}
          {(business?.phone || business?.whatsapp) && (
            <p className="text-xs text-on-navy/60 print:text-content-muted">
              {business?.phone ? `Tel: ${business.phone}` : ''}{business?.whatsapp ? ` · WhatsApp: ${business.whatsapp}` : ''}
            </p>
          )}
          {business?.address && <p className="text-xs text-on-navy/60 print:text-content-muted">{business.address}</p>}
        </div>

        <div className="px-6 pt-4">
          <p className="text-center text-xs uppercase tracking-widest text-primary-dark">Cotización</p>
          <div className="ledger-rule flex justify-between py-3 text-xs text-content-muted">
            <span>{quote.prospect_name ? `Para: ${quote.prospect_name}` : 'Propuesta de préstamo'}</span>
            <span>{date}{time ? ` · ${time}` : ''}</span>
          </div>

          <p className="pt-3 text-sm text-content"><span className="text-content-muted">Tipo:</span> {TYPE_LABEL[quote.loan_type]}</p>
          <p className="text-sm text-content"><span className="text-content-muted">Tasa:</span> {quote.interest_rate}% {quote.rate_basis === 'per_term' ? 'total' : `por período ${FREQ_LABEL[quote.frequency]}`}</p>
          <p className="mb-3 text-sm text-content">
            <span className="text-content-muted">{quote.loan_type === 'capital_interest' ? 'Plazo:' : 'Frecuencia:'}</span>{' '}
            {quote.loan_type === 'capital_interest' ? `${quote.term_installments} cuotas (${FREQ_LABEL[quote.frequency]}es)` : FREQ_LABEL[quote.frequency]}
          </p>

          <dl className="ledger-rule space-y-1.5 border-t py-3 text-sm">
            <Row label="Capital" value={quote.total_principal} />
            <Row label="Interés" value={quote.total_interest} />
          </dl>
          <div className="flex items-center justify-between py-3">
            <span className="text-sm font-semibold uppercase tracking-wide text-content-muted">Total a pagar</span>
            <span className="money text-2xl font-bold text-success-text">RD$ {money(quote.total_to_pay)}</span>
          </div>

          <div className="space-y-0.5 border-t border-line pt-3 text-xs text-content-muted">
            <p>{quote.loan_type === 'capital_interest' ? 'Cuota aproximada' : 'Pago mensual'}: RD$ {money(quote.first_installment_amount)}</p>
            <p>Primer pago: {shortDate(quote.first_payment_date)}</p>
          </div>
          <p className="mt-3 text-center text-xs text-content-muted">Cotización estimada, sujeta a aprobación final.</p>

          <div className="mt-5 flex gap-2 pb-6 print:hidden">
            <button onClick={print} className="btn-secondary flex-1"><Printer size={16} className="mr-1.5" /> Imprimir / PDF</button>
            <button onClick={share} className="btn-solid flex-1"><Share2 size={16} className="mr-1.5" /> Compartir</button>
          </div>
        </div>
      </div>
    </div>
    </Portal>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-content/80">
      <dt>{label}</dt><dd className="money">RD$ {money(value)}</dd>
    </div>
  )
}
