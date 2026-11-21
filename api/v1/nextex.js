// NEXCREDIT-1A — GET /api/v1/nextex (función serverless Vercel, fuera de src: tsc no la toca).
// Autentica por la llave mini-API del negocio (header x-nextex-key) y devuelve el resumen vivo
// SOLO de ese business_id, vía la función SQL nextex_business_summary (migración
// 20261025_nextex_connector.sql). Sin llave válida → 401. Sin plan Business → 403 (SEC-030).
// Nunca lista negocios ajenos.
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'method_not_allowed' })
  }
  const key = req.headers['x-nextex-key']
  if (!key || typeof key !== 'string' || !/^nx_[0-9a-f]{48}$/.test(key)) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  if (!/^nx_[0-9a-f]{48}$/.test(key)) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return res.status(500).json({ error: 'server_misconfigured' })
  }
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: business, error: bizError } = await supabase
    .from('businesses')
    .select('id, nextex_id, name, subscription_plan')
    .eq('nextex_key', key)
    .maybeSingle()
  if (bizError || !business) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  // SEC-030 (decisión JC 2026-10-27): la mini-API exige plan Business, igual que la API pública.
  if (business.subscription_plan !== 'business') {
    return res.status(403).json({ error: 'plan_required' })
  }
  const { data: summary, error: sumError } = await supabase.rpc('nextex_business_summary', {
    p_business: business.id
  })
  if (sumError || !summary) {
    return res.status(500).json({ error: 'summary_failed' })
  }
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({
    nextex_id: business.nextex_id,
    business_name: business.name,
    ...summary
  })
}
