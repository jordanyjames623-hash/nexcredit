import { createClient } from 'npm:@supabase/supabase-js@2'

// Canal de desbloqueo del PIN del portal, por SMS o WhatsApp (Twilio).
// NO DESPLEGADA TODAVÍA. Para activarla de verdad hacen falta 3 secretos en este proyecto de Supabase
// (Project Settings → Edge Functions → Secrets), obtenidos al crear una cuenta en https://twilio.com:
//
//   TWILIO_ACCOUNT_SID       — empieza con "AC..."
//   TWILIO_AUTH_TOKEN        — el token de autenticación de la cuenta
//   TWILIO_FROM              — tu número de Twilio (SMS: "+1XXXXXXXXXX") o, para WhatsApp,
//                              "whatsapp:+1XXXXXXXXXX" (requiere el servicio de WhatsApp de Twilio
//                              activado y el número del cliente ya "opt-in" según las reglas de Meta)
//
// Por defecto envía por SMS (más simple de poner en marcha: no requiere que el cliente le escriba
// al número de Twilio, a diferencia de WhatsApp). Para cambiar a WhatsApp, basta con que TWILIO_FROM
// empiece con "whatsapp:" — el código ya lo detecta solo, sin tocar nada más.
//
// Mientras no existan los 3 secretos, esta función responde con un error claro en vez de fallar feo.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
}

async function sendViaTwilio(toPhone: string, text: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')
  const from = Deno.env.get('TWILIO_FROM')
  if (!sid || !token || !from) {
    return { ok: false, message: 'El envío de códigos todavía no está configurado (faltan las credenciales de Twilio).' }
  }

  const isWhatsapp = from.startsWith('whatsapp:')
  const to = isWhatsapp ? `whatsapp:${toPhone}` : toPhone

  const form = new URLSearchParams({ To: to, From: from, Body: text })
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form
  })
  if (!res.ok) {
    // No se repite el cuerpo de la respuesta de Twilio tal cual: puede traer detalles de la cuenta.
    return { ok: false, message: 'No se pudo enviar el código. Intenta de nuevo en unos minutos.' }
  }
  return { ok: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  let body: any

  try { body = await req.json() } catch { return json({ error: 'JSON inválido' }, 400) }
  const { document_id } = body
  if (!document_id || typeof document_id !== 'string') return json({ error: 'Falta la cédula' }, 400)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data, error } = await admin.rpc('generate_portal_unlock_code', { p_document_id: document_id })
  if (error) return json({ error: 'No se pudo generar el código' }, 500)
  if (!data?.ok) return json({ error: 'Si la cédula tiene acceso al portal y un teléfono registrado, recibirás el código en unos minutos.' }, 400)

  const sent = await sendViaTwilio(data.phone, `Tu código para recuperar el acceso es: ${data.code} (vence en 10 minutos).`)
  if (!sent.ok) return json({ error: sent.message }, 502)

  // Nunca se devuelve el código ni el teléfono completo al navegador — solo la confirmación de envío.
  return json({ ok: true })
})
