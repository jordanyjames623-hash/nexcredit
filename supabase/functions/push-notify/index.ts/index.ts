// push-notify: envía un aviso push por cada cuota que vence hoy y por cada cuota
// recién vencida (primer día de atraso). Se ejecuta una vez al día (7 AM AST).
// Un aviso por cuota y usuario: push_deliveries evita reenvíos.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:jordanyjames623@gmail.com'
const CRON_SECRET = Deno.env.get('PUSH_CRON_SECRET')!

function rdToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' })
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function money(n: number): string {
  return 'RD$ ' + Number(n).toLocaleString('es-DO', { maximumFractionDigits: 0 })
}

Deno.serve(async (req) => {
  if (req.headers.get('x-push-cron-secret') !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const today = rdToday()
  const yesterday = addDays(today, -1)

  const { data: dueRows, error: dueErr } = await supabase
    .from('installment_details')
    .select('business_id, loan_id, number, due_date, effective_status, total_due, total_pending')
    .eq('due_date', today)
    .neq('effective_status', 'paid')
  if (dueErr) return new Response(JSON.stringify({ error: dueErr.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  const { data: overRows, error: overErr } = await supabase
    .from('installment_details')
    .select('business_id, loan_id, number, due_date, effective_status, total_due, total_pending')
    .eq('due_date', yesterday)
    .eq('effective_status', 'overdue')
  if (overErr) return new Response(JSON.stringify({ error: overErr.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })

  const items = [
    ...(dueRows ?? []).map((r) => ({ ...r, kind: 'due_today' as const })),
    ...(overRows ?? []).map((r) => ({ ...r, kind: 'overdue' as const })),
  ]
  if (items.length === 0) return new Response(JSON.stringify({ sent: 0, skipped: 0, failed: 0 }), { headers: { 'Content-Type': 'application/json' } })

  const loanIds = [...new Set(items.map((i) => i.loan_id))]
  const { data: loans } = await supabase.from('loans').select('id, client_id, business_id, deleted_at').in('id', loanIds)
  const loanById = new Map((loans ?? []).map((l) => [l.id, l]))
  const clientIds = [...new Set((loans ?? []).map((l) => l.client_id))]
  const { data: clients } = await supabase.from('clients').select('id, full_name, deleted_at').in('id', clientIds)
  const clientById = new Map((clients ?? []).map((c) => [c.id, c]))

  const bizIds = [...new Set(items.map((i) => i.business_id))]
  const { data: subs } = await supabase.from('push_subscriptions').select('user_id, business_id, endpoint, p256dh, auth').in('business_id', bizIds)
  const subsByBiz = new Map<string, NonNullable<typeof subs>>()
  for (const s of subs ?? []) {
    const arr = subsByBiz.get(s.business_id) ?? []
    arr.push(s)
    subsByBiz.set(s.business_id, arr)
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
  let sent = 0, skipped = 0, failed = 0
  for (const item of items) {
    const loan = loanById.get(item.loan_id)
    if (!loan || loan.deleted_at) { skipped++; continue }
    const client = clientById.get(loan.client_id)
    if (!client || client.deleted_at) { skipped++; continue }
    const targets = subsByBiz.get(item.business_id) ?? []
    const amount = Number(item.total_pending) > 0 ? Number(item.total_pending) : Number(item.total_due)
    const title = item.kind === 'overdue' ? 'Cuota vencida' : 'Cuota vence hoy'
    const body = `${client.full_name} — ${money(amount)} (cuota ${item.number})`
    for (const sub of targets) {
      const { data: existing } = await supabase.from('push_deliveries').select('id')
        .eq('business_id', item.business_id).eq('user_id', sub.user_id)
        .eq('loan_id', item.loan_id).eq('installment_number', item.number).eq('kind', item.kind).maybeSingle()
      if (existing) { skipped++; continue }
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body, url: `/prestamos/${item.loan_id}` }),
          { TTL: 60 * 60 * 24 },
        )
        await supabase.from('push_deliveries').insert({ business_id: item.business_id, user_id: sub.user_id, loan_id: item.loan_id, installment_number: item.number, kind: item.kind, status: 'sent' })
        sent++
      } catch (e) {
        failed++
        await supabase.from('push_deliveries').insert({ business_id: item.business_id, user_id: sub.user_id, loan_id: item.loan_id, installment_number: item.number, kind: item.kind, status: 'failed', error: e instanceof Error ? e.message : String(e) })
      }
    }
  }
  return new Response(JSON.stringify({ sent, skipped, failed }), { headers: { 'Content-Type': 'application/json' } })
})
