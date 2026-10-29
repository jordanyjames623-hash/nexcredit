import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { money0, initials, avatarColor } from './lib'
import { PAYMENT_METHOD_LABEL } from '@/lib/format'

// Registrar pago de la maqueta: tarjeta del cliente, monto de la siguiente cuota sin
// pagar, pildoras de metodo y Confirmar pago. Al confirmar, el formulario se reemplaza
// por la tarjeta de exito con el numero de recibo, como en la maqueta.
// Los colores salen de var(--nc-*).
const METHOD_OPTIONS = [
  { v: 'cash', l: 'Efectivo' }, { v: 'transfer', l: 'Transferencia' }, { v: 'card', l: 'Tarjeta' }
]

// Advanced payment options. Every option maps to the same register_payment RPC
// the old loan detail form already uses, so no new server call is needed:
// regular with an amount distributes mora, then interes, then capital in order;
// interest and principal take their amount straight to that component.
type AdvKey = 'cuota_mora' | 'interes' | 'parcial' | 'capital' | 'adelantadas' | 'saldar'

type InstRow = {
  number: number; effective_status: string
  principal_due: number; interest_due: number; late_fee_accrued: number
  principal_paid: number; interest_paid: number; late_fee_paid: number
  total_due: number; total_paid: number; total_pending: number
}

const ADV_LABEL: Record<AdvKey, string> = {
  cuota_mora: 'Cuota + mora', interes: 'Solo intereses', parcial: 'Abono parcial',
  capital: 'Abono a capital', adelantadas: 'Cuotas adelantadas', saldar: 'Saldar préstamo'
}

// Pending parts of one installment, same order the server uses: mora, interes, capital.
function partsOf(i: InstRow) {
  return {
    m: Math.max(0, Number(i.late_fee_accrued) - Number(i.late_fee_paid)),
    i: Math.max(0, Number(i.interest_due) - Number(i.interest_paid)),
    p: Math.max(0, Number(i.principal_due) - Number(i.principal_paid))
  }
}

// Walk unpaid installments in order applying amount mora, then interes, then capital,
// mirroring the server loop for regular payments with an explicit amount.
function walkRegular(unpaid: InstRow[], amount: number) {
  let rem = amount
  let mora = 0
  let interes = 0
  let capital = 0
  for (const row of unpaid) {
    if (rem <= 0) break
    const p = partsOf(row)
    if (p.m + p.i + p.p <= 0) continue
    const payM = Math.min(rem, p.m); rem -= payM; mora += payM
    const payI = Math.min(rem, p.i); rem -= payI; interes += payI
    const payP = Math.min(rem, p.p); rem -= payP; capital += payP
  }
  return { mora, interes, capital }
}

export function RegisterPayment() {
  const { loanId } = useParams()
  const [method, setMethod] = useState('cash')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<number | null>(null)

  const loanQuery = useQuery({
    queryKey: ['nuevo_rp_loan', loanId],
    queryFn: async () => {
      const { data, error } = await supabase.from('loans').select('id, loan_number, status, client_id, current_principal').eq('id', loanId).single()
      if (error) throw error
      return data as { id: string; loan_number: number; status: string; client_id: string; current_principal: number }
    }
  })
  const clientQuery = useQuery({
    queryKey: ['nuevo_rp_client', loanQuery.data?.client_id],
    enabled: !!loanQuery.data?.client_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('full_name').eq('id', loanQuery.data!.client_id).single()
      if (error) throw error
      return data as { full_name: string }
    }
  })
  const installmentsQuery = useQuery({
    queryKey: ['nuevo_rp_installments', loanId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('installment_details')
        .select('number, effective_status, principal_due, interest_due, late_fee_accrued, principal_paid, interest_paid, late_fee_paid, total_due, total_paid, total_pending')
        .eq('loan_id', loanId)
        .order('number')
      if (error) throw error
      return data as InstRow[]
    }
  })

  const loan = loanQuery.data
  const inst = installmentsQuery.data ?? []
  const total = inst.length
  const next = inst.find((i) => i.effective_status !== 'paid')
  const amount = next ? (Number(next.total_pending) > 0 ? Number(next.total_pending) : Number(next.total_due)) : 0

  // Advanced options state. With no option selected the screen behaves exactly
  // as before: the next installment in full. Selecting an option only changes
  // the amount and the RPC arguments below, never the normal flow.
  const unpaid = inst.filter((i) => i.effective_status !== 'paid')
  const nextParts = next ? partsOf(next) : { m: 0, i: 0, p: 0 }
  const totalPendingAll = unpaid.reduce((s, i) => s + Number(i.total_pending), 0)
  const totalPendingInterest = unpaid.reduce((s, i) => s + Math.max(0, Number(i.interest_due) - Number(i.interest_paid)), 0)
  const currentPrincipal = Number(loan?.current_principal ?? 0)
  const nextPending = next ? Number(next.total_pending) : 0

  const [adv, setAdv] = useState<AdvKey | null>(null)
  const [advOpen, setAdvOpen] = useState(false)
  const [advAmount, setAdvAmount] = useState('')
  const [advCount, setAdvCount] = useState(2)
  const [notes, setNotes] = useState('')
  const [paidLabel, setPaidLabel] = useState<string | null>(null)
  const [settled, setSettled] = useState(false)

  function selectAdv(key: AdvKey) {
    if (adv === key) { setAdv(null); return }
    setAdv(key)
    if (key === 'cuota_mora') setAdvAmount(String(nextPending))
    else if (key === 'interes') setAdvAmount(String(nextParts.i))
    else if (key === 'saldar') setAdvAmount(String(totalPendingAll))
    else if (key === 'adelantadas') setAdvCount(Math.min(2, Math.max(1, unpaid.length)))
    else setAdvAmount('')
  }

  const adelantadasTotal = (() => {
    let s = 0
    const n = Math.min(advCount, unpaid.length)
    for (let k = 0; k < n; k++) s += Number(unpaid[k].total_pending)
    return s
  })()

  const typedAmount = advAmount.trim() === '' ? 0 : Number(advAmount)
  const payTotal = adv === null ? amount
    : adv === 'adelantadas' ? adelantadasTotal
    : typedAmount
  const payCap = adv === null ? 0
    : adv === 'cuota_mora' ? nextPending
    : adv === 'interes' ? totalPendingInterest
    : adv === 'parcial' ? totalPendingAll
    : adv === 'capital' ? currentPrincipal
    : adv === 'adelantadas' ? totalPendingAll
    : totalPendingAll
  const payInvalid = adv !== null && (payTotal <= 0 || payTotal > payCap)
  const preview = adv === 'interes'
    ? { mora: 0, interes: payTotal, capital: 0 }
    : adv === 'capital'
    ? { mora: 0, interes: 0, capital: payTotal }
    : walkRegular(unpaid, payTotal)
  const advEffect = adv === null ? ''
    : adv === 'cuota_mora' ? `Cuota ${next?.number} completa, mora incluida.`
    : adv === 'interes' ? 'La cuota sigue pendiente: solo se cubren intereses.'
    : adv === 'parcial' ? 'Se aplica mora, luego interes y luego capital.'
    : adv === 'capital' ? `El capital baja a RD$ ${money0(currentPrincipal - payTotal)}. Las cuotas futuras se recalculan.`
    : adv === 'adelantadas' ? `Se pagan las cuotas ${unpaid[0]?.number} a ${unpaid[Math.min(advCount, unpaid.length) - 1]?.number}.`
    : payTotal >= totalPendingAll ? 'El préstamo queda saldado.' : `Quedan RD$ ${money0(totalPendingAll - payTotal)} por pagar.`

  async function confirm() {
    if (!loanId || saving || payInvalid) return
    setSaving(true)
    setError(null)
    const rpcType = adv === 'interes' ? 'interest' : adv === 'capital' ? 'principal' : 'regular'
    const rpcAmount = adv === null ? null : adv === 'adelantadas' ? adelantadasTotal : payTotal
    const { data, error } = await supabase.rpc('register_payment', {
      p_loan_id: loanId,
      p_payment_type: rpcType,
      p_amount: rpcAmount,
      p_principal: 0,
      p_interest: 0,
      p_late_fee: 0,
      p_idempotency_key: crypto.randomUUID(),
      p_notes: notes.trim() || null,
      p_payment_method: method,
      p_paid_at: new Date().toISOString()
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    const n = (data as any)?.receipt_number ?? (data as any)?.receiptNumber ?? null
    setReceipt(typeof n === 'number' ? n : null)
    setPaidLabel(adv === null ? 'Cuota regular' : ADV_LABEL[adv])
    setSettled((data as any)?.loan_status === 'paid')
  }

  // La pantalla esperaba solo al préstamo y las cuotas, no al cliente: el nombre salía
  // como "—" mientras la consulta del cliente aún cargaba (visto en la prueba 2026-10-25).
  // Ahora espera a las tres consultas antes de mostrar el formulario.
  if (loanQuery.isLoading || installmentsQuery.isLoading || clientQuery.isLoading) return <p className="text-sm text-[var(--nc-muted)]">Cargando…</p>
  if (loanQuery.error || !loan) return <p className="text-sm text-red-400">No se encontró el préstamo.</p>
  if (loan.status === 'paid') {
    return (
      <div className="rounded-2xl bg-[var(--nc-card)] p-6 text-center">
        <p className="text-base font-bold text-[var(--nc-text)]">Este préstamo ya está finalizado.</p>
        <Link to="/prestamos" className="mt-4 inline-block rounded-xl bg-[#2563EB] px-5 py-2.5 text-sm font-semibold text-white">Volver a préstamos</Link>
      </div>
    )
  }
  if (!next) {
    return (
      <div className="rounded-2xl bg-[var(--nc-card)] p-6 text-center">
        <p className="text-base font-bold text-[var(--nc-text)]">No hay cuotas pendientes en este préstamo.</p>
        <Link to="/prestamos" className="mt-4 inline-block rounded-xl bg-[#2563EB] px-5 py-2.5 text-sm font-semibold text-white">Volver a préstamos</Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-[28px] font-bold leading-tight text-[var(--nc-text)]">Registrar pago</h1>

      {receipt !== null ? (
        <div className="space-y-3">
          <div className="rounded-2xl bg-[var(--nc-card)] p-6 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white"><Check size={26} /></span>
            <p className="mt-3 text-lg font-bold text-[var(--nc-text)]">Pago registrado</p>
            <p className="text-sm text-[var(--nc-muted)]">Recibo #{receipt} generado</p>
            {paidLabel && <p className="text-sm text-[var(--nc-muted)]">{paidLabel}</p>}
            {settled && <p className="mt-1 text-sm font-semibold text-green-500">Préstamo saldado</p>}
          </div>
          <button
            onClick={async () => {
              const text = `Recibo #${receipt} — ${clientQuery.data?.full_name ?? ''} — RD$ ${money0(payTotal)} (${PAYMENT_METHOD_LABEL[method] ?? method})`
              try { await navigator.share({ text }) } catch { try { await navigator.clipboard.writeText(text) } catch { /* sin portapapeles */ } }
            }}
            className="block w-full rounded-xl bg-[#2563EB] py-3 text-center text-sm font-semibold text-white"
          >
            Compartir recibo
          </button>
          <Link to="/" className="block rounded-xl bg-[var(--nc-soft)] py-3 text-center text-sm font-medium text-[var(--nc-text)]">Volver a inicio</Link>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-2xl bg-[var(--nc-card)] p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: avatarColor(loan.client_id) }}>
              {initials(clientQuery.data?.full_name ?? '—')}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--nc-text)]">{clientQuery.data?.full_name ?? '—'}</p>
              {clientQuery.error && <p className="text-xs text-red-400">No se pudo cargar el nombre del cliente.</p>}
              <p className="text-xs text-[var(--nc-muted)]">Préstamo PR-{loan.loan_number} · Cuota {next.number} de {total}</p>
            </div>
          </div>

          <div className="rounded-2xl bg-[var(--nc-card)] p-4">
            <p className="text-xs text-[var(--nc-muted)]">Monto a pagar</p>
            <p className="font-disp mt-1 text-3xl font-bold text-[var(--nc-text)]">RD$ {money0(payTotal)}</p>
            {adv !== null && <p className="mt-1 text-xs text-[var(--nc-muted)]">{ADV_LABEL[adv]}</p>}
          </div>

          <div>
            <p className="mb-2 text-sm text-[var(--nc-muted)]">Método de pago</p>
            <div className="flex gap-2">
              {METHOD_OPTIONS.map((o) => (
                <button key={o.v} onClick={() => setMethod(o.v)}
                  className={`flex-1 rounded-full py-2.5 text-sm font-medium ${method === o.v ? 'bg-[#2563EB] text-white' : 'bg-[var(--nc-card)] text-[var(--nc-muted)]'}`}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-[var(--nc-card)] p-4">
            <button onClick={() => setAdvOpen(!advOpen)} className="flex w-full items-center justify-between text-left">
              <span className="text-sm font-semibold text-[var(--nc-text)]">Opciones avanzadas{adv !== null && <span className="font-normal text-[var(--nc-muted)]"> · {ADV_LABEL[adv]}</span>}</span>
              <span className="text-sm text-[var(--nc-muted)]">{advOpen ? '▴' : '▾'}</span>
            </button>
            {advOpen && (<>
            <p className="mt-1 text-xs text-[var(--nc-muted)]">El pago normal es la cuota siguiente. Si eliges una opción, el monto y el desglose cambian.</p>
            <div className="mt-3 space-y-2">
              {(['cuota_mora', 'interes', 'parcial', 'capital', 'adelantadas', 'saldar'] as AdvKey[]).map((key) => (
                <div key={key} className="rounded-xl bg-[var(--nc-soft)] p-3">
                  <button onClick={() => selectAdv(key)} className="flex w-full items-center gap-2 text-left">
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${adv === key ? 'border-[#2563EB] bg-[#2563EB]' : 'border-[var(--nc-muted)]'}`}>
                      {adv === key && <span className="h-2 w-2 rounded-full bg-white" />}
                    </span>
                    <span className="text-sm font-medium text-[var(--nc-text)]">{ADV_LABEL[key]}</span>
                  </button>
                  {adv === key && (
                    <div className="mt-3 space-y-2">
                      {key === 'adelantadas' ? (
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-[var(--nc-muted)]">Cuotas a adelantar</label>
                          <input type="number" min={1} max={unpaid.length} value={advCount}
                            onChange={(e) => setAdvCount(Math.max(1, Math.min(unpaid.length, Number(e.target.value) || 1)))}
                            className="w-20 rounded-lg bg-[var(--nc-card)] px-2 py-1.5 text-sm text-[var(--nc-text)]" />
                          <span className="text-xs text-[var(--nc-muted)]">de {unpaid.length} pendientes</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-[var(--nc-muted)]">Monto RD$</label>
                          <input type="number" min={0} step="0.01" value={advAmount}
                            onChange={(e) => setAdvAmount(e.target.value)}
                            className="w-36 rounded-lg bg-[var(--nc-card)] px-2 py-1.5 text-sm text-[var(--nc-text)]" />
                          <span className="text-xs text-[var(--nc-muted)]">Tope RD$ {money0(payCap)}</span>
                        </div>
                      )}
                      <div className="rounded-lg bg-[var(--nc-card)] px-3 py-2 text-xs text-[var(--nc-muted)]">
                        <p>Así se aplica: mora RD$ {money0(preview.mora)} · interés RD$ {money0(preview.interes)} · capital RD$ {money0(preview.capital)}</p>
                        <p className="mt-1 text-[var(--nc-text)]">{advEffect}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3">
              <label className="text-xs text-[var(--nc-muted)]">Nota (opcional)</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej: abono de la quincena"
                className="mt-1 w-full rounded-lg bg-[var(--nc-soft)] px-3 py-2 text-sm text-[var(--nc-text)]" />
            </div>
            </>)}
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {payInvalid && <p className="text-sm text-red-400">Revisa el monto: debe ser mayor que cero y no pasar de RD$ {money0(payCap)}.</p>}
          <button onClick={confirm} disabled={saving || payInvalid} className="block w-full rounded-xl bg-[#2563EB] py-3.5 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? 'Registrando…' : adv !== null ? `Confirmar pago · RD$ ${money0(payTotal)}` : 'Confirmar pago'}
          </button>
        </>
      )}
    </div>
  )
}
