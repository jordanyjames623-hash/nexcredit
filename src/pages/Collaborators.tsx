import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { UserPlus, Key, ShieldCheck } from 'lucide-react'
import { supabase, callEdgeFunction } from '@/lib/supabase'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useAuth } from '@/contexts/AuthContext'

type Collaborator = {
  user_id: string; email: string; full_name: string; phone: string | null
  is_active: boolean; permissions: Record<string, boolean>; created_at: string
}
type LastActivity = { user_id: string; created_at: string }

const PERMISSION_KEYS = [
  { key: 'employees.manage', label: 'Gestionar empleados (crear y administrar empleados inferiores)' },
  { key: 'expenses.view', label: 'Ver gastos' },
  { key: 'expenses.create', label: 'Crear gastos' },
  { key: 'expenses.update', label: 'Editar gastos' },
  { key: 'expenses.view_all', label: 'Ver los gastos de todo el negocio (no solo los suyos)' },
  { key: 'routes.view', label: 'Ver rutas (solo las que le asignes como cobrador)' },
  { key: 'routes.view_all', label: 'Ver todas las rutas del negocio' },
  { key: 'routes.manage', label: 'Gestionar cualquier ruta (no solo las suyas)' },
  { key: 'ruteo.open', label: 'Rutear (abrir y cerrar ruteos)' },
  { key: 'ruteo.view_all', label: 'Ver los ruteos de todo el negocio' },
  { key: 'reports.view_all', label: 'Ver reportes de todo el negocio' },
  { key: 'loans.view_all', label: 'Ver los préstamos de todo el negocio (no puede cobrarlos, solo verlos)' },
  { key: 'cash_sessions.view_all', label: 'Ver las cajas de todo el negocio (no solo la suya)' }
] as const

type PresetId = 'gerente' | 'contable' | 'cobrador' | 'personalizado'

const PRESET_LABELS: Record<PresetId, string> = {
  gerente: 'Gerente',
  contable: 'Contable',
  cobrador: 'Cobrador',
  personalizado: 'Personalizado'
}

const PRESET_DESCRIPTIONS: Record<PresetId, string> = {
  gerente: 'Puede hacer casi todo y gestionar empleados, pero no puede crear otro gerente.',
  contable: 'Solo lectura: ve montos, reportes y cuadre, no puede cambiar nada.',
  cobrador: 'Cobra por sus rutas asignadas.',
  personalizado: 'Elige los permisos uno por uno.'
}

const PRESET_PERMISSIONS: Record<PresetId, string[]> = {
  gerente: PERMISSION_KEYS.map((p) => p.key),
  contable: ['expenses.view', 'expenses.view_all', 'routes.view_all', 'cash_sessions.view_all', 'ruteo.view_all', 'reports.view_all', 'loans.view_all'],
  cobrador: ['routes.view', 'ruteo.open', 'expenses.view'],
    personalizado: [],
}

function timeAgo(iso: string | undefined) {
  if (!iso) return 'Sin actividad registrada'
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 60) return `Activo hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Activo hace ${hours} h`
  const days = Math.floor(hours / 24)
  return `Activo hace ${days} d`
}

export function Collaborators() {
  const { isOwner, hasPermission, session, profile } = useAuth()
  const canManageEmployees = isOwner || hasPermission('employees.manage')
  const ownerId = session?.user.id ?? ''
  const ownerName = profile?.full_name || 'Propietario'
  const qc = useQueryClient()
  const isOnline = useOnlineStatus()
  const [showForm, setShowForm] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['collaborators'],
    enabled: canManageEmployees,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_collaborators')
      if (error) throw error
      return data as Collaborator[]
    }
  })

  const { data: grants } = useQuery({
    queryKey: ['visibility-grants'],
    enabled: canManageEmployees,
    queryFn: async () => {
      const { data, error } = await supabase.from('visibility_grants').select('viewer_id, target_id')
      if (error) throw error
      return data as { viewer_id: string; target_id: string }[]
    }
  })

  const { data: activity } = useQuery({
    queryKey: ['collaborators-activity', (data ?? []).map((c) => c.user_id).join(',')],
    enabled: canManageEmployees && (data?.length ?? 0) > 0,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('activity_logs')
        .select('user_id, created_at')
        .in('user_id', (data ?? []).map((c) => c.user_id))
        .order('created_at', { ascending: false })
      if (error) throw error
      const map = new Map<string, string>()
      ;(rows as LastActivity[]).forEach((r) => { if (!map.has(r.user_id)) map.set(r.user_id, r.created_at) })
      return map
    }
  })

  if (!canManageEmployees) {
    return <p className="text-sm text-content-muted">Solo el propietario o un gerente puede gestionar colaboradores.</p>
  }

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['collaborators'] })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="t-h1 text-content">Colaboradores</h1>
          <p className="text-sm text-content-muted">Gestiona tu equipo de trabajo. Hasta 5 activos a la vez.</p>
        </div>
        <button className="btn-solid" disabled={!isOnline} onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancelar' : <><UserPlus size={16} className="mr-1.5" /> Nuevo colaborador</>}
        </button>
      </div>

      {showForm && (
        <NewCollaboratorForm onDone={() => { setShowForm(false); invalidate() }} />
      )}

      {isLoading && <p className="text-sm text-content-muted">Cargando…</p>}
      {error && <p className="text-sm text-danger">No se pudo cargar la lista de colaboradores.</p>}
      {data?.length === 0 && !isLoading && (
        <div className="glass-card px-5 py-10 text-center text-sm text-content-muted">Aún no has creado colaboradores.</div>
      )}

      <div className="space-y-4">
        {data?.map((c) => (
          <CollaboratorCard
            key={c.user_id}
            collaborator={c}
            lastActivity={activity?.get(c.user_id)}
            isOnline={isOnline}
            onChanged={invalidate}
            otherPeople={[
              { id: ownerId, name: `${ownerName} (Propietario)` },
              ...(data ?? []).filter((x) => x.user_id !== c.user_id).map((x) => ({ id: x.user_id, name: x.full_name || x.email }))
            ]}
            grantedTargets={(grants ?? []).filter((g) => g.viewer_id === c.user_id).map((g) => g.target_id)}
          />
        ))}
      </div>
    </div>
  )
}

function NewCollaboratorForm({ onDone }: { onDone: () => void }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const { isOwner, hasPermission } = useAuth()
  const [preset, setPreset] = useState<PresetId>('personalizado')
  const isManager = !isOwner

  function applyPreset(id: PresetId) {
    setPreset(id)
    if (id === 'personalizado') return
    // Un gerente solo puede conceder los permisos que él mismo tiene.
    const next: Record<string, boolean> = {}
    PRESET_PERMISSIONS[id].forEach((k) => {
      if (isOwner || hasPermission(k)) next[k] = true
    })
    setPermissions(next)
  }

  function handlePermissionsChange(next: Record<string, boolean>) {
    setPreset('personalizado')
    setPermissions(next)
  }

  const mutation = useMutation({
    mutationFn: async () => {
      await callEdgeFunction('collaborators-admin', {
        action: 'create', password: ownerPassword, email: email.trim(),
        new_password: newPassword, full_name: fullName.trim(), permissions
      })
    },
    onSuccess: onDone,
    onError: (e: any) => setError(e.message ?? 'No se pudo crear el colaborador.')
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!fullName.trim() || !email.trim()) { setError('Nombre y correo son obligatorios.'); return }
    if (newPassword.length < 8) { setError('La contraseña del colaborador debe tener al menos 8 caracteres.'); return }
    if (!ownerPassword) { setError('Escribe tu contraseña actual para confirmar.'); return }
    mutation.mutate()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 glass-card border-primary/40 p-5">
      {error && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      <div className="grid grid-cols-2 gap-4">
        <div className="min-w-0">
          <label className="field-label" htmlFor="fullName">Nombre completo</label>
          <input id="fullName" required className="field-input w-full min-w-0" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="min-w-0">
          <label className="field-label" htmlFor="email">Correo</label>
          <input id="email" required type="email" className="field-input w-full min-w-0" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="min-w-0">
          <label className="field-label" htmlFor="newPassword">Contraseña para el colaborador</label>
          <input id="newPassword" required type="password" minLength={8} className="field-input w-full min-w-0" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div className="min-w-0">
          <label className="field-label" htmlFor="ownerPassword">Tu contraseña actual (para confirmar)</label>
          <input id="ownerPassword" required type="password" className="field-input w-full min-w-0" value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} />
        </div>
      </div>
      <div>
        <p className="field-label">Preset de permisos</p>
        <div className="flex flex-wrap gap-2">
          {(['gerente', 'contable', 'cobrador', 'personalizado'] as PresetId[])
            .filter((id) => id !== 'gerente' || !isManager)
            .map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => applyPreset(id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${preset === id ? 'bg-primary text-white' : 'border border-line text-content-muted hover:bg-background'}`}
              >
                {PRESET_LABELS[id]}
              </button>
            ))}
        </div>
        <p className="mt-2 text-xs text-content-muted">{PRESET_DESCRIPTIONS[preset]}</p>
      </div>
      <PermissionPanel
        permissions={permissions}
        onChange={handlePermissionsChange}
        hiddenKeys={isManager ? ['employees.manage'] : []}
        isKeyDisabled={(key) => isManager && !hasPermission(key)}
      />
      <button type="submit" disabled={mutation.isPending} className="btn-solid">
        {mutation.isPending ? 'Creando…' : 'Crear colaborador'}
      </button>
    </form>
  )
}

function PermissionPanel({ permissions, onChange, hiddenKeys = [], isKeyDisabled }: {
  permissions: Record<string, boolean>
  onChange: (p: Record<string, boolean>) => void
  hiddenKeys?: string[]
  isKeyDisabled?: (key: string) => boolean
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <ShieldCheck size={14} className="text-content-muted" />
        <p className="field-label mb-0">Permisos</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {PERMISSION_KEYS.filter((p) => !hiddenKeys.includes(p.key)).map((p) => {
          const active = Boolean(permissions[p.key])
          const disabled = isKeyDisabled?.(p.key) ?? false
          return (
            <button
              key={p.key}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...permissions, [p.key]: !active })}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'bg-primary text-white' : 'border border-line text-content-muted hover:bg-background'} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              {p.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function CollaboratorCard({ collaborator, lastActivity, isOnline, onChanged, otherPeople, grantedTargets }: {
  collaborator: Collaborator; lastActivity: string | undefined; isOnline: boolean; onChanged: () => void
  otherPeople: { id: string; name: string }[]; grantedTargets: string[]
}) {
  const [permissions, setPermissions] = useState(collaborator.permissions ?? {})
  const [showReset, setShowReset] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = JSON.stringify(permissions) !== JSON.stringify(collaborator.permissions ?? {})

  const savePermissions = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('update_collaborator_permissions', { p_user_id: collaborator.user_id, p_permissions: permissions })
      if (error) throw error
    },
    onSuccess: onChanged,
    onError: (e: any) => setError(e.message ?? 'No se pudieron guardar los permisos.')
  })

  const toggleActive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('set_collaborator_active', { p_user_id: collaborator.user_id, p_active: !collaborator.is_active })
      if (error) throw error
    },
    onSuccess: onChanged,
    onError: (e: any) => window.alert(e.message ?? 'No se pudo cambiar el estado.')
  })

  const toggleGrant = useMutation({
    mutationFn: async ({ targetId, grant }: { targetId: string; grant: boolean }) => {
      if (grant) {
        const { error } = await supabase.from('visibility_grants').insert({ viewer_id: collaborator.user_id, target_id: targetId })
        if (error) throw error
      } else {
        const { error } = await supabase.from('visibility_grants').delete().eq('viewer_id', collaborator.user_id).eq('target_id', targetId)
        if (error) throw error
      }
    },
    onSuccess: onChanged,
    onError: (e: any) => window.alert(e.message ?? 'No se pudo actualizar el acceso.')
  })

  return (
    <div className="glass-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-semibold text-on-navy">
            {(collaborator.full_name || collaborator.email).charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-content">{collaborator.full_name || 'Sin nombre'}</p>
              <span className={collaborator.is_active ? 'badge-success' : 'badge-neutral'}>{collaborator.is_active ? 'Activo' : 'Inactivo'}</span>
            </div>
            <p className="text-xs text-content-muted">{collaborator.email}{collaborator.phone ? ` · ${collaborator.phone}` : ''}</p>
            <p className="text-xs text-content-muted">{timeAgo(lastActivity)}</p>
            <Link to={`/colaboradores/${collaborator.user_id}`} className="text-xs text-primary hover:underline">Ver ficha completa →</Link>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button disabled={!isOnline || toggleActive.isPending} onClick={() => toggleActive.mutate()} className="text-xs text-content-muted hover:text-danger">
            {collaborator.is_active ? 'Desactivar' : 'Activar'}
          </button>
          <button disabled={!isOnline} onClick={() => setShowReset((v) => !v)} className="flex items-center gap-1 text-xs text-primary hover:underline">
            <Key size={12} /> {showReset ? 'Cancelar' : 'Contraseña'}
          </button>
        </div>
      </div>

      {showReset && <ResetPasswordForm userId={collaborator.user_id} onDone={() => setShowReset(false)} />}
      {error && <p className="mt-3 rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      <div className="mt-4 border-t border-line pt-4">
        <PermissionPanel permissions={permissions} onChange={setPermissions} />
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <p className="field-label">También puede ver los préstamos y gastos creados por</p>
        <p className="mb-2 text-xs text-content-muted">
          Por defecto, {collaborator.full_name || 'este colaborador'} solo ve lo que él mismo crea. Marca a quién más puede ver.
        </p>
        <div className="flex flex-wrap gap-2">
          {otherPeople.map((p) => {
            const granted = grantedTargets.includes(p.id)
            return (
              <button
                key={p.id}
                type="button"
                disabled={!isOnline || toggleGrant.isPending}
                onClick={() => toggleGrant.mutate({ targetId: p.id, grant: !granted })}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${granted ? 'bg-primary-fill text-white' : 'border border-line text-content-muted hover:bg-background'}`}
              >
                {p.name}
              </button>
            )
          })}
        </div>
      </div>

      {dirty && (
        <button disabled={!isOnline || savePermissions.isPending} onClick={() => savePermissions.mutate()} className="btn-secondary mt-3">
          {savePermissions.isPending ? 'Guardando…' : 'Guardar permisos'}
        </button>
      )}
    </div>
  )
}

function ResetPasswordForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [newPassword, setNewPassword] = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      await callEdgeFunction('collaborators-admin', { action: 'reset_password', password: ownerPassword, user_id: userId, new_password: newPassword })
    },
    onSuccess: onDone,
    onError: (e: any) => setError(e.message ?? 'No se pudo cambiar la contraseña.')
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (newPassword.length < 8) { setError('Debe tener al menos 8 caracteres.'); return }
    if (!ownerPassword) { setError('Escribe tu contraseña actual para confirmar.'); return }
    mutation.mutate()
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3 rounded-lg border border-line bg-background p-4">
      {error && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <label className="field-label" htmlFor={`np-${userId}`}>Nueva contraseña</label>
          <input id={`np-${userId}`} required type="password" minLength={8} className="field-input w-full min-w-0" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div className="min-w-0">
          <label className="field-label" htmlFor={`op-${userId}`}>Tu contraseña actual</label>
          <input id={`op-${userId}`} required type="password" className="field-input w-full min-w-0" value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} />
        </div>
      </div>
      <button type="submit" disabled={mutation.isPending} className="btn-secondary">
        {mutation.isPending ? 'Cambiando…' : 'Cambiar contraseña'}
      </button>
    </form>
  )
}
