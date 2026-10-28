import { useEffect, useState } from 'react'
import { listQueue, subscribeQueue, syncPaymentQueue, type QueuedPayment } from '@/lib/paymentQueue'

// Expone la cola de pagos sin conexión y mantiene la sincronización automática activa mientras la app
// esté abierta: al recuperar señal, y cada 20s de respaldo por si el navegador no avisa el evento "online".
export function usePaymentQueue() {
  const [items, setItems] = useState<QueuedPayment[]>(() => listQueue())

  useEffect(() => {
    const refresh = () => setItems(listQueue())
    const unsubscribe = subscribeQueue(refresh)
    void syncPaymentQueue()

    window.addEventListener('online', syncPaymentQueue)
    const interval = window.setInterval(() => { if (navigator.onLine) void syncPaymentQueue() }, 20_000)

    return () => {
      unsubscribe()
      window.removeEventListener('online', syncPaymentQueue)
      window.clearInterval(interval)
    }
  }, [])

  return {
    items,
    pendingCount: items.filter((i) => i.status === 'pending' || i.status === 'syncing').length,
    failedCount: items.filter((i) => i.status === 'failed').length
  }
}
