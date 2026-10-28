import { createClient } from 'npm:@supabase/supabase-js@2'

// Acciones del administrador de la plataforma (Jordany, dueño real de NEXCREDIT) sobre CUALQUIER
// negocio que use el producto — no sobre su propio negocio como propietario, sino como operador del
// SaaS. Exige reautenticación con su propia contraseña, igual que critical-actions y
// collaborators-admin, y verifica is_platform_admin leyendo la tabla directamente (nunca confiando
// en nada que mande el navegador).

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })

  const { data: { user } } = await asCaller.auth.getUser()
  if (!user?.email) return json({ error: 'No autenticado' }, 401)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'JSON inválido' }, 400) }
  const { action, password, business_id, new_password } = body
  if (!password) return json({ error: 'Falta confirmar tu contraseña' }, 400)

  // Reautenticación obligatoria, sin crear una sesión nueva de verdad en el navegador — solo confirma
  // que quien llama de verdad sabe la contraseña actual, antes de una acción tan sensible como esta.
  const verifier = createClient(url, anonKey)
  const { error: authErr } = await verifier.auth.signInWithPassword({ email: user.email, password })
  if (authErr) return json({ error: 'Contraseña incorrecta' }, 401)

  const { data: profile } = await admin.from('profiles').select('is_platform_admin').eq('id', user.id).single()
  if (!profile?.is_platform_admin) return json({ error: 'Solo el administrador de la plataforma puede hacer esto' }, 403)

  if (action === 'reset_owner_password') {
    if (!business_id || !new_password) return json({ error: 'Faltan datos' }, 400)
    if (new_password.length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400)

    const { data: biz } = await admin.from('businesses').select('owner_id, name').eq('id', business_id).single()
    if (!biz) return json({ error: 'Negocio no encontrado' }, 404)

    const { error: updErr } = await admin.auth.admin.updateUserById(biz.owner_id, { password: new_password })
    if (updErr) return json({ error: 'No se pudo cambiar la contraseña' }, 500)

    // Cerrar cualquier sesión que el dueño tuviera abierta — una contraseña nueva no debe convivir
    // con una sesión vieja ya iniciada con la anterior.
    await admin.auth.admin.signOut(biz.owner_id, 'global').catch(() => {})

    await admin.from('activity_logs').insert({
      business_id, user_id: user.id, user_name: `Administrador de plataforma (${user.email})`,
      action: 'platform_admin_password_reset', entity_type: 'business', entity_id: business_id,
      status: 'success', details: { business_name: biz.name }
    })

    return json({ ok: true })
  }

  return json({ error: 'Acción desconocida' }, 400)
})
