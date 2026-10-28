import { supabase } from './supabase'

// NEXCREDIT-2 — Cliente del relay hacia nextex.
// El frontend NUNCA ve la clave de sitio de nextex: solo llama a la Edge Function
// 'nextex-relay' (supabase.functions.invoke manda la anon key para la verificación
// JWT de Supabase) y la función reenvía con Bearer NEXTEX_SITE_KEY desde sus secrets.
// Todo aquí es fuego-y-olvido: reportToNextex nunca lanza una excepción ni rompe la
// pantalla que lo llama; si el relay falla, solo queda un aviso en la consola.

export type NextexRelayType = 'vigia' | 'error' | 'metrica'

export async function reportToNextex(type: NextexRelayType, payload: Record<string, unknown>): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('nextex-relay', { body: { type, payload } })
    if (error) {
      console.warn('[nextex-relay] El relay rechazó el reporte:', type, error.message)
      return false
    }
    if (data && typeof data === 'object' && (data as { ok?: unknown }).ok === false) {
      console.warn('[nextex-relay] El relay no pudo reenviar:', type, (data as { error?: unknown }).error)
      return false
    }
    return true
  } catch (e) {
    console.warn('[nextex-relay] No se pudo contactar el relay:', type, e)
    return false
  }
}

// Métricas del día, al cerrar la caja ("cerrar el día").
// OJO — nextex SUMA cada métrica que recibe para la misma fecha: por eso el envío está
// guardado por negocio + día en localStorage. Si ya se envió hoy, los cierres siguientes
// del mismo día no vuelven a enviar (evita duplicar). El candado es por dispositivo: si
// se cierra caja el mismo día desde otro teléfono, nextex sumaría dos veces.
// Alcance de los números: lo que el usuario que cierra puede ver por RLS (el propietario
// ve todo el negocio; un colaborador, su ámbito).
//   orders  = préstamos nuevos del día (cantidad)
//   sales   = pagos cobrados del día (cantidad de cobros, sin anulados)
//   revenue = monto prestado del día + monto cobrado del día (RD$)
// La fecha es el día local (RD) que se está cerrando, no UTC: nextex usa la fecha que se
// le manda tal cual.
export async function reportDayMetrics(businessId: string | null, userId: string): Promise<boolean> {
  try {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    const d = now.getDate()
    const day = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const start = new Date(y, m, d).toISOString()
    const end = new Date(y, m, d + 1).toISOString()

    const guardKey = `nc_metrics_day:${businessId ?? userId}:${day}`
    try {
      if (localStorage.getItem(guardKey) === '1') return false
    } catch { /* sin almacenamiento: se envía igual */ }

    const { data: loans, error: loansError } = await supabase
      .from('loans')
      .select('principal')
      .gte('created_at', start)
      .lt('created_at', end)
      .is('deleted_at', null)
    if (loansError) {
      console.warn('[nextex-relay] No se pudieron leer los préstamos del día:', loansError.message)
      return false
    }
    const { data: payments, error: paymentsError } = await supabase
      .from('payment_details')
      .select('total_amount')
      .gte('paid_at', start)
      .lt('paid_at', end)
      .neq('status', 'voided')
    if (paymentsError) {
      console.warn('[nextex-relay] No se pudieron leer los cobros del día:', paymentsError.message)
      return false
    }

    const lent = (loans ?? []).reduce((sum, l: { principal?: unknown }) => sum + Number(l.principal ?? 0), 0)
    const collected = (payments ?? []).reduce((sum, p: { total_amount?: unknown }) => sum + Number(p.total_amount ?? 0), 0)

    // Un POST por métrica, en orden. Si alguna falla, no se marca el día: el próximo
    // cierre reintenta (con el riesgo conocido de duplicar la que ya entró, porque
    // nextex suma; por eso el reintento solo ocurre si algo falló de verdad).
    const okOrders = await reportToNextex('metrica', { metric: 'orders', value: loans?.length ?? 0, currency: 'DOP', date: day })
    const okSales = await reportToNextex('metrica', { metric: 'sales', value: payments?.length ?? 0, currency: 'DOP', date: day })
    const okRevenue = await reportToNextex('metrica', { metric: 'revenue', value: lent + collected, currency: 'DOP', date: day })
    if (!okOrders || !okSales || !okRevenue) return false

    try {
      localStorage.setItem(guardKey, '1')
    } catch { /* sin almacenamiento: el próximo cierre reintentaría */ }
    return true
  } catch (e) {
    console.warn('[nextex-relay] No se pudieron enviar las métricas del día:', e)
    return false
  }
}
