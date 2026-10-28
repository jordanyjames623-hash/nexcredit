import { useState, type FormEvent } from 'react'
import { BrandMark } from '@/components/layout/BrandMark'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export function Signup() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'form' | 'verify'>('form')
  const [fullName, setFullName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resent, setResent] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    setBusy(true)
    // El trigger private.handle_new_user crea el negocio y la membresía "owner" automáticamente
    // a partir de estos metadatos — ver auditoría del esquema.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, business_name: businessName } }
    })
    setBusy(false)
    if (error) {
      // SEC-014: mensaje generico - un correo ya registrado se trata igual que uno nuevo
      // (pasa a verificar) para no revelar que correos tienen cuenta.
      if (error.message === 'User already registered') { setStep('verify'); return }
      setError(error.message)
      return
    }
    // Si el correo ya tiene una cuenta confirmada, Supabase no manda error ni un codigo nuevo:
    // solo devuelve el usuario sin "identities". SEC-014: se trata igual que un registro nuevo
    // (pasa a verificar) para no revelar que correos tienen cuenta.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setStep('verify')
      return
    }
    setStep('verify')
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'signup' })
    setBusy(false)
    if (error) {
      setError('El código no es válido o ya venció. Revisa que lo hayas copiado bien, o pide uno nuevo.')
      return
    }
    navigate('/', { replace: true })
  }

  async function handleResend() {
    setError(null)
    setBusy(true)
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    setBusy(false)
    // SEC-014: tampoco el reenvío revela si el correo ya tiene cuenta.
    if (error) {
      if (error.message === 'User already registered') { setResent(true); setTimeout(() => setResent(false), 4000); return }
      setError(error.message); return
    }
    setResent(true)
    setTimeout(() => setResent(false), 4000)
  }

  return (
    <div className="flex min-h-screen items-center justify-center auth-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6"><BrandMark size={44} /></div>
        <h1 className="t-h2 mb-1 text-on-navy">Crea tu cuenta</h1>
        <p className="mb-8 text-sm text-on-navy/60">Como propietario, tu negocio se crea al instante.</p>

        {step === 'form' && (
          <>
            <form onSubmit={handleSubmit} className="glass-panel glass-strong p-6 space-y-4">
              {error && (
                <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
                  {error}
                </p>
              )}
              <div>
                <label className="field-label" htmlFor="fullName">Tu nombre</label>
                <input id="fullName" required className="field-input" value={fullName}
                  onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div>
                <label className="field-label" htmlFor="businessName">Nombre del negocio</label>
                <input id="businessName" required className="field-input" value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)} />
              </div>
              <div>
                <label className="field-label" htmlFor="email">Correo</label>
                <input id="email" type="email" required autoComplete="email" className="field-input"
                  value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="field-label" htmlFor="password">Contraseña</label>
                <input id="password" type="password" required autoComplete="new-password" minLength={8}
                  className="field-input" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <button type="submit" disabled={busy} className="btn-solid w-full">
                {busy ? 'Creando…' : 'Crear cuenta'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-on-navy/60">
              ¿Ya tienes cuenta?{' '}
              <Link to="/entrar" className="font-semibold text-on-navy underline-offset-4 hover:underline">Entra aquí</Link>
            </p>
          </>
        )}

        {step === 'verify' && (
          <form onSubmit={handleVerify} className="glass-panel glass-strong p-6 space-y-4">
            <p className="text-sm text-content-muted">
              Te enviamos un código de confirmación a <span className="font-medium text-content">{email}</span>. Escríbelo aquí abajo para entrar.
            </p>
            {error && (
              <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            {resent && <p className="rounded bg-success/10 px-3 py-2 text-sm text-success-text">Código reenviado — revisa tu correo.</p>}
            <div>
              <label className="field-label" htmlFor="code">Código de verificación</label>
              <input id="code" required autoFocus inputMode="numeric" className="field-input text-center text-lg tracking-[0.3em]"
                value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} />
            </div>
            <button type="submit" disabled={busy} className="btn-solid w-full">
              {busy ? 'Confirmando…' : 'Confirmar y entrar'}
            </button>
            <button type="button" onClick={handleResend} disabled={busy} className="w-full text-center text-sm text-primary hover:underline">
              Reenviar código
            </button>
            <Link to="/entrar" className="block w-full text-center text-xs text-content-muted hover:underline">
              Cancelar y volver a la pantalla de entrada
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
