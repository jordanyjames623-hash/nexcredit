import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { setPortalSession } from '@/lib/portalAuth'
import { BrandMark } from '@/components/layout/BrandMark'

const LOCKOUT_MESSAGE = 'Demasiados intentos. Intenta de nuevo en unos minutos.'

export function PortalLogin() {
  const navigate = useNavigate()
  const [documentId, setDocumentId] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // 'login' = pantalla normal. 'request' = pidiendo el código. 'confirm' = escribiendo el código + PIN nuevo.
  const [mode, setMode] = useState<'login' | 'request' | 'confirm'>('login')
  const [unlockLoading, setUnlockLoading] = useState(false)
  const [code, setCode] = useState('')
  const [newPin, setNewPin] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('client_portal_login', { p_document_id: documentId.trim(), p_pin: pin.trim() })
      if (error) throw error
      const result = data as { ok: boolean; token?: string; client_name?: string; message?: string }
      if (!result.ok || !result.token) {
        setError(result.message ?? 'No se pudo entrar. Verifica tus datos.')
        return
      }
      setPortalSession(result.token, result.client_name ?? '')
      navigate('/portal', { replace: true })
    } catch (err: any) {
      setError(err.message ?? 'No se pudo entrar. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  async function requestCode() {
    setError(null)
    setUnlockLoading(true)
    try {
      // Esta función nunca exige sesión de Supabase (el cliente del portal no tiene una) — se llama
      // directo, igual que client_portal_login. Nunca devuelve el código ni el teléfono al navegador.
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>('portal-unlock', {
        body: { document_id: documentId.trim() }
      })
      if (error) throw error
      if (!data?.ok) { setError(data?.error ?? 'No se pudo enviar el código.'); return }
      setInfo('Te enviamos un código a tu teléfono registrado. Vence en 10 minutos.')
      setMode('confirm')
    } catch (err: any) {
      setError(err.message ?? 'No se pudo enviar el código.')
    } finally {
      setUnlockLoading(false)
    }
  }

  async function confirmCode(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setUnlockLoading(true)
    try {
      const { data, error } = await supabase.rpc('confirm_portal_unlock', {
        p_document_id: documentId.trim(), p_code: code.trim(), p_new_pin: newPin.trim()
      })
      if (error) throw error
      const result = data as { ok: boolean; message?: string }
      if (!result.ok) { setError(result.message ?? 'Código incorrecto.'); return }
      setMode('login')
      setPin('')
      setCode('')
      setNewPin('')
      setInfo('Listo — tu PIN quedó actualizado. Entra con el nuevo.')
    } catch (err: any) {
      setError(err.message ?? 'No se pudo confirmar el código.')
    } finally {
      setUnlockLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center auth-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <BrandMark size={44} />
          <div>
            <h1 className="t-h2 text-cream">Mi cuenta</h1>
            <p className="text-sm text-on-navy/70">Consulta tus préstamos, saldo y recibos.</p>
          </div>
        </div>

        {mode === 'login' && (
          <form onSubmit={handleSubmit} className="glass-panel glass-strong space-y-4 p-6">
            {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
            {info && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success-text">{info}</p>}
            <div>
              <label className="field-label" htmlFor="doc">Cédula</label>
              <input id="doc" required autoComplete="off" inputMode="numeric" className="field-input"
                value={documentId} onChange={(e) => setDocumentId(e.target.value)} />
            </div>
            <div>
              <label className="field-label" htmlFor="pin">PIN</label>
              <input id="pin" required autoComplete="off" inputMode="numeric" type="password" maxLength={6} className="field-input"
                value={pin} onChange={(e) => setPin(e.target.value)} />
            </div>
            <button type="submit" disabled={loading} className="btn-solid w-full">{loading ? 'Entrando…' : 'Entrar'}</button>
            {error === LOCKOUT_MESSAGE && documentId.trim() && (
              <button type="button" onClick={() => { setError(null); setMode('request') }} className="w-full text-center text-xs font-medium text-primary hover:underline">
                ¿Olvidaste tu PIN o te quedaste bloqueado? Recupéralo con tu teléfono
              </button>
            )}
            <p className="text-center text-xs text-content-muted">
              Tu PIN te lo entrega el negocio donde tienes tu préstamo. Si no lo tienes, contáctalos directamente.
            </p>
          </form>
        )}

        {mode === 'request' && (
          <div className="glass-panel glass-strong space-y-4 p-6">
            {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
            <p className="text-sm text-content">
              Te enviaremos un código de un solo uso al teléfono que el negocio tiene registrado para la cédula <strong>{documentId}</strong>.
            </p>
            <button onClick={requestCode} disabled={unlockLoading} className="btn-solid w-full">{unlockLoading ? 'Enviando…' : 'Enviar código'}</button>
            <button type="button" onClick={() => { setError(null); setMode('login') }} className="w-full text-center text-xs text-content-muted hover:underline">Volver a entrar con mi PIN</button>
          </div>
        )}

        {mode === 'confirm' && (
          <form onSubmit={confirmCode} className="glass-panel glass-strong space-y-4 p-6">
            {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
            {info && <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">{info}</p>}
            <div>
              <label className="field-label" htmlFor="code">Código recibido</label>
              <input id="code" required autoComplete="off" inputMode="numeric" maxLength={6} className="field-input"
                value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div>
              <label className="field-label" htmlFor="new-pin">Elige un PIN nuevo (4 a 6 dígitos)</label>
              <input id="new-pin" required autoComplete="off" inputMode="numeric" type="password" maxLength={6} className="field-input"
                value={newPin} onChange={(e) => setNewPin(e.target.value)} />
            </div>
            <button type="submit" disabled={unlockLoading} className="btn-solid w-full">{unlockLoading ? 'Confirmando…' : 'Confirmar y entrar'}</button>
            <button type="button" onClick={() => { setError(null); setMode('login') }} className="w-full text-center text-xs text-content-muted hover:underline">Cancelar</button>
          </form>
        )}
      </div>
    </div>
  )
}
