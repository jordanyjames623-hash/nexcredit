import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { money, shortDate } from '@/lib/format'
import { Receipt, type ReceiptData } from '@/components/Receipt'

type PaymentRow = {
  id: string; loan_id: string; loan_number: number; client_name: string
  payment_type: string; total_amount: number; paid_at: string; status: string; receipt_number: number
}

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  regular: 'Cuota regular', principal: 'Abono a capital', interest: 'Interés', late_fee: 'Mora', custom: 'Personalizado'
}
const PERIODS = [
  { v: 'all', l: 'Todos' }, { v: 'today', l: 'Hoy' }, { v: 'week', l: 'Esta semana' }, { v: 'month', l: 'Este mes' }
] as const

export function Payments() {
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['v']>('all')
  const [openReceipt, setOpenReceipt] = useState<{ data: ReceiptData; clientName: string; loanNumber: number } | null>(null)
  const [loadingReceiptId, setLoadingReceiptId] = useState<string | null>(null)

  async function openPaymentReceipt(p: PaymentRow) {
    setLoadingReceiptId(p.id)
    const { data, error } = await supabase
      .from('payment_details')
      .select('receipt_number, payment_type, paid_at, principal_amount, interest_amount, late_fee_amount, total_amount, pending_principal_after, next_due_date, next_installment_amount')
      .eq('id', p.id)
      .single()
    setLoadingReceiptId(null)
    if (!error && data) setOpenReceipt({ data: data as ReceiptData, clientName: p.client_name, loanNumber: p.loan_number })
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['all-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_details')
        .select('id, loan_id, loan_number, client_name, payment_type, total_amount, paid_at, status, receipt_number')
        .order('paid_at', { ascending: false })
        .limit(300)
      if (error) throw error
      return data as PaymentRow[]
    }
  })

  const filtered = useMemo(() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfWeek = new Date(startOfToday.getTime() - startOfToday.getDay() * 86400000)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    return (data ?? []).filter((p) => {
      if (search && !p.client_name.toLowerCase().includes(search.toLowerCase()) && !String(p.loan_number).includes(search)) return false
      if (period === 'all') return true
      const paid = new Date(p.paid_at)
      if (period === 'today') return paid >= startOfToday
      if (period === 'week') return paid >= startOfWeek
      if (period === 'month') return paid >= startOfMonth
      return true
    })
  }, [data, search, period])

  const total = filtered.filter((p) => p.status === 'active').reduce((s, p) => s + Number(p.total_amount), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="t-h1 text-content">Pagos</h1>
        <p className="text-sm text-content-muted">Consulta y administra los pagos de todo tu negocio.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-auto sm:min-w-[14rem] sm:max-w-sm sm:flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
          <input aria-label="Buscar cliente o préstamo…" className="field-input pl-9" placeholder="Buscar cliente o préstamo…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <button key={p.v} onClick={() => setPeriod(p.v)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${period === p.v ? 'bg-primary-fill text-white' : 'glass-card text-content-muted hover:text-content'}`}>
              {p.l}
            </button>
          ))}
        </div>
      </div>

      <div className="glass-card p-4">
        <p className="text-xs text-content-muted">Total en este filtro</p>
        <p className="money text-xl font-semibold text-success-text">RD$ {money(total)}</p>
      </div>

      {isLoading && <p className="text-sm text-content-muted">Cargando…</p>}
      {error && <p className="text-sm text-danger">No se pudieron cargar los pagos.</p>}
      {!isLoading && filtered.length === 0 && <div className="glass-card px-5 py-10 text-center text-sm text-content-muted">Sin pagos en este filtro.</div>}

      <div className="glass-card divide-y divide-line">
        {filtered.map((p) => (
          <button
            key={p.id}
            onClick={() => openPaymentReceipt(p)}
            disabled={loadingReceiptId === p.id}
            className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-background"
          >
            <div className="min-w-0">
              <p className={`truncate text-sm font-medium ${p.status === 'voided' ? 'text-content-muted line-through' : 'text-content'}`}>
                {p.client_name} <span className="text-content-muted">· #{p.loan_number}</span>
              </p>
              <p className="text-xs text-content-muted">{PAYMENT_TYPE_LABEL[p.payment_type] ?? p.payment_type} · Recibo #{p.receipt_number} · {shortDate(p.paid_at.slice(0, 10))}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className={`money text-sm font-semibold ${p.status === 'voided' ? 'text-content-muted line-through' : 'text-success-text'}`}>RD$ {money(p.total_amount)}</p>
              {p.status === 'voided' ? <span className="badge-danger">Anulado</span> : <span className="text-xs text-primary">{loadingReceiptId === p.id ? 'Abriendo…' : 'Ver comprobante'}</span>}
            </div>
          </button>
        ))}
      </div>

      {openReceipt && (
        <Receipt payment={openReceipt.data} clientName={openReceipt.clientName} loanNumber={openReceipt.loanNumber} onClose={() => setOpenReceipt(null)} />
      )}
    </div>
  )
}
