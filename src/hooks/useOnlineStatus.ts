import { useEffect, useState } from 'react'

/**
 * Estado de conexión real del dispositivo.
 *
 * Política por tipo de operación (decisión explícita, no accidental):
 * - Registrar un pago (LoanDetail): NO se bloquea sin conexión. Se guarda en este dispositivo
 *   (ver lib/paymentQueue.ts) y se envía solo al recuperar señal, protegido contra duplicados por la
 *   llave de idempotencia que ya resuelve register_payment() en el servidor. Decisión tomada a propósito
 *   el 2026-10-01, revirtiendo la política anterior de "bloquear, nunca encolar" para este caso puntual.
 * - Todo lo demás (crear/editar cliente, crear préstamo, anular pago, gestión de cobranza, rutas,
 *   colaboradores) SIGUE bloqueado sin conexión, con un mensaje claro — nada se envía en silencio al
 *   volver la señal. Son acciones menos frecuentes en campo, con más superficie para pisarse con cambios
 *   hechos desde otro dispositivo mientras este estaba offline, y no tienen la misma protección de
 *   idempotencia en el servidor que sí tiene register_payment().
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return isOnline
}
