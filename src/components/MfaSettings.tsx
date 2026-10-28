import { useEffect, useState } from 'react'
import { getVerifiedTotpFactorId } from '@/lib/mfa'
import { MfaEnroll } from './MfaEnroll'

// SEC-007: panel de segundo factor en Configuración > Cuenta (solo el propietario lo ve,
// porque Settings lo renderiza con isOwner). Sin factor verificado muestra la inscripción;
// con factor verificado muestra el estado activo. No hay baja desde la app: si el propietario
// pierde el teléfono, el factor se elimina desde el panel de Supabase.
export function MfaSettings() {
  const [state, setState] = useState<'checking' | 'active' | 'setup'>('checking')

  useEffect(() => {
    let alive = true
    getVerifiedTotpFactorId().then((f) => { if (alive) setState(f ? 'active' : 'setup') })
    return () => { alive = false }
  }, [])

  if (state === 'checking') return <p className="text-sm text-content-muted">Revisando…</p>

  if (state === 'active') {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-content">Verificación en dos pasos activa</p>
        <p className="text-sm text-content-muted">
          Cada vez que entres se te pedirá un código de tu app autenticadora, además de la contraseña.
        </p>
        <p className="text-xs text-content-muted">
          Si pierdes tu teléfono, el acceso se recupera eliminando el factor desde el panel de Supabase.
        </p>
      </div>
    )
  }

  return <MfaEnroll onDone={() => setState('active')} />
}
