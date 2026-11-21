import { useState, type FormEvent, type ChangeEvent } from 'react'
import { supabase, callEdgeFunction } from '@/lib/supabase'
import { useAuth, type Business } from '@/contexts/AuthContext'
import { CommissionSettingsPanel, RiskSettingsPanel } from '@/components/CommissionSettingsPanel'
import { LoanProductsPanel } from '@/components/LoanProductsPanel'
import { CommunicationTemplatesPanel } from '@/components/CommunicationTemplatesPanel'
import { BackupsPanel } from '@/components/BackupsPanel'
import { AccordionSection } from '@/components/AccordionSection'
import { BranchesPanel } from '@/components/BranchesPanel'
import { ApiKeysPanel } from '@/components/ApiKeysPanel'
import { NextexConnectionPanel } from '@/components/NextexConnectionPanel'
import { MfaSettings } from '@/components/MfaSettings'
import { ProPitchContent, BusinessPitchContent } from '@/components/UpgradeToProModal'
import { applyTheme, getTheme, type NcTheme } from '@/nuevo/theme'

const PLAN_LABEL = { basic: 'Básico', pro: 'Pro', business: 'Business' } as const

export function Settings() {
  const { business, isOwner, session, refreshBusiness } = useAuth()
  const [openSection, setOpenSection] = useState<string | null>(null)
  // El tema vive en nc_theme (el mismo del botón sol/luna junto a la campana); ya no se
  // guarda en profiles.theme, que era lo que hacía que el tema "se cambiara solo".
  const [ncTheme, setNcTheme] = useState<NcTheme>(() => getTheme())
  const plan = business?.subscription_plan ?? 'basic'
  const isPaid = plan !== 'basic'

  return (
    <div className="max-w-2xl space-y-3">
      <h1 className="mb-5 t-h1 text-content">Configuración</h1>

      {isOwner && business && (
        <AccordionSection id="negocio" title="Mi negocio" openId={openSection} setOpenId={setOpenSection}>
          <BusinessForm business={business} onSaved={refreshBusiness} />
        </AccordionSection>
      )}

      {isOwner && business && (
        <AccordionSection id="nextex" title="Conexión nextex" openId={openSection} setOpenId={setOpenSection}>
          <NextexConnectionPanel />
        </AccordionSection>
      )}

      {isOwner && business && (
        <AccordionSection id="suscripcion" title="Suscripción" openId={openSection} setOpenId={setOpenSection}>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-content">Tu plan actual</p>
            <span className={plan === 'basic' ? 'badge-neutral' : 'badge-info'}>{PLAN_LABEL[plan]}</span>
          </div>
          {plan === 'basic' && <ProPitchContent compact />}
          {plan === 'pro' && (
            <>
              <p className="mb-4 text-sm text-content-muted">Tienes acceso a todas las funciones de Pro. Si quieres análisis más profundos de tu cartera, existe el plan Business:</p>
              <BusinessPitchContent compact />
            </>
          )}
          {plan === 'business' && (
            <p className="text-sm text-content-muted">Tienes el plan Business: acceso completo a todas las funciones de NEXCREDIT. Gracias.</p>
          )}
        </AccordionSection>
      )}

      {isOwner && plan === 'business' && (
        <AccordionSection id="sucursales" title="Sucursales" openId={openSection} setOpenId={setOpenSection}>
          <BranchesPanel />
        </AccordionSection>
      )}

      {isOwner && plan === 'business' && (
        <AccordionSection id="integraciones" title="Integraciones (API)" openId={openSection} setOpenId={setOpenSection}>
          <ApiKeysPanel />
        </AccordionSection>
      )}

      {isOwner && isPaid && (
        <AccordionSection id="comisiones" title="Comisiones y puntos" openId={openSection} setOpenId={setOpenSection}>
          <CommissionSettingsPanel />
        </AccordionSection>
      )}

      {isOwner && isPaid && (
        <AccordionSection id="riesgo" title="Riesgo" openId={openSection} setOpenId={setOpenSection}>
          <RiskSettingsPanel />
        </AccordionSection>
      )}

      {isOwner && isPaid && (
        <AccordionSection id="productos" title="Productos de préstamo" openId={openSection} setOpenId={setOpenSection}>
          <LoanProductsPanel />
        </AccordionSection>
      )}

      {isOwner && isPaid && (
        <AccordionSection id="comunicaciones" title="Comunicaciones" openId={openSection} setOpenId={setOpenSection}>
          <CommunicationTemplatesPanel />
        </AccordionSection>
      )}

      <AccordionSection id="apariencia" title="Apariencia" openId={openSection} setOpenId={setOpenSection}>
        <div className="flex gap-2">
          {(['light', 'dark'] as const).map((t) => (
            <button key={t} onClick={() => { applyTheme(t); setNcTheme(t) }}
              className={`flex-1 rounded px-3 py-2 text-sm font-medium ${ncTheme === t ? 'bg-primary-fill text-white' : 'border border-line text-content-muted'}`}>
              {t === 'light' ? 'Claro' : 'Oscuro'}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-content-muted">El mismo ajuste del botón junto a la campana. Ya no hay modo automático: el tema solo cambia cuando tú lo tocas.</p>
      </AccordionSection>

      <AccordionSection id="cuenta" title="Cuenta" openId={openSection} setOpenId={setOpenSection}>
        <div className="space-y-4">
          <p className="text-sm text-content-muted">{session?.user.email}</p>
          <ChangeOwnPassword />
          {isOwner && (
            <div className="border-t border-line pt-4">
              <MfaSettings />
            </div>
          )}
        </div>
      </AccordionSection>

      {isOwner && (
        <AccordionSection id="backups" title="Backups" openId={openSection} setOpenId={setOpenSection}>
          <BackupsPanel />
        </AccordionSection>
      )}

      {isOwner && (
        <AccordionSection id="datos" title="Datos" tone="danger" openId={openSection} setOpenId={setOpenSection}>
          <div className="space-y-4">
            <ExportBackupButton />
            <div className="border-t border-line pt-4">
              <p className="mb-1 text-sm font-medium text-danger">Eliminar todos los datos</p>
              <p className="mb-3 text-xs text-content-muted">
                Borra clientes, préstamos, pagos, gastos, rutas e historial de este negocio. No se puede deshacer.
                Tu cuenta y tus colaboradores seguirán existiendo.
              </p>
              <WipeDataFlow />
            </div>
          </div>
        </AccordionSection>
      )}
    </div>
  )
}

function BusinessForm({ business, onSaved }: { business: Business; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState(business)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setSaving(true); setSaved(false)
    const { error } = await supabase.from('businesses').update({
      name: form.name, owner_name: form.owner_name, phone: form.phone, whatsapp: form.whatsapp,
      address: form.address, email: form.email, rnc: form.rnc, currency: form.currency, receipt_footer: form.receipt_footer
    }).eq('id', form.id)
    setSaving(false)
    if (!error) { setSaved(true); await onSaved() }
  }

  return (
    <div className="space-y-3">
      <LogoUpload business={form} onUploaded={(url) => { setForm({ ...form, logo_url: url }); onSaved() }} />
      <Field label="Nombre del negocio" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
      <Field label="Propietario" value={form.owner_name ?? ''} onChange={(v) => setForm({ ...form, owner_name: v })} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Teléfono" value={form.phone ?? ''} onChange={(v) => setForm({ ...form, phone: v })} />
        <Field label="WhatsApp" value={form.whatsapp ?? ''} onChange={(v) => setForm({ ...form, whatsapp: v })} />
      </div>
      <Field label="Dirección" value={form.address ?? ''} onChange={(v) => setForm({ ...form, address: v })} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Correo" value={form.email ?? ''} onChange={(v) => setForm({ ...form, email: v })} />
        <Field label="RNC" value={form.rnc ?? ''} onChange={(v) => setForm({ ...form, rnc: v })} />
      </div>
      <Field label="Moneda (código de 3 letras)" value={form.currency} onChange={(v) => setForm({ ...form, currency: v.toUpperCase().slice(0, 3) })} />
      <div>
        <label className="field-label">Pie de página del comprobante</label>
        <textarea aria-label="Pie de página del comprobante" className="field-input" rows={2} value={form.receipt_footer ?? ''} onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })} />
      </div>
      <button onClick={save} disabled={saving} className="btn-secondary">{saving ? 'Guardando…' : 'Guardar'}</button>
      {saved && <span className="ml-3 text-sm text-success-text">Guardado</span>}
    </div>
  )
}

function LogoUpload({ business, onUploaded }: { business: Business; onUploaded: (url: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setError('La imagen no puede pesar más de 2 MB.'); return }
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (!['png', 'jpg', 'jpeg', 'webp'].includes(ext)) { setError('Solo se permiten imágenes PNG, JPG o WEBP.'); return }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('Solo se permiten imágenes PNG, JPG o WEBP.'); return }
    setError(null); setBusy(true)
    const path = `${business.id}/logo.${ext}`

    const { error: uploadError } = await supabase.storage.from('logos').upload(path, file, { upsert: true })
    if (uploadError) { setBusy(false); setError(uploadError.message); return }

    const { data: publicUrlData } = supabase.storage.from('logos').getPublicUrl(path)
    // Se agrega un parámetro de versión para que el navegador no muestre el logo viejo desde caché.
    const url = `${publicUrlData.publicUrl}?v=${Date.now()}`

    const { error: dbError } = await supabase.from('businesses').update({ logo_url: url }).eq('id', business.id)
    setBusy(false)
    if (dbError) { setError(dbError.message); return }
    onUploaded(url)
  }

  return (
    <div className="flex items-center gap-4 pb-2">
      {business.logo_url ? (
        <img src={business.logo_url} alt="Logo del negocio" className="h-14 w-14 rounded object-cover" />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded bg-navy text-lg font-bold text-on-navy">
          {business.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div>
        <label className="btn-solid inline-block cursor-pointer !px-3 !py-2 text-xs">
          {busy ? 'Subiendo…' : 'Cambiar logo'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFile} disabled={busy} />
        </label>
        <p className="mt-1 text-xs text-content-muted">PNG, JPG o WEBP. Máximo 2 MB.</p>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input aria-label={label} className="field-input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function ChangeOwnPassword() {
  const { session } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (next.length < 8) { setError('La contraseña nueva debe tener al menos 8 caracteres.'); return }
    if (!session?.user.email) { setError('No se pudo identificar tu correo.'); return }
    setBusy(true)
    const { error: reauthError } = await supabase.auth.signInWithPassword({ email: session.user.email, password: current })
    if (reauthError) { setBusy(false); setError('Tu contraseña actual no es correcta.'); return }
    const { error: updateError } = await supabase.auth.updateUser({ password: next })
    if (updateError) { setBusy(false); setError(updateError.message); return }
    // SEC-021: al cambiar la contraseña, las demás sesiones se cierran; la actual sigue abierta.
    const { error: othersError } = await supabase.auth.signOut({ scope: 'others' })
    setBusy(false)
    if (othersError) { setError('Contraseña actualizada, pero no se pudieron cerrar las otras sesiones. Vuelve a intentarlo.'); return }
    setCurrent(''); setNext(''); setDone(true)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="field-label mb-0">Cambiar contraseña</p>
      {error && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      {done && <p className="text-sm text-success-text">Contraseña actualizada y las demás sesiones se cerraron.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <input aria-label="Contraseña actual" type="password" required placeholder="Contraseña actual" autoComplete="current-password"
          className="field-input" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <input aria-label="Contraseña nueva" type="password" required minLength={8} placeholder="Contraseña nueva" autoComplete="new-password"
          className="field-input" value={next} onChange={(e) => setNext(e.target.value)} />
      </div>
      <button type="submit" disabled={busy} className="btn-secondary">{busy ? 'Guardando…' : 'Cambiar contraseña'}</button>
    </form>
  )
}

function ExportBackupButton() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function download() {
    setBusy(true); setError(null)
    const { data, error } = await supabase.rpc('export_business_backup')
    setBusy(false)
    if (error) { setError(error.message); return }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `capitalia-respaldo-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <button onClick={download} disabled={busy} className="btn-secondary">{busy ? 'Exportando…' : 'Exportar copia de seguridad'}</button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  )
}

function WipeDataFlow() {
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [password, setPassword] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function confirm() {
    setError(null)
    if (confirmText !== 'ELIMINAR') { setError('Debes escribir ELIMINAR exactamente.'); return }
    setBusy(true)
    try {
      await callEdgeFunction('critical-actions', { action: 'delete_all_data', password, confirmation_text: confirmText })
      setDone(true)
      setTimeout(() => window.location.assign('/'), 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la eliminación.')
    } finally {
      setBusy(false)
    }
  }

  if (done) return <p className="text-sm text-content">Datos eliminados. Redirigiendo…</p>

  if (step === 0) {
    return <button onClick={() => setStep(1)} className="rounded bg-danger px-4 py-2.5 text-sm font-medium text-on-navy hover:bg-danger/90">Eliminar todos los datos</button>
  }

  return (
    <div className="space-y-3 rounded border border-danger/30 bg-danger/5 p-4">
      {error && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      {step === 1 && (
        <>
          <label className="field-label" htmlFor="wipe-password">Tu contraseña actual</label>
          <input id="wipe-password" type="password" className="field-input" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={() => setStep(0)} className="text-sm text-content-muted">Cancelar</button>
            <button onClick={() => setStep(2)} disabled={!password} className="btn-secondary ml-auto !bg-danger">Continuar</button>
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <p className="text-sm text-content">Escribe <strong>ELIMINAR</strong> para confirmar.</p>
          <input aria-label="ELIMINAR" className="field-input" placeholder="ELIMINAR" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="text-sm text-content-muted">Atrás</button>
            <button onClick={confirm} disabled={busy} className="ml-auto rounded bg-danger px-4 py-2.5 text-sm font-medium text-on-navy hover:bg-danger/90 disabled:opacity-50">
              {busy ? 'Eliminando…' : 'Eliminar definitivamente'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
