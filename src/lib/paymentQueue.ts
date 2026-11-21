import { supabase } from './supabase'
import { queryClient } from './queryClient'

// Cola de pagos sin conexión. Decisión explícita (reemplaza la anterior "bloquear, nunca encolar"):
// un pago hecho sin señal se guarda en este dispositivo y se envía solo al recuperar conexión.
// La seguridad contra duplicados NO la da este módulo — la da que register_payment() ya resuelve
// p_idempotency_key antes de tocar nada: si el mismo pago se reintenta (red cortada a mitad de la
// respuesta, la app se cierra antes de confirmar, etc.) el servidor devuelve el pago ya existente
// marcado "duplicate": true en vez de volver a aplicarlo. Por eso cada pago guarda SU PROPIA llave,
// generada una sola vez al encolarse, y la cola siempre reintenta con esa misma llave.

export type QueuedPayment = {
  id: string
  idempotency_key: string
  loan_id: string
  loan_number: number
  client_name: string
  payment_type: string
  amount: number | null
  principal: number
  interest: number
  late_fee: number
  payment_method: string
  notes: string | null
  user_id?: string;
  business_id?: string;
  queued_at: string
  status: 'pending' | 'syncing' | 'failed'
  error_message?: string
}

const KEY = 'capitalia_payment_queue'
const EVENT = 'capitalia-payment-queue-changed'
// Identidad de la sesión activa; la pone AuthContext cuando cambia la sesión.
// La cola nunca muestra ni sincroniza pagos de otro usuario o negocio.
let currentIdentity: { userId: string | null; businessId: string | null } = { userId: null, businessId: null }
export function setPaymentQueueIdentity(userId: string | null, businessId: string | null) {
  currentIdentity = { userId, businessId }
}

function read(): QueuedPayment[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}
function write(items: QueuedPayment[]) {
  localStorage.setItem(KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(EVENT))
}

export function listQueue(): QueuedPayment[] {
  const { userId, businessId } = currentIdentity
  if (!userId || !businessId) return []
  return read()
    .filter((p) => p.user_id === userId && p.business_id === businessId)
    .sort((a, b) => a.queued_at.localeCompare(b.queued_at))
}

export function subscribeQueue(callback: () => void): () => void {
  window.addEventListener(EVENT, callback)
  window.addEventListener('storage', callback)   // por si hay otra pestaña abierta
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener('storage', callback) }
}

export function enqueuePayment(item: Omit<QueuedPayment, 'id' | 'status' | 'queued_at'>): string {
  const id = crypto.randomUUID()
  const items = read()
  items.push({ ...item, id, status: 'pending', queued_at: new Date().toISOString(), user_id: currentIdentity.userId ?? undefined, business_id: currentIdentity.businessId ?? undefined })
  write(items)
  return id
}

export function removeFromQueue(id: string) {
  write(read().filter((i) => i.id !== id))
}

function patchQueue(id: string, patch: Partial<QueuedPayment>) {
  write(read().map((i) => (i.id === id ? { ...i, ...patch } : i)))
}

// Un fallo de red (sin respuesta del servidor) se reintenta solo; un error que el servidor sí alcanzó
// a responder (una regla de negocio que ya no se cumple, p. ej. el préstamo se liquidó desde otro
// dispositivo mientras este estaba sin señal) se marca para que alguien lo revise — nunca se descarta
// en silencio.
function isNetworkError(error: unknown): boolean {
  // Un error que de verdad llegó a Postgres SIEMPRE trae un código (hasta un "raise exception" simple
  // recibe el código por defecto P0001). Si no hay código, la petición nunca llegó a responder — da igual
  // cómo lo describa el navegador: Chrome dice "Failed to fetch", Firefox "NetworkError…", Safari solo
  // "Load failed" (sin la palabra "network" ni "fetch"), así que no conviene depender del texto.
  return !(error as any)?.code
}

let syncing = false

export async function syncPaymentQueue(): Promise<void> {
  if (syncing || !navigator.onLine) return
  syncing = true
  try {
    const pending = listQueue().filter((i) => i.status !== 'syncing')
    let anySynced = false
    for (const item of pending) {
      patchQueue(item.id, { status: 'syncing' })
      try {
        const { data, error } = await supabase.rpc('register_payment', {
          p_loan_id: item.loan_id,
          p_payment_type: item.payment_type,
          p_amount: item.amount,
          p_principal: item.principal,
          p_interest: item.interest,
          p_late_fee: item.late_fee,
          p_idempotency_key: item.idempotency_key,
          p_notes: item.notes,
          p_payment_method: item.payment_method,
          p_device_info: 'offline-queue',
          p_paid_at: item.queued_at
        })
        if (error) throw error
        void data
        removeFromQueue(item.id)
        anySynced = true
      } catch (err) {
        if (isNetworkError(err)) {
          patchQueue(item.id, { status: 'pending' })   // sigue sin señal de verdad; se reintenta después
          break   // no tiene caso seguir probando los demás si la red está caída
        }
        patchQueue(item.id, { status: 'failed', error_message: (err as any)?.message ?? 'No se pudo sincronizar.' })
      }
    }
    if (anySynced) {
      queryClient.invalidateQueries({ queryKey: ['loan'] })
      queryClient.invalidateQueries({ queryKey: ['loan-installments'] })
      queryClient.invalidateQueries({ queryKey: ['loan-payments'] })
      queryClient.invalidateQueries({ queryKey: ['loans'] })
      queryClient.invalidateQueries({ queryKey: ['client'] })
      queryClient.invalidateQueries({ queryKey: ['summary'] })
      queryClient.invalidateQueries({ queryKey: ['route-balance'] })
    }
  } finally {
    syncing = false
  }
}

export function retryQueueItem(id: string) {
  patchQueue(id, { status: 'pending', error_message: undefined })
  void syncPaymentQueue()
}
