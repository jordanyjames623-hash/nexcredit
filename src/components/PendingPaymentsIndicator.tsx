import { useState } from 'react'
import { CloudOff, RefreshCw, AlertTriangle, X } from 'lucide-react'
import { usePaymentQueue } from '@/hooks/usePaymentQueue'
import { removeFromQueue, retryQueueItem, syncPaymentQueue } from '@/lib/paymentQueue'
import { money, dateTime } from '@/lib/format'
import { Portal } from '@/components/ui/Portal'

// Siempre visible mientras haya pagos sin sincronizar o con un conflicto por revisar — no se puede perder
// de vista que algo quedó pendiente, ni siquiera cambiando de pantalla.
export function PendingPaymentsIndicator() {
  const { items, pendingCount, failedCount } = usePaymentQueue()
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null

  return (
    <Portal>
      <div className="print-hide fixed bottom-24 left-1/2 z-40 -translate-x-1/2 sm:bottom-6 sm:left-auto sm:right-6 sm:translate-x-0">
        {open && (
          <div className="glass-panel glass-strong popover-enter mb-2 max-h-[60vh] w-[22rem] max-w-[calc(100vw-2rem)] overflow-y-auto !rounded-2xl p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-content">Pagos sin conexión</p>
              <button onClick={() => setOpen(false)} aria-label="Cerrar" className="text-content-muted hover:text-content"><X size={16} /></button>
            </div>
            <div className="space-y-2">
              {items.map((i) => {
                const { date, time } = dateTime(i.queued_at)
                return (
                  <div key={i.id} className={`rounded-xl border p-2.5 text-sm ${i.status === 'failed' ? 'border-danger/30 bg-danger/5' : 'border-line'}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-content">{i.client_name} · PR-{String(i.loan_number).padStart(4, '0')}</span>
                      <span className="money font-semibold text-content">RD$ {money(i.amount ?? i.principal + i.interest + i.late_fee)}</span>
                    </div>
                    <p className="text-xs text-content-muted">Guardado {date} · {time}</p>
                    {i.status === 'failed' ? (
                      <div className="mt-1.5 space-y-1.5">
                        <p className="flex items-center gap-1 text-xs text-danger"><AlertTriangle size={12} aria-hidden="true" /> {i.error_message}</p>
                        <div className="flex gap-2">
                          <button onClick={() => retryQueueItem(i.id)} className="text-xs font-medium text-primary hover:underline">Reintentar</button>
                          <button onClick={() => removeFromQueue(i.id)} className="text-xs text-content-muted hover:text-danger">Descartar</button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-content-muted">{i.status === 'syncing' ? 'Enviando…' : 'Esperando señal…'}</p>
                    )}
                  </div>
                )
              })}
            </div>
            <button onClick={() => syncPaymentQueue()} className="btn-secondary mt-3 w-full !py-1.5 text-xs">
              <RefreshCw size={13} aria-hidden="true" /> Sincronizar ahora
            </button>
          </div>
        )}

        <button
          onClick={() => setOpen((v) => !v)}
          className={`glass-panel glass-strong flex items-center gap-2 !rounded-full px-4 py-2.5 text-sm font-medium shadow-lg ${failedCount > 0 ? 'text-danger' : 'text-content'}`}
        >
          {failedCount > 0 ? <AlertTriangle size={16} aria-hidden="true" /> : <CloudOff size={16} aria-hidden="true" />}
          {pendingCount > 0 ? `${pendingCount} pago(s) por sincronizar` : `${failedCount} pago(s) con problema`}
        </button>
      </div>
    </Portal>
  )
}
