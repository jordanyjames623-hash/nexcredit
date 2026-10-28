import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { AssigneePicker } from '@/components/AssigneePicker'
import { BranchPicker } from '@/components/BranchPicker'
import { LocationCapture } from '@/components/LocationCapture'

// Crear cliente en pantalla propia (como crear préstamo): antes el formulario vivía al
// final de la lista de Clientes y había que deslizar hasta abajo para verlo. Trae TODAS
// las opciones viejas: cédula, dirección, asignar a un colaborador, sucursal y GPS.
export function NewClient() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const toast = useToast()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [sector, setSector] = useState('')
  const [documentId, setDocumentId] = useState('')
  const [address, setAddress] = useState('')
  const [assignedTo, setAssignedTo] = useState(session?.user.id ?? '')
  const [branchId, setBranchId] = useState('')
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function createClient(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    setMsg(null)
    const { error } = await supabase.from('clients').insert({
      full_name: name.trim(),
      phone: phone.trim() || null,
      sector: sector.trim() || null,
      document_id: documentId.trim() || null,
      address: address.trim() || null,
      assigned_to: assignedTo || session?.user.id || null,
      branch_id: branchId || null,
      latitude: location?.lat ?? null,
      longitude: location?.lng ?? null,
      location_captured_at: location ? new Date().toISOString() : null
    })
    setSaving(false)
    if (error) { setMsg('No se pudo crear el cliente: ' + error.message); return }
    toast.success('Cliente creado.')
    navigate('/clientes', { replace: true })
  }

  const field = 'w-full rounded-xl bg-[var(--nc-soft)] px-4 py-3 text-sm text-[var(--nc-text)] outline-none placeholder:text-[var(--nc-faint)] focus:ring-2 focus:ring-[#2563EB]'

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[28px] font-bold leading-tight text-[var(--nc-text)]">Nuevo cliente</h1>
        <p className="text-sm text-[var(--nc-muted)]">Completa los datos y guarda el cliente.</p>
      </div>

      {msg && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">{msg}</p>}

      <form onSubmit={createClient} className="space-y-3 rounded-2xl bg-[var(--nc-card)] p-4">
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre completo"
          className={field} />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Teléfono (opcional)" inputMode="tel"
          className={field} />
        <input value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Sector (opcional)"
          className={field} />
        <input value={documentId} onChange={(e) => setDocumentId(e.target.value)} placeholder="Cédula (opcional)"
          className={field} />
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Dirección (opcional)"
          className={field} />
        <AssigneePicker value={assignedTo} onChange={setAssignedTo} label="Asignar cliente a" />
        <BranchPicker value={branchId} onChange={setBranchId} emptyLabel="Sin sucursal" />
        <LocationCapture value={location} onChange={setLocation} />
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar cliente'}</button>
          <button type="button" onClick={() => navigate('/clientes')} className="rounded-xl bg-[var(--nc-soft)] px-4 py-3 text-sm font-medium text-[var(--nc-text)]">Cancelar</button>
        </div>
      </form>
    </div>
  )
}
