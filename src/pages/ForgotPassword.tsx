import { useState, type FormEvent } from 'react'
import { BrandMark } from '@/components/layout/BrandMark'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/restablecer` })
    setBusy(false)
    setSent(true)
  }

  return (
    <div className="flex min-h-screen items-center justify-center auth-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6"><BrandMark size={44} /></div>
        <h1 className="t-h2 mb-1 text-on-navy">Recuperar contraseña</h1>
        <p className="mb-8 text-sm text-on-navy/60">Te enviaremos un enlace para restablecerla.</p>

        <div className="glass-panel glass-strong p-6">
          {sent ? (
            <p className="text-sm text-content">Si el correo existe, revisa tu bandeja de entrada para continuar.</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="field-label" htmlFor="email">Correo</label>
                <input id="email" type="email" required autoComplete="email" className="field-input"
                  value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <button type="submit" disabled={busy} className="btn-solid w-full">
                {busy ? 'Enviando…' : 'Enviar enlace'}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-on-navy/60">
          <Link to="/entrar" className="font-semibold text-on-navy underline-offset-4 hover:underline">Volver a entrar</Link>
        </p>
      </div>
    </div>
  )
}
