import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { ShieldAlert, KeyRound, ChevronDown, Settings2 } from 'lucide-react'
import { supabase, callEdgeFunction } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/ui/Modal'

type Plan = 'basic' | 'pro' | 'business'
const PLANS: Plan[] = ['basic', 'pro', 'business']
const PLAN_LABEL: Record<Plan, string> = { basic: 'Básico', pro: 'Pro', business: 'Business' }
const PLAN_BADGE: Record<Plan, string> = { basic: 'badge-neutral', pro: 'badge-info', business: 'badge-success' }

// Mismas claves que usa el frontend en RequirePaid/App.tsx — si agregas una función nueva protegida
// por plan, agrégala aquí también para que se pueda configurar desde este panel.
const FEATURE_LABEL: Record<string, string> = {
  comisiones: 'Comisiones', renovaciones: 'Renovaciones', cobranza: 'Cobranza', rutas: 'Rutas',
  gastos: 'Gastos', calendario: 'Calendario de cobros', colaboradores: 'Colaboradores',
  inteligencia: 'Inteligencia (IA)', garantias: 'Garantías', solicitudes: 'Solicitudes',
  actividad: 'Registro de actividad', reportes_completos: 'Reportes completos (todas las pestañas + PDF)',
  dashboard_personalizado: 'Personalizar el Dashboard', sucursales: 'Sucursales', api_publica: 'API pública'
}
const FEATURE_KEYS = Object.keys(FEATURE_LABEL)

type BusinessRow = {
  id: string; name: string; owner_name: string | null; subscription_plan: Plan
  created_at: string; clients_count: number; loans_count: number
}
type PlanFeatureRow = { plan: Plan; feature_key: string; enabled: boolean }
type OverrideRow = { feature_key: string; enabled: boolean }
type PlanLimitRow = {
  plan: Plan; price_label: string
  max_clients: number | null; max_loans: number | null; max_collaborators: number | null
  one_loan_per_client: boolean
  // Créditos activos máximos por cliente (null = ilimitado). Reemplaza al interruptor
  // one_loan_per_client como regla editable: la migración 20261025 la agrega a la tabla
  // y el trigger de préstamos la hace cumplir; el interruptor viejo queda sin uso.
  max_loans_per_client: number | null
}

// Fila editable de precio y límites para un plan — null en un campo de cantidad significa "ilimitado".
function PlanLimitEditor({ row, onSave, saving }: { row: PlanLimitRow; onSave: (v: PlanLimitRow) => void; saving: boolean }) {
  const [draft, setDraft] = useState(row)
  const toNum = (v: string) => (v.trim() === '' ? null : Math.max(0, Number(v)))
  return (
    <div className="grid items-end gap-3 border-b border-line/60 py-3 last:border-0 sm:grid-cols-6">
      <div className="sm:col-span-1">
        <p className="text-sm font-semibold text-content">{PLAN_LABEL[row.plan]}</p>
      </div>
      <div>
        <label className="field-label text-xs">Precio</label>
        <input className="field-input !py-1.5 text-sm" value={draft.price_label}
          onChange={(e) => setDraft({ ...draft, price_label: e.target.value })} />
      </div>
      <div>
        <label className="field-label text-xs">Clientes (vacío = ilimitado)</label>
        <input type="number" min="0" className="field-input !py-1.5 text-sm" value={draft.max_clients ?? ''}
          onChange={(e) => setDraft({ ...draft, max_clients: toNum(e.target.value) })} />
      </div>
      <div>
        <label className="field-label text-xs">Préstamos (vacío = ilimitado)</label>
        <input type="number" min="0" className="field-input !py-1.5 text-sm" value={draft.max_loans ?? ''}
          onChange={(e) => setDraft({ ...draft, max_loans: toNum(e.target.value) })} />
      </div>
      <div>
        <label className="field-label text-xs">Colaboradores (vacío = ilimitado)</label>
        <input type="number" min="0" className="field-input !py-1.5 text-sm" value={draft.max_collaborators ?? ''}
          onChange={(e) => setDraft({ ...draft, max_collaborators: toNum(e.target.value) })} />
      </div>
      <div>
        <label className="field-label text-xs">Créditos por cliente (vacío = ilimitado)</label>
        <input type="number" min="0" className="field-input !py-1.5 text-sm" value={draft.max_loans_per_client ?? ''}
          onChange={(e) => setDraft({ ...draft, max_loans_per_client: toNum(e.target.value) })} />
      </div>
      <div className="flex items-center gap-2 sm:col-span-6">
        <button onClick={() => onSave(draft)} disabled={saving} className="btn-secondary ml-auto !px-3 !py-1.5 text-xs">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

function PlanLimitsPanel() {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const { data } = useQuery({
    queryKey: ['plan_limits'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_plan_limits')
      if (error) throw error
      return data as PlanLimitRow[]
    }
  })
  const save = useMutation({
    mutationFn: async (v: PlanLimitRow) => {
      const { error } = await supabase.rpc('set_plan_limit', {
        p_plan: v.plan, p_price_label: v.price_label, p_max_clients: v.max_clients, p_max_loans: v.max_loans,
        p_max_collaborators: v.max_collaborators, p_one_loan_per_client: v.one_loan_per_client,
        p_max_loans_per_client: v.max_loans_per_client
      })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan_limits'] }); qc.invalidateQueries({ queryKey: ['plan_limits_public'] }) },
    onError: (e: any) => setError(e.message ?? 'No se pudo guardar.')
  })

  return (
    <div className="glass-card p-5">
      <h2 className="mb-1 text-sm font-semibold text-content">Precios y límites por plan</h2>
      <p className="mb-3 text-xs text-content-muted">Lo que cobras y lo que permite cada plan. Se refleja de inmediato en toda la app, incluido el comparativo que ven tus clientes.</p>
      {error && <p className="mb-3 rounded bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      {data?.map((row) => (
        <PlanLimitEditor key={row.plan} row={row} saving={save.isPending} onSave={(v) => { setError(null); save.mutate(v) }} />
      ))}
    </div>
  )
}

function ResetPasswordModal({ business, onClose }: { business: BusinessRow; onClose: () => void }) {
  const [myPassword, setMyPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit() {
    setError(null)
    if (newPassword.length < 8) { setError('La contraseña nueva debe tener al menos 8 caracteres.'); return }
    setBusy(true)
    try {
      await callEdgeFunction('platform-admin', {
        action: 'reset_owner_password', password: myPassword, business_id: business.id, new_password: newPassword
      })
      setDone(true)
    } catch (err: any) {
      setError(err.message ?? 'No se pudo cambiar la contraseña.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Restablecer contraseña — ${business.name}`} subtitle={`Propietario: ${business.owner_name ?? '—'}`} onClose={onClose} size="sm">
      {done ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-content">
            Listo. La contraseña de <strong>{business.owner_name ?? business.name}</strong> quedó cambiada,
            y cualquier sesión que tuviera abierta se cerró — va a tener que entrar de nuevo con la contraseña nueva.
          </p>
          <button onClick={onClose} className="btn-solid w-full">Cerrar</button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-content-muted">
            Esto cambia directamente la contraseña del propietario de este negocio, sin pasar por correo de recuperación.
            Úsalo solo cuando te lo pidan de verdad a ti — queda registrado como una acción del administrador de la plataforma.
          </p>
          {error && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
          <div>
            <label className="field-label" htmlFor="my-pw">Tu contraseña (para confirmar que eres tú)</label>
            <input id="my-pw" type="password" autoComplete="current-password" className="field-input"
              value={myPassword} onChange={(e) => setMyPassword(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="new-pw">Contraseña nueva para el propietario</label>
            <input id="new-pw" type="password" autoComplete="new-password" minLength={8} className="field-input"
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <button onClick={handleSubmit} disabled={busy || !myPassword || !newPassword} className="btn-solid w-full">
            {busy ? 'Cambiando…' : 'Cambiar contraseña'}
          </button>
        </div>
      )}
    </Modal>
  )
}

// Tabla de qué incluye cada plan por defecto. Cambiar algo aquí afecta a TODOS los negocios de ese
// plan que no tengan una anulación propia.
function PlanFeaturesGrid() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['plan_features'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_plan_features')
      if (error) throw error
      return data as PlanFeatureRow[]
    }
  })
  const toggle = useMutation({
    mutationFn: async ({ plan, feature_key, enabled }: PlanFeatureRow) => {
      const { error } = await supabase.rpc('set_plan_feature', { p_plan: plan, p_feature_key: feature_key, p_enabled: enabled })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan_features'] })
  })
  const valueOf = (plan: Plan, key: string) => data?.find((r) => r.plan === plan && r.feature_key === key)?.enabled ?? false

  return (
    <div className="glass-card overflow-x-auto p-5">
      <h2 className="mb-1 text-sm font-semibold text-content">Funciones por plan</h2>
      <p className="mb-4 text-xs text-content-muted">Qué incluye cada plan por defecto. Un negocio puntual se puede anular aparte, abajo.</p>
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-content-muted">
            <th className="py-2 pr-3 font-medium">Función</th>
            {PLANS.map((p) => <th key={p} className="px-2 py-2 text-center font-medium">{PLAN_LABEL[p]}</th>)}
          </tr>
        </thead>
        <tbody>
          {FEATURE_KEYS.map((key) => (
            <tr key={key} className="border-b border-line/60 last:border-0">
              <td className="py-2 pr-3 text-content">{FEATURE_LABEL[key]}</td>
              {PLANS.map((plan) => (
                <td key={plan} className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={valueOf(plan, key)}
                    disabled={toggle.isPending}
                    onChange={(e) => toggle.mutate({ plan, feature_key: key, enabled: e.target.checked })}
                    aria-label={`${FEATURE_LABEL[key]} en plan ${PLAN_LABEL[plan]}`}
                    className="h-4 w-4 accent-primary"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Anulaciones de un negocio puntual: "Según su plan" (sin fila en la tabla), o forzado sí/no sin
// importar lo que diga el plan.
function BusinessOverridesPanel({ business }: { business: BusinessRow }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['business_feature_overrides', business.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_business_feature_overrides', { p_business_id: business.id })
      if (error) throw error
      return data as OverrideRow[]
    }
  })
  const setOverride = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: 'default' | 'true' | 'false' }) => {
      if (value === 'default') {
        const { error } = await supabase.rpc('clear_business_feature_override', { p_business_id: business.id, p_feature_key: key })
        if (error) throw error
      } else {
        const { error } = await supabase.rpc('set_business_feature_override', { p_business_id: business.id, p_feature_key: key, p_enabled: value === 'true' })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['business_feature_overrides', business.id] })
  })
  const valueOf = (key: string): 'default' | 'true' | 'false' => {
    const row = data?.find((r) => r.feature_key === key)
    if (!row) return 'default'
    return row.enabled ? 'true' : 'false'
  }

  return (
    <div className="space-y-1.5 bg-surface-subtle px-5 py-4">
      <p className="mb-2 text-xs text-content-muted">
        Anulaciones solo para <strong>{business.name}</strong> — sin importar su plan ({PLAN_LABEL[business.subscription_plan]}).
      </p>
      {FEATURE_KEYS.map((key) => (
        <div key={key} className="flex items-center justify-between gap-3 py-1">
          <span className="text-xs text-content">{FEATURE_LABEL[key]}</span>
          <select
            value={valueOf(key)}
            disabled={setOverride.isPending}
            onChange={(e) => setOverride.mutate({ key, value: e.target.value as 'default' | 'true' | 'false' })}
            className="field-input !w-auto !py-1 text-xs"
            aria-label={`Anulación de ${FEATURE_LABEL[key]} para ${business.name}`}
          >
            <option value="default">Según su plan</option>
            <option value="true">Forzado: sí</option>
            <option value="false">Forzado: no</option>
          </select>
        </div>
      ))}
    </div>
  )
}

export function SuperAdmin() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [resetTarget, setResetTarget] = useState<BusinessRow | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['all_businesses'],
    enabled: Boolean(profile?.is_platform_admin),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_all_businesses')
      if (error) throw error
      return data as BusinessRow[]
    }
  })

  const changePlan = useMutation({
    mutationFn: async ({ id, plan }: { id: string; plan: Plan }) => {
      const { error } = await supabase.rpc('set_business_plan', { p_business_id: id, p_plan: plan })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all_businesses'] }),
    onError: (e: any) => setError(e.message ?? 'No se pudo cambiar el plan.')
  })

  if (!profile?.is_platform_admin) {
    return (
      <div className="glass-card flex flex-col items-center gap-2 p-10 text-center">
        <ShieldAlert size={28} className="text-danger" />
        <p className="text-sm text-content-muted">Esta sección es solo para el administrador de la plataforma.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="t-h1 text-content">Administración de la plataforma</h1>
        <p className="text-sm text-content-muted">Todos los negocios que usan NEXCREDIT y su plan actual.</p>
      </div>

      <PlanLimitsPanel />
      <PlanFeaturesGrid />

      {error && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {isLoading && <p className="text-sm text-content-muted">Cargando…</p>}

      <div className="glass-card divide-y divide-line">
        {data?.map((b) => (
          <div key={b.id}>
            <div className="flex items-center justify-between px-5 py-3.5">
              <div>
                <p className="text-sm font-medium text-content">{b.name}</p>
                <p className="text-xs text-content-muted">
                  {b.owner_name ?? '—'} · {b.clients_count} clientes · {b.loans_count} préstamos · desde {new Date(b.created_at).toLocaleDateString('es-DO')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                  title="Anulaciones de funciones para este negocio"
                  aria-label={`Ver anulaciones de funciones de ${b.name}`}
                  aria-expanded={expanded === b.id}
                  className="flex items-center gap-1 rounded-lg p-1.5 text-content-muted hover:bg-surface-hover hover:text-content"
                >
                  <Settings2 size={16} />
                  <ChevronDown size={14} className={expanded === b.id ? 'rotate-180 transition-transform' : 'transition-transform'} />
                </button>
                <button
                  onClick={() => setResetTarget(b)}
                  title="Restablecer contraseña del propietario"
                  aria-label={`Restablecer contraseña del propietario de ${b.name}`}
                  className="rounded-lg p-1.5 text-content-muted hover:bg-surface-hover hover:text-content"
                >
                  <KeyRound size={16} />
                </button>
                <span className={PLAN_BADGE[b.subscription_plan]}>{PLAN_LABEL[b.subscription_plan]}</span>
                <select
                  value={b.subscription_plan}
                  onChange={(e) => { const plan = e.target.value as Plan; if (window.confirm(`¿Cambiar el plan de ${b.name} a ${PLAN_LABEL[plan]}? Se refleja de inmediato en toda la app.`)) changePlan.mutate({ id: b.id, plan }) }}
                  disabled={changePlan.isPending}
                  className="field-input !w-auto !px-2 !py-1 text-xs"
                  aria-label="Cambiar plan"
                >
                  <option value="basic">Básico</option>
                  <option value="pro">Pro</option>
                  <option value="business">Business</option>
                </select>
              </div>
            </div>
            {expanded === b.id && <BusinessOverridesPanel business={b} />}
          </div>
        ))}
        {(data?.length ?? 0) === 0 && !isLoading && <p className="px-5 py-8 text-center text-sm text-content-muted">Sin negocios registrados.</p>}
      </div>

      {resetTarget && <ResetPasswordModal business={resetTarget} onClose={() => setResetTarget(null)} />}
    </div>
  )
}
