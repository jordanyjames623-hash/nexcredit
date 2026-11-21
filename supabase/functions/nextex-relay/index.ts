import { createClient } from 'npm:@supabase/supabase-js@2'
// NEXCREDIT-2 — Relay hacia nextex.
//
// El frontend SOLO llama a esta función; la clave de sitio de nextex (ntx_...) vive en
// los secrets de la función y NUNCA en el código del frontend:
//   supabase secrets set NEXTEX_SITE_KEY=ntx_...
//   supabase functions deploy nextex-relay
// La clave es la de nextex para Capitalia (cliente en nextex -> claves de sitio). NO es
// la nx_... del conector 1A: nextex solo acepta claves ntx_... en estos endpoints.
//
// Contrato frontend -> relay: { type: 'vigia' | 'error' | 'metrica', payload: {...} }
//   vigia   -> POST https://nextex-seven.vercel.app/api/vigia/events
//   error   -> POST https://nextex-seven.vercel.app/api/errors/report
//   metrica -> POST https://nextex-seven.vercel.app/api/analytics/report
// Siempre con `Authorization: Bearer NEXTEX_SITE_KEY`.
//
// Si el reenvío falla, el fallo queda en los logs de la función (nunca en silencio) y
// el frontend recibe 502: el reporte es fuego-y-olvido, nunca rompe la app.
// La verificación JWT de Supabase se deja ENCENDIDA (por defecto): el frontend llama con
// supabase.functions.invoke, que ya manda la anon key como Authorization.

const NEXTTEX_BASE = 'https://nextex-seven.vercel.app'

const ROUTES: Record<string, string> = {
  vigia: '/api/vigia/events',
  error: '/api/errors/report',
  metrica: '/api/analytics/report',
}

const ALLOWED_ORIGINS = ['https://capitalia-beta.vercel.app', 'http://localhost:5173']

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function json(status: number, body: Record<string, unknown>, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

// IP del cliente: la toma la función de las cabeceras del request (el navegador no sabe
// su IP pública). Se toma el ÚLTIMO elemento de X-Forwarded-For (el agregado por el
// gateway); el primero lo puede falsificar el cliente (SEC-013). Si no viene ninguna,
// usa la que el frontend haya mandado, si la hay.
function clientIp(req: Request, fallback: unknown): string | null {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',').pop()!.trim()
  const direct = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip')
  if (direct) return direct.trim()
  return typeof fallback === 'string' && fallback.trim() ? fallback.trim() : null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' }, headers)
  const siteKey = Deno.env.get('NEXTEX_SITE_KEY') ?? ''
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json(400, { ok: false, error: 'invalid_json' }, headers)
  }
  if (!isObject(body)) return json(400, { ok: false, error: 'invalid_body' }, headers)
  const { type, payload } = body
  if (typeof type !== 'string' || !(type in ROUTES)) {
    return json(400, { ok: false, error: 'unknown_type' }, headers)
  }
  if (!isObject(payload)) return json(400, { ok: false, error: 'invalid_payload' }, headers)
  // Las métricas alimentan los números financieros de Nextex: solo un usuario
  // real, miembro activo de un negocio, puede enviarlas. La anon key pública
  // no basta (un tercero podría adulterar las métricas).
  if (type === 'metrica') {
    const auth = req.headers.get('authorization') ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: { user } } = await admin.auth.getUser(token)
    if (!user) return json(401, { ok: false, error: 'unauthorized' }, headers)
    const { data: member } = await admin.from('business_members').select('id').eq('user_id', user.id).eq('is_active', true).maybeSingle()
    if (!member) return json(401, { ok: false, error: 'unauthorized' }, headers)
  }
  // Armar el cuerpo exacto que nextex espera para cada endpoint.
  let nextBody: Record<string, unknown>
  if (type === 'vigia') {
    if (typeof payload.event_type !== 'string' || !payload.event_type.trim()) {
      return json(400, { ok: false, error: 'invalid_event_type' }, headers)
    }
    nextBody = {
      event_type: payload.event_type,
      ip: clientIp(req, payload.ip),
      detail: isObject(payload.detail) ? payload.detail : {},
    }
  } else if (type === 'error') {
    if (typeof payload.message !== 'string' || !payload.message.trim()) {
      return json(400, { ok: false, error: 'message_required' }, headers)
    }
    nextBody = {
      error_type: typeof payload.error_type === 'string' ? payload.error_type : undefined,
      message: payload.message,
      detail: isObject(payload.detail) ? payload.detail : {},
    }
  } else {
    // metrica
    if (typeof payload.metric !== 'string' || typeof payload.value !== 'number') {
      return json(400, { ok: false, error: 'invalid_metric' }, headers)
    }
    nextBody = {
      metric: payload.metric,
      value: payload.value,
      currency: typeof payload.currency === 'string' ? payload.currency : undefined,
      date: typeof payload.date === 'string' ? payload.date : undefined,
    }
  }
  let res: Response
  try {
    res = await fetch(`${NEXTTEX_BASE}${ROUTES[type]}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${siteKey}` },
      body: JSON.stringify(nextBody),
    })
  } catch (err) {
    console.error('[nextex-relay] Falló el reenvío a nextex:', type, err)
    return json(502, { ok: false, error: 'forward_failed' }, headers)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[nextex-relay] nextex rechazó el reenvío:', type, res.status, text.slice(0, 300))
    return json(502, { ok: false, error: 'forward_rejected', status: res.status }, headers)
  }
  return json(200, { ok: true, status: res.status }, headers)
})
