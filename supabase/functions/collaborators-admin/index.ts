// collaborators-admin v5 — Seguridad (2026-11-20).
// Cambios respecto a la v4 (Fase 4A):
// 1. REAUTENTICACIÓN: `create` y `reset_password` ahora exigen `body.password`
//    (la contraseña actual del dueño/gerente que el frontend ya enviaba y la v4
//    ignoraba). Se verifica con un cliente verificador (anon key) vía
//    signInWithPassword; si falla → 401 'Tu contraseña actual es incorrecta'.
// 2. AAL2: si el llamador es dueño y tiene un factor TOTP verificado, el JWT con
//    el que llama debe ser aal2; un token aal1 (solo contraseña) → 403.
// 3. reset_password: tras cambiar la contraseña se cierran TODAS las sesiones
//    del colaborador (signOut global), para que no quede una sesión huérfana
//    con la contraseña vieja.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const validPermissions = new Set([
  'routes.view', 'routes.view_all', 'routes.manage',
  'expenses.view', 'expenses.create', 'expenses.update', 'expenses.view_all',
  'cash_sessions.view', 'cash_sessions.view_all', 'cash_sessions.close_any',
  'ruteo.open', 'ruteo.view_all',
  'reports.view_all', 'loans.view_all',
  'employees.manage',
])

function sanitizePermissions(input: unknown): Record<string, boolean> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const out: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(input)) {
    if (validPermissions.has(key)) out[key] = value === true
  }
  return out
}

function getBearer(req: Request): string | null {
  const auth = req.headers.get('Authorization') ?? ''
  return auth.startsWith('Bearer ') ? auth.slice(7) : null
}

// Lee el claim `aal` del JWT del llamador (sin verificar la firma: la firma ya
// la verificó admin.auth.getUser). Devuelve null si no se puede leer.
function jwtAal(token: string): string | null {
  try {
    const part = token.split('.')[1]
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(normalized)) as { aal?: unknown }
    return typeof payload.aal === 'string' ? payload.aal : null
  } catch {
    return null
  }
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  const token = getBearer(req)
  if (!token) return json({ error: 'Falta token' }, 401)
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const admin = createClient(supabaseUrl, serviceKey)
  const { data: { user }, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !user || !user.email) return json({ error: 'No autorizado' }, 401)
  const { data: membership } = await admin.from('business_members').select('business_id, role, permissions').eq('user_id', user.id).eq('is_active', true).maybeSingle()
  if (!membership) return json({ error: 'No autorizado' }, 401)
  const isOwner = membership.role === 'owner'
  const callerPerms = (membership.permissions ?? {}) as Record<string, boolean>
  const isManager = !isOwner && membership.role === 'collaborator' && callerPerms['employees.manage'] === true
  if (!isOwner && !isManager) return json({ error: 'Solo el propietario o un gerente' }, 403)
  // Si el dueño tiene un factor TOTP verificado, el token con el que llama debe
  // ser aal2 (haber pasado el reto). Un token aal1 no basta para gestionar empleados.
  if (isOwner) {
    const { data: factors } = await admin.auth.mfa.listFactors({ userId: user.id })
    const hasVerifiedTotp = (factors?.factors ?? []).some(
      (f) => f.factor_type === 'totp' && f.status === 'verified',
    )
    if (hasVerifiedTotp && jwtAal(token) !== 'aal2') {
      return json({ error: 'Se requiere verificación de dos factores (MFA)' }, 403)
    }
  }
  const businessId = membership.business_id as string
  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    body = {}
  }
  const callerPassword = body.password
  if (!callerPassword || typeof callerPassword !== 'string') {
    return json({ error: 'Falta confirmar tu contraseña actual' }, 400)
  }
  const verifier = createClient(supabaseUrl, anonKey || serviceKey, { auth: { persistSession: false } })
  const { error: reauthErr } = await verifier.auth.signInWithPassword({ email: user.email, password: callerPassword })
  if (reauthErr) return json({ error: 'Tu contraseña actual no es correcta' }, 401)

  const action = body.action as string | undefined
  // Reautenticación obligatoria para crear empleados y resetear contraseñas:
  // el frontend ya enviaba `password` (la contraseña actual del llamador) y se
  // ignoraba. Se verifica sin crear sesión en el navegador, solo confirma que
  // quien llama sabe la contraseña actual.
  if (action === 'create' || action === 'reset_password') {
    const password = body.password
    if (typeof password !== 'string' || !password.trim()) {
      return json({ error: 'Falta confirmar tu contraseña' }, 400)
    }
    if (!user.email) return json({ error: 'No autenticado' }, 401)
    const verifier = createClient(supabaseUrl, anonKey)
    const { error: reauthErr } = await verifier.auth.signInWithPassword({
      email: user.email,
      password: String(password),
    })
    if (reauthErr) return json({ error: 'Tu contraseña actual es incorrecta' }, 401)
  }
  if (action === 'create') {
    const { email, full_name, permissions, new_password } = body as {
      email: string; full_name?: string; permissions?: unknown; new_password?: string
    }
    if (!email || typeof email !== 'string') return json({ error: 'Correo inválido' }, 400)
    if (!new_password || typeof new_password !== 'string' || new_password.length < 8) {
      return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400)
    }
    let clean = sanitizePermissions(permissions)
    if (isManager) {
      delete clean['employees.manage']
      for (const key of Object.keys(clean)) {
        if (clean[key] && callerPerms[key] !== true) delete clean[key]
      }
    }
    const { data: biz } = await admin.from('businesses').select('subscription_plan').eq('id', businessId).single()
    const { data: limit } = await admin.from('plan_limits').select('max_collaborators').eq('plan', biz?.subscription_plan ?? 'basic').single()
    const maxCollab = limit?.max_collaborators ?? null
    if (maxCollab !== null) {
      const { count } = await admin
        .from('business_members')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId).eq('role', 'collaborator').eq('is_active', true)
      if ((count ?? 0) >= maxCollab) {
        return json({ error: `Límite de ${maxCollab} colaboradores activos alcanzado para tu plan` }, 400)
      }
    }
    const { data: created, error } = await admin.auth.admin.createUser({
      email, password: new_password, email_confirm: true,
      user_metadata: { full_name: full_name ?? '' },
      app_metadata: { invited_business_id: businessId, invited_by: user.id, permissions: clean },
    })
    if (error) return json({ error: error.message }, 400)
    return json({ id: created.user?.id, email: created.user?.email })
  }
  if (action === 'reset_password') {
    const { user_id, new_password } = body
    if (!new_password || typeof new_password !== 'string' || new_password.length < 8) {
      return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400)
    }
    const { data: target } = await admin.from('business_members').select('business_id, role, created_by').eq('user_id', user_id).maybeSingle()
    if (!target || target.business_id !== businessId || target.role !== 'collaborator') {
      return json({ error: 'Colaborador no encontrado' }, 404)
    }
    if (isManager && target.created_by !== user.id) {
      return json({ error: 'Un gerente solo puede resetear la contraseña de sus subordinados' }, 403)
    }
    if (!user_id || typeof user_id !== 'string') {
      return json({ error: 'Colaborador no encontrado' }, 404)
    }
    const { error } = await admin.auth.admin.updateUserById(user_id, { password: new_password })
    if (error) return json({ error: error.message }, 400)
    // Cerrar cualquier sesión que el colaborador tuviera abierta — una contraseña
    // nueva no debe convivir con una sesión vieja ya iniciada con la anterior.
    await admin.auth.admin.signOut(user_id, 'global').catch(() => {})
    return json({ ok: true })
  }
  return json({ error: 'Acción no reconocida' }, 400)
})
