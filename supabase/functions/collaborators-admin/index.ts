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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  const token = getBearer(req)
  if (!token) return json({ error: 'Falta token' }, 401)
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const admin = createClient(supabaseUrl, serviceKey)
  const { data: { user }, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !user) return json({ error: 'No autorizado' }, 401)
  const { data: membership } = await admin.from('business_members').select('business_id, role, permissions').eq('user_id', user.id).eq('is_active', true).maybeSingle()
  if (!membership) return json({ error: 'No autorizado' }, 401)
  const isOwner = membership.role === 'owner'
  const callerPerms = (membership.permissions ?? {}) as Record<string, boolean>
  const isManager = !isOwner && membership.role === 'collaborator' && callerPerms['employees.manage'] === true
  if (!isOwner && !isManager) return json({ error: 'Solo el propietario o un gerente' }, 403)
  const businessId = membership.business_id as string
  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    body = {}
  }
  const action = body.action as string | undefined
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
    const { error } = await admin.auth.admin.updateUserById(user_id, { password: new_password })
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }
  return json({ error: 'Acción no reconocida' }, 400)
})
