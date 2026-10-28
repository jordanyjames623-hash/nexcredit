import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getPortalToken, clearPortalSession } from '@/lib/portalAuth'
import { money, shortDate, dateTime, PAYMENT_METHOD_LABEL } from '@/lib/format'
import { PortalLayout } from './PortalLayout'

const INSTALLMENT_LABEL: Record<string, string> = { paid: 'Pagada', overdue: 'Vencida', partial: 'Parcial', pending: 'Pendiente' }
const INSTALLMENT_BADGE: Record<string, string> = { paid: 'badge-success', overdue: 'badge-danger', partial: 'badge-warning', pending: 'badge-neutral' }
const PAYMENT_TYPE_LABEL: Record<string, string> = { regular: 'Cuota regular', principal: 'Abono a capital', interest: 'Interés', late_fee: 'Mora', custom: 'Personalizado' }

type Detail = {
  loan: { id: string; loan_number: number; status: string; principal: number; current_principal: number; interest_rate: number; frequency: string; first_payment_date: string }
  installments: { number: number; due_date: string; total_due: number; total_paid: number; total_pending: number; effective_status: string }[]
  payments: { receipt_number: number; paid_at: string; total_amount: number; payment_type: string; payment_method: string; status: string }[]
}

export function PortalLoanDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const token = getPortalToken()!

  const { data, isLoading } = useQuery({
    queryKey: ['portal-loan-detail', token, id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('portal_get_loan_detail', { p_token: token, p_loan_id: id })
      if (error) { if (error.message?.includes('Sesión')) { clearPortalSession(); navigate('/portal/entrar', { replace: true }) } throw error }
      return data as Detail
    },
    retry: false
  })

  return (
    <PortalLayout>
      <Link to="/portal" className="flex items-center gap-1.5 text-sm text-content-muted hover:text-content">
        <ArrowLeft size={15} aria-hidden="true" /> Volver
      </Link>

      {isLoading ? (
        <p className="text-sm text-content-muted">Cargando…</p>
      ) : !data ? (
        <p className="glass-card p-4 text-sm text-content-muted">No se encontró el préstamo.</p>
      ) : (
        <>
          <div className="glass-card space-y-3 p-5">
            <h1 className="t-h2 text-content">Préstamo PR-{String(data.loan.loan_number).padStart(4, '0')}</h1>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="t-label">Capital original</p><p className="money font-medium text-content">RD$ {money(data.loan.principal)}</p></div>
              <div><p className="t-label">Capital pendiente</p><p className="money font-medium text-content">RD$ {money(data.loan.current_principal)}</p></div>
              <div><p className="t-label">Tasa</p><p className="font-medium text-content">{data.loan.interest_rate}%</p></div>
              <div><p className="t-label">Frecuencia</p><p className="font-medium text-content capitalize">{data.loan.frequency === 'weekly' ? 'Semanal' : data.loan.frequency === 'biweekly' ? 'Quincenal' : 'Mensual'}</p></div>
            </div>
          </div>

          <div className="glass-card p-5">
            <h2 className="mb-3 text-sm font-semibold text-content">Calendario de pagos</h2>
            <div className="scroll-thin overflow-x-auto">
              <table className="table-modern min-w-[420px]">
                <thead><tr><th>#</th><th>Fecha</th><th className="text-right">Monto</th><th>Estado</th></tr></thead>
                <tbody>
                  {data.installments.map((i) => (
                    <tr key={i.number}>
                      <td className="text-content-muted">{i.number}</td>
                      <td className="text-content-muted">{shortDate(i.due_date)}</td>
                      <td className="money text-right text-content">{money(i.total_due)}</td>
                      <td><span className={INSTALLMENT_BADGE[i.effective_status] ?? 'badge-neutral'}>{INSTALLMENT_LABEL[i.effective_status] ?? i.effective_status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="glass-card p-5">
            <h2 className="mb-3 text-sm font-semibold text-content">Tus pagos</h2>
            {data.payments.length === 0 ? (
              <p className="text-sm text-content-muted">Aún no hay pagos registrados.</p>
            ) : (
              <div className="space-y-2">
                {data.payments.map((p) => {
                  const { date, time } = dateTime(p.paid_at)
                  return (
                    <div key={p.receipt_number} className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-sm">
                      <div>
                        <p className="text-content">Recibo #{p.receipt_number} · {PAYMENT_TYPE_LABEL[p.payment_type] ?? p.payment_type}</p>
                        <p className="text-xs text-content-muted">{date} · {time} · {PAYMENT_METHOD_LABEL[p.payment_method] ?? p.payment_method}</p>
                      </div>
                      <div className="text-right">
                        <p className={`money font-semibold ${p.status === 'voided' ? 'text-content-muted line-through' : 'text-success-text'}`}>RD$ {money(p.total_amount)}</p>
                        {p.status === 'voided' && <span className="badge-danger">Anulado</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </PortalLayout>
  )
}
