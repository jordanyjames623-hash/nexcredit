export function money(n: number | null | undefined) {
  return new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0)
}

export function shortDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function dateTime(iso: string | null | undefined) {
  if (!iso) return { date: '—', time: '—' }
  const d = new Date(iso)
  // Las fechas de negocio (ej. el paid_at de un pago) se guardan como la medianoche UTC de su día:
  // su día correcto es el UTC. Mostrarlas en hora local las corría al día anterior (8:00 p. m. en RD).
  // Esas fechas no tienen una hora real, así que la hora se devuelve vacía.
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
    return {
      date: d.toLocaleDateString('es-DO', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }),
      time: ''
    }
  }
  return {
    date: d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })
  }
}

export const PAYMENT_METHODS = ['cash', 'transfer', 'deposit', 'card', 'other'] as const
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', deposit: 'Depósito', card: 'Tarjeta', other: 'Otro'
}
