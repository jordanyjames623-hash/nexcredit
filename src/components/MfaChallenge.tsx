import { useState, type FormEvent } from 'react'
import { verifyTotpCode } from '@/lib/mfa'

// SEC-007: reto TOTP en el inicio de sesión, cuando la cuenta tiene un factor verificado.
export function MfaChallenge({ factorId, onVerified, onCancel }: {
  factorId: string
  onVerified: () => void
  onCancel: () => void
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await verifyTotpCode(factorId, code)
      onVerified()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código incorrecto o vencido.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="glass-panel glass-strong p-6 space-y-4">
      <p className="text-sm text-content-muted">
        Tu cuenta tiene verificación en dos pasos. Escribe el código de 6 dígitos de tu app autenticadora.
      </p>
      {error && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      <div>
        <label className="field-label" htmlFor="mfa-challenge-code">Código de 6 dígitos</label>
        <input id="mfa-challenge-code" required autoFocus inputMode="numeric" autoComplete="one-time-code"
          className="field-input text-center text-lg tracking-[0.3em]" value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} maxLength={6} />
      </div>
      <button type="submit" disabled={busy || code.length !== 6} className="btn-solid w-full">
        {busy ? 'Verificando…' : 'Entrar'}
      </button>
      <button type="button" onClick={onCancel} disabled={busy} className="w-full text-center text-sm text-content-muted hover:underline">
        Cancelar y volver
      </button>
    </form>
  )
}
