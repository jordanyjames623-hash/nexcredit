import { Portal } from '@/components/ui/Portal'
import { Printer, Share2, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { money, shortDate, dateTime, PAYMENT_METHOD_LABEL } from '@/lib/format'
import { openReceiptPrintTab, shareReceipt, type ReceiptDocInput } from '@/lib/receiptDoc'

const TYPE_LABEL: Record<string, string> = {
  regular: 'Cuota regular', principal: 'Abono a capital', interest: 'Interés', late_fee: 'Mora', custom: 'Personalizado'
}

export type ReceiptData = {
  receipt_number: number; payment_type: string; paid_at: string; status?: string
  principal_amount: number; interest_amount: number; late_fee_amount: number; total_amount: number
  pending_principal_after: number | null; next_due_date: string | null; next_installment_amount: number | null
  payment_method?: string
  installment_number?: number | null; installment_total?: number | null
}

export function Receipt({ payment, clientName, loanNumber, onClose }: {
  payment: ReceiptData; clientName: string; loanNumber: number; onClose: () => void
}) {
  const { business } = useAuth()
  const { date, time } = dateTime(payment.paid_at)
  const voided = payment.status === 'voided'

  function docInput(): ReceiptDocInput {
    return {
      payment,
      businessName: business?.name ?? 'NEXCREDIT',
      ownerName: business?.owner_name,
      phone: business?.phone,
      whatsapp: business?.whatsapp,
      address: business?.address,
      rnc: business?.rnc,
      footer: business?.receipt_footer,
      logoUrl: business?.logo_url,
      clientName,
      loanNumber
    }
  }

  // Compartir como PDF real: WhatsApp lo recibe como documento. Si el navegador no
  // acepta archivos, cae al texto de siempre (ver receiptDoc).
  async function share() {
    await shareReceipt(docInput())
  }

  // Imprimir abre el recibo en una pestaña nueva imprimible: el iframe oculto no
  // abría el diálogo en el celular (mismo arreglo que Contratos).
  function print() {
    if (!openReceiptPrintTab(docInput())) window.print()
  }

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 p-0 backdrop-blur-sm print:static print:bg-transparent print:p-0 print:backdrop-blur-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="glass-card relative max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-b-none border-primary/30 p-0 shadow-2xl print:max-h-none print:w-full print:max-w-none print:rounded-none print:border-0 print:shadow-none sm:rounded-b-xl"
        onClick={(e) => e.stopPropagation()}
        id="receipt-content"
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
          {business?.rnc && <p className="text-xs text-on-navy/60 print:text-content-muted">RNC: {business.rnc}</p>}
        </div>

        <div className="px-6 pt-4">
          <p className="text-center text-xs uppercase tracking-widest text-primary-dark">Comprobante de pago</p>
          {voided && (
            <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-center text-sm font-bold text-danger">ANULADO — Este pago no es válido</p>
          )}
          <div className="ledger-rule flex justify-between py-3 text-xs text-content-muted">
            <span>Recibo #{payment.receipt_number}</span>
            <span>{date}{time ? ` · ${time}` : ''}</span>
          </div>

          <p className="pt-3 text-sm text-content"><span className="text-content-muted">Cliente:</span> {clientName}</p>
          <p className="text-sm text-content"><span className="text-content-muted">Préstamo:</span> PR-{String(loanNumber).padStart(4, '0')}</p>
          <p className="text-sm text-content"><span className="text-content-muted">Tipo:</span> {TYPE_LABEL[payment.payment_type] ?? payment.payment_type}</p>
          {payment.installment_number != null && payment.installment_total != null && (
            <p className="text-sm text-content"><span className="text-content-muted">Cuota:</span> {payment.installment_number} de {payment.installment_total}</p>
          )}
          {payment.payment_method && <p className="mb-3 text-sm text-content"><span className="text-content-muted">Método:</span> {PAYMENT_METHOD_LABEL[payment.payment_method] ?? payment.payment_method}</p>}

          <dl className="ledger-rule space-y-1.5 border-t py-3 text-sm">
            <Row label="Capital" value={payment.principal_amount} />
            <Row label="Interés" value={payment.interest_amount} />
            <Row label="Mora" value={payment.late_fee_amount} />
          </dl>
          <div className="flex items-center justify-between py-3">
            <span className="text-sm font-semibold uppercase tracking-wide text-content-muted">{voided ? 'Total (anulado)' : 'Total'}</span>
            <span className={`money text-2xl font-bold ${voided ? 'text-content-muted line-through' : 'text-success-text'}`}>RD$ {money(payment.total_amount)}</span>
          </div>

          <div className="space-y-0.5 border-t border-line pt-3 text-xs text-content-muted">
            {payment.pending_principal_after !== null && <p>Capital pendiente: RD$ {money(payment.pending_principal_after)}</p>}
            {payment.next_due_date && <p>Próxima cuota: {shortDate(payment.next_due_date)} · RD$ {money(payment.next_installment_amount)}</p>}
          </div>
          {business?.receipt_footer && <p className="mt-3 text-center text-xs text-content-muted">{business.receipt_footer}</p>}

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
