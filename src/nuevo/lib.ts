// Utilidades de la app nueva (maqueta interactiva, tema oscuro): montos sin decimales, como se ven en la maqueta.
export function money0(n: number | null | undefined) {
  return new Intl.NumberFormat('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n ?? 0)
}

// Iniciales de dos letras para los avatares de la maqueta (MD, YF, PS).
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

export const FREQ_LABEL: Record<string, string> = { weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual' }
export const FREQ_NOUN: Record<string, string> = { weekly: 'semanal', biweekly: 'quincenal', monthly: 'mensual' }

// Un paso de frecuencia después de una fecha (para el primer pago del préstamo nuevo).
export function freqStep(dateIso: string, frequency: string) {
  const d = new Date(dateIso + 'T00:00:00')
  if (frequency === 'weekly') d.setDate(d.getDate() + 7)
  else if (frequency === 'biweekly') d.setDate(d.getDate() + 14)
  else d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

// "Martes 25 de octubre" — como el encabezado de Inicio en la maqueta.
export function dateLabelEs(d: Date) {
  const s = d.toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// "octubre" — como el subtítulo de Pagos en la maqueta ("Recibos de octubre").
export function monthLabelEs(d: Date) {
  const s = d.toLocaleDateString('es-DO', { month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Color de avatar estable por cliente (la maqueta usa un color por persona).
const AVATAR_COLORS = ['#F97316', '#14B8A6', '#3B82F6', '#A855F7', '#22C55E', '#EC4899', '#EAB308', '#6366F1']
export function avatarColor(key: string) {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

// Dia de semana en minuscula ("viernes") para "Vence el viernes".
export function weekdayEs(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-DO', { weekday: 'long' })
}

// "hoy" / "ayer" / "el viernes" para vencimientos.
export function relDayEs(iso: string) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' })
  const d = new Date(iso + 'T00:00:00')
  const t = new Date(today + 'T00:00:00')
  const diff = Math.round((t.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return 'hoy'
  if (diff === 1) return 'ayer'
  return 'el ' + weekdayEs(iso)
}

// "Hoy" / "Ayer" / fecha corta para las filas de Pagos.
export function relDateEs(iso: string) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' })
  const d = new Date(iso + 'T00:00:00')
  const t = new Date(today + 'T00:00:00')
  const diff = Math.round((t.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Ayer'
  return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Hora "10:24 a.m." solo si el pago trae hora real (las fechas de negocio guardadas como
// medianoche UTC no tienen hora y se omiten, como en la app anterior).
export function timeLabelEs(iso: string) {
  const d = new Date(iso)
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return ''
  return d.toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' }).replace(' a. m.', ' a.m.').replace(' p. m.', ' p.m.')
}

// "18 de oct" para "Saldado el 18 de oct".
export function dayMonthEs(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.getDate() + ' de ' + d.toLocaleDateString('es-DO', { month: 'short' })
}

// Lunes y domingo (ISO) de la semana actual, para la grafica semanal.
export function currentWeekRange(today: Date) {
  const day = (today.getDay() + 6) % 7
  const monday = new Date(today.getTime() - day * 86400000)
  const sunday = new Date(monday.getTime() + 6 * 86400000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { monday: iso(monday), sunday: iso(sunday) }
}

// Enlace de WhatsApp con texto, como el "Recordar" y el boton de WhatsApp de la maqueta.
export function waLink(phone: string | null, text: string) {
  if (!phone) return null
  const digits = phone.replace(/[^0-9]/g, '')
  const normalized = digits.length === 10 ? '1' + digits : digits
  return 'https://wa.me/' + normalized + '?text=' + encodeURIComponent(text)
}

// Etiquetas de tipo de pago (las del comprobante, mas "Abono parcial" de la maqueta).
export const PAYMENT_TYPE_LABEL: Record<string, string> = {
  regular: 'Cuota regular', principal: 'Abono a capital', interest: 'Interés', late_fee: 'Mora', custom: 'Abono parcial', partial: 'Abono parcial'
}

export function telLink(phone: string | null) {
  if (!phone) return null
  return 'tel:' + phone.replace(/\s/g, '')
}
