import { useState, type FormEvent } from 'react'
import { BrandMark } from '@/components/layout/BrandMark'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { MfaChallenge } from '@/components/MfaChallenge'
import { getVerifiedTotpFactorId } from '@/lib/mfa'

export function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [challengeFactorId, setChallengeFactorId] = useState<string | null>(null)

  async function saveNewPassword() {
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) { setChallengeFactorId(null); setError(error.message); return }
    setDone(true)
    setTimeout(() => navigate('/', { replace: true }), 1200)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return }
    // La sesión del enlace de recuperación es AAL1; Supabase exige AAL2 para
    // cambiar la contraseña cuando MFA está activado. Si la cuenta tiene un
    // factor TOTP verificado, se pide el código de 6 dígitos antes de guardar.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.nextLevel === 'aal2') {
      const factorId = await getVerifiedTotpFactorId()
      if (!factorId) { setError('Tu cuenta exige un segundo factor, pero no se encontró ninguno activo. Intenta de nuevo.'); return }
      setChallengeFactorId(factorId)
      return
    }
    await saveNewPassword()
  }

  return (
    <div className="flex min-h-screen items-center justify-center auth-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6"><BrandMark size={44} /></div>
        <h1 className="t-h2 mb-1 text-on-navy">Nueva contraseña</h1>
        <div className="mt-6">
          {done ? (
            <div className="glass-panel glass-strong p-6">
              <p className="text-sm text-content">Contraseña actualizada. Entrando…</p>
            </div>
          ) : challengeFactorId ? (
            <>
              <p className="mb-4 text-sm text-content">Para guardar tu nueva contraseña, confirma primero el código de 6 dígitos.</p>
              <MfaChallenge
                factorId={challengeFactorId}
                onVerified={saveNewPassword}
                onCancel={() => setChallengeFactorId(null)}
              />
            </>
          ) : (
            <div className="glass-panel glass-strong p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
                <div>
                  <label className="field-label" htmlFor="password">Nueva contraseña</label>
                  <input id="password" type="password" required minLength={8} autoComplete="new-password"
                    className="field-input" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <button type="submit" disabled={busy} className="btn-solid w-full">
                  {busy ? 'Guardando…' : 'Guardar contraseña'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
