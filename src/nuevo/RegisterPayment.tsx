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

export function RegisterPayment() {
  const { loanId } = useParams()
  const [method, setMethod] = useState('cash')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<number | null>(null)

  const loanQuery = useQuery({
    queryKey: ['nuevo_rp_loan', loanId],
    queryFn: async () => {
      const { data, error } = await supabase.from('loans').select('id, loan_number, status, client_id').eq('id', loanId).single()
      if (error) throw error
      return data as { id: string; loan_number: number; status: string; client_id: string }
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
        .select('number, effective_status, total_pending, total_due')
        .eq('loan_id', loanId)
        .order('number')
      if (error) throw error
      return data as { number: number; effective_status: string; total_pending: number; total_due: number }[]
    }
  })

  const loan = loanQuery.data
  const inst = installmentsQuery.data ?? []
  const total = inst.length
  const next = inst.find((i) => i.effective_status !== 'paid')
  const amount = next ? (Number(next.total_pending) > 0 ? Number(next.total_pending) : Number(next.total_due)) : 0

  async function confirm() {
    if (!loanId || saving) return
    setSaving(true)
    setError(null)
    const { data, error } = await supabase.rpc('register_payment', {
      p_loan_id: loanId,
      p_payment_type: 'regular',
      p_amount: null,
      p_principal: 0,
      p_interest: 0,
      p_late_fee: 0,
      p_idempotency_key: crypto.randomUUID(),
      p_notes: null,
      p_payment_method: method,
      p_paid_at: new Date().toISOString()
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    const n = (data as any)?.receipt_number ?? (data as any)?.receiptNumber ?? null
    setReceipt(typeof n === 'number' ? n : null)
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
          </div>
          <button
            onClick={async () => {
              const text = `Recibo #${receipt} — ${clientQuery.data?.full_name ?? ''} — RD$ ${money0(amount)} (${PAYMENT_METHOD_LABEL[method] ?? method})`
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
            <p className="font-disp mt-1 text-3xl font-bold text-[var(--nc-text)]">RD$ {money0(amount)}</p>
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

          {error && <p className="text-sm text-red-400">{error}</p>}
          <button onClick={confirm} disabled={saving} className="block w-full rounded-xl bg-[#2563EB] py-3.5 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? 'Registrando…' : 'Confirmar pago'}
          </button>
        </>
      )}
    </div>
  )
}
