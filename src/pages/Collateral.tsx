import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, ShieldOff, Image } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { money } from '@/lib/format'
import { useAuth } from '@/contexts/AuthContext'

type LoanRow = {
  id: string; loan_number: number; client_id: string; status: string
  has_collateral: boolean; collateral_description: string | null; collateral_value: number | null; collateral_image_path: string | null
}
type ClientRow = { id: string; full_name: string }

export function CollateralAdmin() {
  const { isOwner } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['collateral-admin'],
    enabled: isOwner,
    queryFn: async () => {
      const [loansRes, clientsRes] = await Promise.all([
        supabase.from('loans').select('id, loan_number, client_id, status, has_collateral, collateral_description, collateral_value, collateral_image_path')
          .eq('status', 'active').is('deleted_at', null),
        supabase.from('clients').select('id, full_name')
      ])
      if (loansRes.error) throw loansRes.error
      if (clientsRes.error) throw clientsRes.error
      const names = new Map((clientsRes.data as ClientRow[]).map((c) => [c.id, c.full_name]))
      return (loansRes.data as LoanRow[]).map((l) => ({ ...l, client_name: names.get(l.client_id) ?? '—' }))
    }
  })

  if (!isOwner) return <p className="text-sm text-content-muted">Solo el propietario puede ver esta sección.</p>

  const withCollateral = (data ?? []).filter((l) => l.has_collateral)
  const withoutCollateral = (data ?? []).filter((l) => !l.has_collateral)
  const totalValue = withCollateral.reduce((s, l) => s + Number(l.collateral_value ?? 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="t-h1 text-content">Garantías</h1>
        <p className="text-sm text-content-muted">Préstamos activos con y sin garantía registrada.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="glass-card p-4">
          <p className="text-xs text-content-muted">Préstamos con garantía</p>
          <p className="text-xl font-semibold text-success-text">{withCollateral.length}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-content-muted">Sin garantía</p>
          <p className="text-xl font-semibold text-danger">{withoutCollateral.length}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-content-muted">Valor estimado total</p>
          <p className="money text-xl font-semibold text-content">RD$ {money(totalValue)}</p>
        </div>
      </div>

      {isLoading && <p className="text-sm text-content-muted">Cargando…</p>}

      <div className="glass-card divide-y divide-line">
        {(data ?? []).map((l: any) => (
          <Link key={l.id} to={`/prestamos/${l.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-background">
            <div className="flex items-center gap-3">
              {l.has_collateral ? <ShieldCheck size={16} className="text-success-text" /> : <ShieldOff size={16} className="text-danger" />}
              <div>
                <p className="text-sm text-content">{l.client_name} <span className="text-content-muted">· #{l.loan_number}</span></p>
                {l.has_collateral && (
                  <p className="flex items-center gap-1 text-xs text-content-muted">
                    {l.collateral_description || 'Sin descripción'}
                    {l.collateral_image_path && <Image size={12} className="text-primary" />}
                  </p>
                )}
              </div>
            </div>
            {l.has_collateral && l.collateral_value !== null && (
              <p className="money text-sm font-semibold text-content">RD$ {money(l.collateral_value)}</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
