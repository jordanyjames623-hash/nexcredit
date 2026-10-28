import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Wallet, Phone } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getPortalToken, clearPortalSession } from '@/lib/portalAuth'
import { money, shortDate } from '@/lib/format'
import { PortalLayout } from './PortalLayout'

type Summary = {
  client_name: string; business_name: string; business_logo_url: string | null
  business_phone: string | null; business_whatsapp: string | null
  loans_active: number; total_pending: number
}
type LoanRow = {
  id: string; loan_number: number; status: string; principal: number; current_principal: number
  next_due_date: string | null; total_pending: number
}

export function PortalSummary() {
  const navigate = useNavigate()
  const token = getPortalToken()!

  const summary = useQuery({
    queryKey: ['portal-summary', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('portal_get_summary', { p_token: token })
      if (error) { clearPortalSession(); navigate('/portal/entrar', { replace: true }); throw error }
      return data as Summary
    },
    retry: false
  })

  const loans = useQuery({
    queryKey: ['portal-loans', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('portal_get_loans', { p_token: token })
      if (error) throw error
      return data as LoanRow[]
    },
    retry: false
  })

  return (
    <PortalLayout>
      {summary.isLoading ? (
        <p className="text-sm text-content-muted">Cargando…</p>
      ) : summary.data ? (
        <>
          <div className="glass-card flex items-center gap-3 p-4">
            {summary.data.business_logo_url ? (
              <img src={summary.data.business_logo_url} alt="" className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                {summary.data.business_name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold text-content">{summary.data.business_name}</p>
              {(summary.data.business_phone || summary.data.business_whatsapp) && (
                <p className="flex items-center gap-1 text-xs text-content-muted">
                  <Phone size={12} aria-hidden="true" /> {summary.data.business_phone || summary.data.business_whatsapp}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="glass-card p-4">
              <p className="t-label">Préstamos activos</p>
              <p className="t-kpi text-content">{summary.data.loans_active}</p>
            </div>
            <div className="glass-card p-4">
              <p className="t-label">Total pendiente</p>
              <p className="money text-xl font-bold text-primary-dark">RD$ {money(summary.data.total_pending)}</p>
            </div>
          </div>
        </>
      ) : null}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-content">Tus préstamos</h2>
        {loans.isLoading ? (
          <p className="text-sm text-content-muted">Cargando…</p>
        ) : (loans.data?.length ?? 0) === 0 ? (
          <p className="glass-card p-4 text-sm text-content-muted">No tienes préstamos registrados.</p>
        ) : (
          <div className="space-y-2">
            {loans.data!.map((l) => (
              <Link key={l.id} to={`/portal/prestamos/${l.id}`} className="glass-card card-hover flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Wallet size={16} aria-hidden="true" /></span>
                  <div>
                    <p className="text-sm font-semibold text-content">Préstamo PR-{String(l.loan_number).padStart(4, '0')}</p>
                    <p className="text-xs text-content-muted">
                      {l.status === 'paid' ? 'Pagado completo' : l.next_due_date ? `Próximo pago: ${shortDate(l.next_due_date)}` : 'Al día'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-right">
                  <span className="money text-sm font-semibold text-content">RD$ {money(l.total_pending)}</span>
                  <ChevronRight size={16} className="text-content-muted" aria-hidden="true" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  )
}
