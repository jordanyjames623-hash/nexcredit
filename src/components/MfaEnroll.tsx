import { useState, type FormEvent } from 'react'
import { startTotpEnroll, verifyTotpCode, type TotpEnrollment } from '@/lib/mfa'

// SEC-007: inscripción TOTP del propietario. Se usa en la puerta obligatoria (ProtectedRoute)
// y en Configuración > Cuenta. Al confirmar el código, el factor queda verificado.
export function MfaEnroll({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<'start' | 'scan'>('start')
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  async function start() {
    setError(null)
    setBusy(true)
    try {
      setEnrollment(await startTotpEnroll())
      setStep('scan')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar. Intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault()
    if (!enrollment) return
    setError(null)
    setBusy(true)
    try {
      await verifyTotpCode(enrollment.factorId, code)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código incorrecto o vencido.')
    } finally {
      setBusy(false)
    }
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text) } catch { return }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  if (step === 'start') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-content-muted">
          Como propietario, tu cuenta exige un segundo factor: cada vez que entres, además de la
          contraseña, escribirás un código de 6 dígitos de una app autenticadora (Google Authenticator,
          Authy o similar). Sin ese código no se puede entrar, aunque alguien tenga tu contraseña.
        </p>
        {error && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        <button onClick={start} disabled={busy} className="btn-solid w-full">
          {busy ? 'Generando…' : 'Activar verificación en dos pasos'}
        </button>
        <p className="text-xs text-content-muted">
          Si pierdes tu teléfono, el acceso se recupera eliminando el factor desde el panel de Supabase.
        </p>
      </div>
    )
  }

  const qr = enrollment?.qrCode ?? ''
  return (
    <form onSubmit={confirm} className="space-y-4">
      <p className="text-sm text-content-muted">
        Escanea este código con tu app autenticadora y escribe el código de 6 dígitos que muestra.
      </p>
      {qr.startsWith('data:') ? (
        <img src={qr} alt="Código QR para la app autenticadora" className="mx-auto block w-48 rounded bg-white p-2" />
      ) : qr.startsWith('<') ? (
        <img src={`data:image/svg+xml;utf8,${encodeURIComponent(qr)}`} alt="Código QR para la app autenticadora" className="mx-auto block w-48 rounded bg-white p-2" />
      ) : null}
      {enrollment && (
        <div className="space-y-2">
          <p className="text-xs text-content-muted">Si no puedes escanear, escribe este secreto a mano en la app:</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-background px-3 py-2 font-mono text-sm text-content">{enrollment.secret}</code>
            <button type="button" onClick={() => copy(enrollment.secret)} className="btn-secondary !px-2.5 !py-2 text-xs">
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      <div>
        <label className="field-label" htmlFor="mfa-code">Código de 6 dígitos</label>
        <input id="mfa-code" required autoFocus inputMode="numeric" autoComplete="one-time-code"
          className="field-input text-center text-lg tracking-[0.3em]" value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} maxLength={6} />
      </div>
      <button type="submit" disabled={busy || code.length !== 6} className="btn-solid w-full">
        {busy ? 'Confirmando…' : 'Confirmar y activar'}
      </button>
    </form>
  )
}
