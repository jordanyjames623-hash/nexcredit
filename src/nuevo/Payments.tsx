import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Banknote } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Receipt, type ReceiptData } from '@/components/Receipt'
import { money0, relDateEs, timeLabelEs, PAYMENT_TYPE_LABEL } from './lib'
import { PAYMENT_METHOD_LABEL } from '@/lib/format'
import { GreetingHeader } from './GreetingHeader'

// Pagos de la maqueta interactiva (SIN pildoras de filtro): subtitulo, total cobrado hoy y
// tarjetas por pago con fecha relativa, hora (si trae hora real), metodo y cuota. El boton
// inferior es dorado, como en la maqueta. Los colores salen de var(--nc-*).
// La cuota viene de la tabla payments (installment_id) con lectura a prueba de fallos: si
// no esta disponible, la fila muestra el tipo de pago en su lugar.
type PaymentRow = {
  id: string; loan_id: string; loan_number: number; client_name: string
  payment_type: string; payment_method: string | null; total_amount: number; paid_at: string; status: string; receipt_number: number
}

export function Payments() {
  const [openReceipt, setOpenReceipt] = useState<{ data: ReceiptData; clientName: string; loanNumber: number } | null>(null)
  const [q, setQ] = useState('')
  const [loadingReceiptId, setLoadingReceiptId] = useState<string | null>(null)

  const todayLocal = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' })
  const rdDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' })

  async function openPaymentReceipt(p: PaymentRow) {
    setLoadingReceiptId(p.id)
    const { data, error } = await supabase
      .from('payment_details')
      .select('receipt_number, payment_type, paid_at, principal_amount, interest_amount, late_fee_amount, total_amount, pending_principal_after, next_due_date, next_installment_amount, status, payment_method')
      .eq('id', p.id)
      .single()
    setLoadingReceiptId(null)
    if (!error && data) {
      // La cuota que cubrió el pago: misma lectura que la lista (payments.installment_id).
      const instId = instByPayment?.get(p.id) ?? null
      const instDetail = instId ? instDetailById.get(instId) : undefined
      const total = instDetail ? progress?.get(instDetail.loan_id) : undefined
      const enriched = {
        ...(data as ReceiptData),
        installment_number: instDetail?.number ?? null,
        installment_total: total ?? null
      } as ReceiptData
      setOpenReceipt({ data: enriched, clientName: p.client_name, loanNumber: p.loan_number })
    }
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['nuevo_payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_details')
        .select('id, loan_id, loan_number, client_name, payment_type, payment_method, total_amount, paid_at, status, receipt_number')
        .order('paid_at', { ascending: false })
        .limit(300)
      if (error) throw error
      return data as PaymentRow[]
    }
  })
  const installmentMapQuery = useQuery({
    queryKey: ['nuevo_payment_installments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('payments').select('id, installment_id').limit(1000)
      if (error) return null
      return new Map((data ?? []).map((r: any) => [r.id, r.installment_id as string | null]))
    }
  })
  const installmentDetailsQuery = useQuery({
    queryKey: ['nuevo_payment_installment_details'],
    queryFn: async () => {
      const { data, error } = await supabase.from('installment_details').select('installment_id, loan_id, number')
      if (error) return null
      return data as { installment_id: string; loan_id: string; number: number }[] | null
    }
  })
  const progressQuery = useQuery({
    queryKey: ['nuevo_payment_progress'],
    queryFn: async () => {
      const { data, error } = await supabase.from('installment_details').select('loan_id, status')
      if (error) return null
      const map = new Map<string, number>()
      ;(data ?? []).forEach((r: any) => map.set(r.loan_id, (map.get(r.loan_id) ?? 0) + 1))
      return map
    }
  })

  const list = data ?? []
  const needle = q.trim().toLowerCase()
  const visibleList = list.filter((p) => !needle || p.client_name.toLowerCase().includes(needle) || String(p.receipt_number).includes(needle))
  const todayList = list.filter((p) => p.status === 'active' && rdDate(p.paid_at) === todayLocal)
  const todayTotal = todayList.reduce((sum, p) => sum + Number(p.total_amount), 0)
  const instByPayment = installmentMapQuery.data ?? null
  const instDetailById = new Map((installmentDetailsQuery.data ?? []).map((r) => [r.installment_id, r]))
  const progress = progressQuery.data ?? null

  return (
    <div className="space-y-4">
      <GreetingHeader />
      <div>
        <h1 className="text-[28px] font-bold leading-tight text-[var(--nc-text)]">Pagos</h1>
        <p className="text-sm text-[var(--nc-muted)]">El dinero que ha entrado, en orden y con su método. Solo de tu negocio.</p>
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pago por cliente o recibo…"
        className="w-full rounded-xl bg-[var(--nc-card)] px-4 py-3 text-sm text-[var(--nc-text)] outline-none placeholder:text-[var(--nc-faint)] focus:ring-2 focus:ring-[#2563EB]" />

      <div className="rounded-[22px] bg-gradient-to-br from-[#2563EB] to-[#3B82F6] p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/80">Cobrado hoy</p>
        <p className="font-disp mt-1 text-3xl font-bold text-white">RD$ {money0(todayTotal)}</p>
        <p className="text-sm text-white/80">{todayList.length} pagos registrados hoy</p>
      </div>

      {isLoading && <p className="text-sm text-[var(--nc-muted)]">Cargando…</p>}
      {error && <p className="text-sm text-red-400">No se pudieron cargar los pagos.</p>}
      {!isLoading && list.length === 0 && (
        <div className="rounded-2xl bg-[var(--nc-card)] px-4 py-6 text-center text-sm text-[var(--nc-muted)]">Sin pagos registrados.</div>
      )}
      {!isLoading && list.length > 0 && visibleList.length === 0 && (
        <div className="rounded-2xl bg-[var(--nc-card)] px-4 py-6 text-center text-sm text-[var(--nc-muted)]">Sin pagos con ese criterio.</div>
      )}

      <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
        {visibleList.map((p) => {
          const voided = p.status === 'voided'
          const methodPart = p.payment_method ? (PAYMENT_METHOD_LABEL[p.payment_method] ?? p.payment_method) : null
          const typePart = PAYMENT_TYPE_LABEL[p.payment_type] ?? p.payment_type
          const instId = instByPayment?.get(p.id) ?? null
          const instDetail = instId ? instDetailById.get(instId) : undefined
          const total = instDetail ? progress?.get(instDetail.loan_id) : undefined
          const cuotaPart = instDetail && total ? `Cuota ${instDetail.number} de ${total}` : null
          const time = timeLabelEs(p.paid_at)
          // Regla de la maqueta: la cuota regular muestra metodo + "Cuota N de M"; cualquier
          // otro tipo muestra metodo + tipo ("Abono parcial", "Abono a capital"...), sin cuota.
          const parts: (string | null)[] = [relDateEs(rdDate(p.paid_at)), time || null]
          if (p.payment_type === 'regular') {
            if (methodPart) parts.push(methodPart)
            parts.push(cuotaPart ?? typePart)
          } else {
            if (methodPart) parts.push(methodPart)
            parts.push(typePart)
          }
          if (voided) parts.push('Anulado')
          const labelParts = parts.filter(Boolean)
          return (
            <button key={p.id} onClick={() => openPaymentReceipt(p)} disabled={loadingReceiptId === p.id}
              className="w-full rounded-[22px] bg-[var(--nc-card)] p-4 text-left active:scale-[0.99]">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--nc-soft)] text-[#3B82F6]"><Banknote size={18} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--nc-text)]">{p.client_name}</p>
                  <p className="text-xs text-[var(--nc-muted)]">{labelParts.join(' · ')}</p>
                </div>
                <span className={`shrink-0 font-disp text-sm font-bold ${voided ? 'text-[var(--nc-faint)] line-through' : 'text-green-400'}`}> 
                  +RD$ {money0(p.total_amount)}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <Link to="/prestamos" className="block rounded-xl bg-[#F59E0B] py-3 text-center text-sm font-semibold text-[#0B1120]">+ Registrar un pago</Link>

      {openReceipt && (
        <Receipt
          payment={openReceipt.data}
          clientName={openReceipt.clientName}
          loanNumber={openReceipt.loanNumber}
          onClose={() => setOpenReceipt(null)}
        />
      )}
    </div>
  )
}
