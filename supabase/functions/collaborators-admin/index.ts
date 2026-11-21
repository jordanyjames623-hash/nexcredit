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
  if (authErr || !user) return json({ error: 'No autorizado' }, 401)

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
      return json({ error: 'La contraseña inicial debe tener al menos 8 caracteres' }, 400)
    }

    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: new_password,
      email_confirm: true,
      user_metadata: { full_name: full_name ?? '' },
    })
    if (createErr || !newUser.user) return json({ error: createErr?.message ?? 'No se pudo crear el usuario' }, 400)

    const { data: newMember, error: memberErr } = await admin.from('business_members').insert({
      business_id: businessId,
      user_id: newUser.user.id,
      role: 'collaborator',
      is_active: true,
      permissions: sanitizePermissions(permissions),
      display_name: full_name ?? null,
    }).select('id').single()
    if (memberErr || !newMember) {
      await admin.auth.admin.deleteUser(newUser.user.id)
      return json({ error: memberErr?.message ?? 'No se pudo crear el colaborador' }, 400)
    }

    return json({ ok: true, user_id: newUser.user.id, member_id: newMember.id })
  }

  if (action === 'list') {
    const { data: rows } = await admin.from('business_members').select('id, user_id, role, display_name, permissions, is_active, created_at').eq('business_id', businessId).order('created_at', { ascending: true })
    return json({ ok: true, employees: (rows ?? []).filter((r) => r.role === 'collaborator') })
  }

  if (action === 'reset_password') {
    const { user_id, new_password } = body as { user_id?: string; new_password?: string }
    if (!new_password || typeof new_password !== 'string' || new_password.length < 8) {
      return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400)
    }
    const { data: target } = await admin.from('business_members').select('id').eq('business_id', businessId).eq('user_id', user_id).maybeSingle()
    if (!target) return json({ error: 'Colaborador no encontrado' }, 404)
    if (isManager) return json({ error: 'Un gerente no puede resetear contraseñas' }, 403)
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

  if (action === 'update_permissions') {
    const { user_id, permissions } = body as { user_id?: string; permissions?: unknown }
    const { data: target } = await admin.from('business_members').select('id').eq('business_id', businessId).eq('user_id', user_id).maybeSingle()
    if (!target) return json({ error: 'Colaborador no encontrado' }, 404)
    const { error } = await admin.from('business_members').update({ permissions: sanitizePermissions(permissions) }).eq('id', target.id)
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  if (action === 'set_active') {
    const { user_id, is_active } = body as { user_id?: string; is_active?: boolean }
    if (typeof is_active !== 'boolean') return json({ error: 'is_active inválido' }, 400)
    const { data: target } = await admin.from('business_members').select('id').eq('business_id', businessId).eq('user_id', user_id).maybeSingle()
    if (!target) return json({ error: 'Colaborador no encontrado' }, 404)
    const { error } = await admin.from('business_members').update({ is_active }).eq('id', target.id)
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  return json({ error: 'Acción no válida' }, 400)
})
