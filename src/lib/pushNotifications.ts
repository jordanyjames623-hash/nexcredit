import { supabase } from '@/lib/supabase'

// Clave pública VAPID (es pública por diseño: solo identifica al servidor que envía).
export const VAPID_PUBLIC_KEY = 'BF3WYzb2aoAdsCga0IHGiarRaNjbdHdHMgX956jbnOLhBe1M1A_8wERkT-uWbBz7BV90l4k8s3YJKzWVIRi-f3I'

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64Safe)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export type PushState = 'checking' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'

/** ¿Tiene este dispositivo una suscripción guardada para este usuario y negocio? */
export async function getPushState(userId: string, businessId: string): Promise<Exclude<PushState, 'checking'>> {
  if (!isPushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return 'unsubscribed'
  const { data } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .eq('endpoint', sub.endpoint)
    .maybeSingle()
  return data ? 'subscribed' : 'unsubscribed'
}

/** Pide el permiso y registra este dispositivo para los avisos de cuotas. */
export async function subscribePush(userId: string, businessId: string): Promise<{ ok: boolean; message?: string }> {
  if (!isPushSupported()) return { ok: false, message: 'Este dispositivo no admite notificaciones push.' }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, message: 'No se permitió el envío de notificaciones. Actívalo en los ajustes del teléfono o del navegador y vuelve a intentarlo.' }
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    })
    const json = sub.toJSON()
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        business_id: businessId,
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
        updated_at: new Date().toISOString()
      },
      { onConflict: 'user_id,business_id,endpoint' }
    )
    if (error) return { ok: false, message: 'No se pudo guardar la suscripción. Intenta de nuevo.' }
    return { ok: true }
  } catch {
    return { ok: false, message: 'No se pudo activar en este dispositivo. En iPhone, instala la app en tu pantalla de inicio (Compartir → Añadir a pantalla de inicio) y actívala desde la app instalada.' }
  }
}

/** Quita la suscripción de este dispositivo. */
export async function unsubscribePush(userId: string, businessId: string): Promise<void> {
  if (!isPushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await sub.unsubscribe().catch(() => {})
  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .eq('endpoint', sub.endpoint)
}
