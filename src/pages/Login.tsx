import { useEffect, useState, type FormEvent } from 'react'
import { BrandMark } from '@/components/layout/BrandMark'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { reportToNextex } from '@/lib/nextexRelay'
import { MfaChallenge } from '@/components/MfaChallenge'
import { getVerifiedTotpFactorId } from '@/lib/mfa'
import { useAuth } from '@/contexts/AuthContext'

type Role = 'owner' | 'collaborator'

// Rol elegido antes de salir hacia Google: al volver, se verifica igual que con contraseña.
const OAUTH_ROLE_KEY = 'nc_oauth_role'

export function Login() {
  const navigate = useNavigate()
  const [role, setRole] = useState<Role | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // SEC-007: si la cuenta tiene un factor TOTP verificado, tras la contraseña se pide el código.
  const [challengeFactorId, setChallengeFactorId] = useState<string | null>(null)
  const { session, signOut } = useAuth()

  // Verifica que el rol real de la cuenta coincida con el elegido y, si la cuenta
  // tiene un factor TOTP verificado, pide el segundo código. Devuelve true solo si
  // ya se puede entrar sin más pasos.
  async function verifyAccess(userId: string, expectedRole: Role): Promise<boolean> {
    const { data: member, error: memberError } = await supabase
      .from('business_members')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()

    if (memberError || !member) {
      await signOut()
      setError('No se pudo verificar tu cuenta. Intenta de nuevo.')
      return false
    }

    if (member.role !== expectedRole) {
      await signOut()
      setError(
        expectedRole === 'owner'
          ? 'Esta cuenta es de un colaborador, no de un propietario. Selecciona "Soy Colaborador" para entrar.'
          : 'Esta cuenta es de un propietario, no de un colaborador. Selecciona "Soy Propietario / Administrador" para entrar.'
      )
      return false
    }

    // SEC-007: la contraseña y el rol son correctos; si la cuenta tiene un factor TOTP
    // verificado, el segundo código es obligatorio antes de entrar.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (!aal) {
      await signOut()
      setError('No se pudo verificar el segundo factor. Intenta de nuevo.')
      return false
    }
    if (aal.nextLevel === 'aal2') {
      const factorId = await getVerifiedTotpFactorId()
      if (!factorId) {
        await signOut()
        setError('Tu cuenta exige un segundo factor, pero no se encontró ninguno activo. Intenta de nuevo.')
        return false
      }
      setChallengeFactorId(factorId)
      return false
    }

    return true
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!role) return
    setBusy(true)

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError || !signInData.user) {
      setBusy(false)
      setError('Correo o contraseña incorrectos.')
      // NEXCREDIT-2 (patrón VIGÍA IS-VIG-1): el login fallido se reporta a nextex. La IP
      // la toma el relay de las cabeceras del request; aquí solo viajan fecha y ruta, sin
      // el correo ni ningún dato del intento.
      void reportToNextex('vigia', {
        event_type: 'failed_login',
        detail: { fecha: new Date().toISOString(), ruta: '/entrar' },
      })
      return
    }

    const ok = await verifyAccess(signInData.user.id, role)
    setBusy(false)
    if (ok) navigate('/', { replace: true })
  }

  // Al volver de Google la sesión ya existe: se verifica el rol elegido y el
  // segundo factor igual que con contraseña.
  useEffect(() => {
    if (!session?.user) return
    const pendingRole = sessionStorage.getItem(OAUTH_ROLE_KEY) as Role | null
    if (pendingRole !== 'owner' && pendingRole !== 'collaborator') return
    sessionStorage.removeItem(OAUTH_ROLE_KEY)
    setRole(pendingRole)
    setBusy(true)
    void verifyAccess(session.user.id, pendingRole).then((ok) => {
      setBusy(false)
      if (ok) navigate('/', { replace: true })
    })
  }, [session])

  async function handleGoogle() {
    if (!role) return
    setError(null)
    setBusy(true)
    sessionStorage.setItem(OAUTH_ROLE_KEY, role)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/entrar` },
    })
    if (error) {
      sessionStorage.removeItem(OAUTH_ROLE_KEY)
      setBusy(false)
      setError('No se pudo iniciar el acceso con Google. Intenta de nuevo.')
    }
  }

  if (challengeFactorId) {
    return (
      <div className="flex min-h-screen items-center justify-center auth-bg px-4">
        <div className="w-full max-w-sm">
          <div className="mb-6"><BrandMark size={44} /></div>
          <h1 className="t-h2 mb-1 text-on-navy">NEXCREDIT</h1>
          <p className="mb-8 text-sm text-on-navy/60">Verificación en dos pasos.</p>
          <MfaChallenge
            factorId={challengeFactorId}
            onVerified={() => navigate('/', { replace: true })}
            onCancel={async () => {
              await signOut()
              setChallengeFactorId(null)
              setPassword('')
            }}
          />
        </div>
      </div>
    )
  }

  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center auth-bg px-4">
        <div className="w-full max-w-sm">
          <div className="mb-6"><BrandMark size={44} /></div>
        <h1 className="t-h2 mb-1 text-on-navy">NEXCREDIT</h1>
          <p className="mb-8 text-sm text-on-navy/60">¿Cómo vas a entrar?</p>
          <div className="space-y-3">
            <button onClick={() => setRole('owner')} className="btn-solid w-full !py-4 text-base">
              Soy Propietario / Administrador
            </button>
            <button onClick={() => setRole('collaborator')} className="w-full glass-panel glass-strong !rounded-2xl px-4 py-4 text-base font-semibold text-content transition-transform hover:-translate-y-0.5">
              Soy Colaborador
            </button>
          </div>
          <p className="mt-6 text-center text-xs text-on-navy/50">
            Esta elección solo cambia lo que ves en esta pantalla. Tus permisos reales siempre
            los define tu cuenta, no lo que elijas aquí.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center auth-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6"><BrandMark size={44} /></div>
        <h1 className="t-h2 mb-1 text-on-navy">NEXCREDIT</h1>
        <p className="mb-1 text-sm text-on-navy/60">
          {role === 'owner' ? 'Inicia sesión como propietario.' : 'Inicia sesión como colaborador.'}
        </p>
        <button onClick={() => setRole(null)} className="mb-7 text-xs text-on-navy/50 hover:underline">
          ← Cambiar
        </button>

        <form onSubmit={handleSubmit} className="glass-panel glass-strong p-6 space-y-4">
          {error && (
            <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <div>
            <label className="field-label" htmlFor="email">Correo</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              className="field-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" disabled={busy} className="btn-solid w-full">
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
          <p className="text-right text-sm">
            <Link to="/recuperar" className="text-content-muted hover:underline">¿Olvidaste tu contraseña?</Link>
          </p>
        </form>

        <p className="mt-6 mb-3 text-center text-xs text-on-navy/50">o continúa con</p>
        <button type="button" onClick={handleGoogle} disabled={busy} className="w-full glass-panel glass-strong !rounded-2xl px-4 py-4 text-base font-semibold text-content transition-transform hover:-translate-y-0.5 disabled:opacity-60">
          Continuar con Google
        </button>

        {role === 'owner' && (
          <p className="mt-6 text-center text-sm text-on-navy/60">
            ¿Primera vez con tu negocio?{' '}
            <Link to="/registrar" className="font-semibold text-on-navy underline-offset-4 hover:underline">Crea tu cuenta</Link>
          </p>
        )}
      </div>
    </div>
  )
}
