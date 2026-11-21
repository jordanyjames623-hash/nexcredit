import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getPushState, subscribePush, unsubscribePush, type PushState } from '@/lib/pushNotifications'

// Panel de notificaciones push en Configuración: avisa de cada cuota que vence hoy
// y de cada cuota recién vencida. La suscripción es por dispositivo: cada teléfono
// o navegador que la active recibe sus propios avisos.
export function PushSettings() {
  const { session, membership } = useAuth()
  const [state, setState] = useState<PushState>('checking')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const userId = session?.user.id ?? null
  const businessId = membership?.business_id ?? null

  useEffect(() => {
    let alive = true
    if (!userId || !businessId) { setState('unsupported'); return }
    getPushState(userId, businessId).then((s) => { if (alive) setState(s) }).catch(() => { if (alive) setState('unsubscribed') })
    return () => { alive = false }
  }, [userId, businessId])

  async function activate() {
    if (!userId || !businessId) return
    setBusy(true)
    setMessage(null)
    const res = await subscribePush(userId, businessId)
    setBusy(false)
    if (res.ok) { setState('subscribed'); setMessage('Notificaciones activadas en este dispositivo.') }
    else setMessage(res.message ?? 'No se pudo activar.')
  }

  async function deactivate() {
    if (!userId || !businessId) return
    setBusy(true)
    await unsubscribePush(userId, businessId)
    setBusy(false)
    setState('unsubscribed')
    setMessage('Notificaciones desactivadas en este dispositivo.')
  }

  if (state === 'checking') return <p className="text-sm text-content-muted">Revisando…</p>

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-content">
        {state === 'subscribed' ? 'Notificaciones activadas' : 'Avisos de cuotas en tu teléfono'}
      </p>
      <p className="text-sm text-content-muted">
        Te llega un aviso por cada cuota que vence hoy y por cada cuota recién vencida, con el cliente y el monto.
      </p>
      {state === 'unsupported' && (
        <p className="text-sm text-content-muted">
          Este dispositivo o navegador no admite notificaciones push. En iPhone, instala la app en tu pantalla de inicio y actívala desde ahí.
        </p>
      )}
      {state === 'denied' && (
        <p className="text-sm text-content-muted">
          Las notificaciones están bloqueadas para esta app. Actívalas en los ajustes del teléfono y vuelve a intentarlo.
        </p>
      )}
      {state === 'subscribed' ? (
        <button type="button" onClick={deactivate} disabled={busy} className="btn-secondary">
          {busy ? 'Guardando…' : 'Desactivar en este dispositivo'}
        </button>
      ) : state !== 'unsupported' && state !== 'denied' ? (
        <button type="button" onClick={activate} disabled={busy} className="btn-solid">
          {busy ? 'Activando…' : 'Activar notificaciones'}
        </button>
      ) : null}
      {message && <p className="text-sm text-content-muted">{message}</p>}
    </div>
  )
}
