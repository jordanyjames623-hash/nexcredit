import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { getVerifiedTotpFactorId } from '@/lib/mfa'
import { MfaEnroll } from './MfaEnroll'
import { BrandMark } from '@/components/layout/BrandMark'

export function ProtectedRoute() {
  const { session, loading, isOwner, membership, signOut } = useAuth()
  // SEC-007: el propietario sin factor TOTP verificado no entra a la app: ve solo la
  // inscripción. Los colaboradores no pasan por aquí (isOwner false).
  const [mfaState, setMfaState] = useState<'checking' | 'ok' | 'setup'>('checking')

  useEffect(() => {
    if (loading || !session || !membership) return
    if (!isOwner) { setMfaState('ok'); return }
    let alive = true
    setMfaState('checking')
    getVerifiedTotpFactorId().then((f) => { if (alive) setMfaState(f ? 'ok' : 'setup') })
    return () => { alive = false }
  }, [loading, session, membership, isOwner])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy text-on-navy">
        <p className="text-sm">Cargando…</p>
      </div>
    )
  }

  if (!session) return <Navigate to="/entrar" replace />

  // La membresía todavía se está resolviendo (tras entrar, llega justo después de la sesión).
  // Login ya garantiza que la fila existe, así que esperar aquí no deja a nadie atascado.
  if (!membership) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy text-on-navy">
        <p className="text-sm">Cargando…</p>
      </div>
    )
  }

  if (mfaState === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy text-on-navy">
        <p className="text-sm">Cargando…</p>
      </div>
    )
  }

  if (mfaState === 'setup') {
    return (
      <div className="flex min-h-screen items-center justify-center auth-bg px-4">
        <div className="w-full max-w-sm">
          <div className="mb-6"><BrandMark size={44} /></div>
          <h1 className="t-h2 mb-1 text-on-navy">NEXCREDIT</h1>
          <p className="mb-8 text-sm text-on-navy/60">
            Como propietario, tu cuenta exige verificación en dos pasos. Actívala para entrar.
          </p>
          <div className="glass-panel glass-strong p-6">
            <MfaEnroll onDone={() => setMfaState('ok')} />
          </div>
          <button onClick={() => void signOut()} className="mt-6 w-full text-center text-sm text-on-navy/60 hover:underline">
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  return <Outlet />
}
