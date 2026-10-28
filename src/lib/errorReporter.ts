import { reportToNextex } from './nextexRelay'

// NEXCREDIT-2 — Reportero de errores hacia nextex.
// Captura window.onerror y los rechazos de promesas no controlados y los manda al relay
// type 'error'. Solo viajan: tipo + mensaje + ruta. NUNCA datos de clientes: la ruta se
// manda sin IDs (un UUID en la dirección se cambia por ':id') y el mensaje se recorta.
// Para no inundar nextex si un error se repite en bucle, el mismo mensaje + ruta solo se
// reporta una vez por minuto.

let installed = false
const recent = new Map<string, number>()

function sanitizeRoute(path: string): string {
  return path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
}

function redact(text: string): string {
  return text
    .replace(/\d{3}-\d{7}-\d/g, '[REDACTADO]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTADO]')
    .replace(/(?:\+?1[-.\s]?)?(?:809|829|849)[-.\s]?\d{3}[-.\s]?\d{4}/g, '[REDACTADO]')
    .replace(/RD\$\s?[\d,]+(?:\.\d{2})?/g, '[REDACTADO]')
}

function send(errorType: string, message: string): void {
  const clean = redact(message).trim().slice(0, 500)
  if (!clean) return
  const key = `${errorType}:${clean}`
  const now = Date.now()
  const last = recent.get(key)
  if (last !== undefined && now - last < 60_000) return
  recent.set(key, now)
  if (recent.size > 200) {
    const oldest = [...recent.entries()].sort((a, b) => a[1] - b[1])[0]
    if (oldest) recent.delete(oldest[0])
  }
  void reportToNextex('error', {
    error_type: errorType,
    message: clean,
    detail: { route: sanitizeRoute(window.location.pathname) },
  })
}

export function installErrorReporter(): void {
  if (installed) return
  installed = true
  // Errores de JS en la página. Los errores de recursos (imagen/script que no carga)
  // llegan sin mensaje y se ignoran para no meter ruido.
  window.addEventListener('error', (e) => {
    if (typeof e.message === 'string' && e.message) send('window.onerror', e.message)
  })
  window.addEventListener('unhandledrejection', (e) => {
    const reason = (e as PromiseRejectionEvent).reason
    const message = reason instanceof Error ? reason.message : String(reason ?? 'Rechazo no controlado')
    send('unhandledrejection', message)
  })
  // Violaciones de la CSP (SEC-004): van a nextex como errores, con la directiva violada
  // y la URI bloqueada (sin IDs, por sanitizeRoute en el mensaje y la ruta). El mismo
  // dedupe de 60 s evita inundar nextex si un recurso bloqueado se reintenta en bucle.
  // Cobertura: solo violaciones en páginas con el JS corriendo; la recolección por
  // report-uri queda para después si hace falta más cobertura.
  document.addEventListener('securitypolicyviolation', (e) => {
    const directive = e.violatedDirective || 'csp'
    const blocked = e.blockedURI ? sanitizeRoute(e.blockedURI) : ''
    send('csp_violation', `${directive}${blocked ? ` ${blocked}` : ''}`)
  })
}
