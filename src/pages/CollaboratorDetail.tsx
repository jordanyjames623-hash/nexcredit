import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { money, shortDate } from '@/lib/format'
import { useAuth } from '@/contexts/AuthContext'

const TABS = ['perfil', 'cartera', 'cobranza', 'comisiones', 'actividad'] as const
const TAB_LABEL: Record<(typeof TABS)[number], string> = {
  perfil: 'Perfil', cartera: 'Cartera', cobranza: 'Cobranza', comisiones: 'Puntos y comisiones', actividad: 'Actividad'
}

type Collaborator = { user_id: string; full_name: string; email: string; phone: string | null; is_active: boolean }
type LoanRow = { loan_id: string; client_name: string; loan_number: number; status: string; total_pending: number; days_overdue: number }
type CollectionRow = { loan_id: string; client_name: string; loan_number: number; stage: string; total_pending: number; days_overdue: number }
type CommissionSummary = { valid_points: number; level_name: string; final_commission: number; delinquency_percent: number | null }
type ActivityRow = { id: string; action: string; created_at: string; amount: number | null }

export function CollaboratorDetail() {
  const { id } = useParams<{ id: string }>()
  const { isOwner, hasPermission } = useAuth()
  
  const [tab, setTab] = useState<(typeof TABS)[number]>('perfil')

  const { data: collaborator } = useQuery({
    queryKey: ['collaborator-detail', id],
    enabled: isOwner || hasPermission('employees.manage'),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_collaborators')
      if (error) throw error
      return (data as Collaborator[]).find((c) => c.user_id === id) ?? null
    }
  })

  const loansQuery = useQuery({
    queryKey: ['collaborator-loans', id],
    enabled: tab === 'cartera',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collection_accounts')
        .select('loan_id, client_name, loan_number, loan_status, total_pending, days_overdue')
        .eq('assigned_to', id)
      if (error) throw error
      return (data as any[]).map((l) => ({ ...l, status: l.loan_status })) as LoanRow[]
    }
  })

  const collectionQuery = useQuery({
    queryKey: ['collaborator-collections', id],
    enabled: tab === 'cobranza',
    queryFn: async () => {
      const { data, error } = await supabase.from('collection_accounts').select('loan_id, client_name, loan_number, stage, total_pending, days_overdue')
        .eq('assigned_to', id).gt('days_overdue', 0)
      if (error) throw error
      return data as CollectionRow[]
    }
  })

  const commissionQuery = useQuery({
    queryKey: ['collaborator-commission', id],
    enabled: tab === 'comisiones',
    queryFn: async () => {
      const { data, error } = await supabase.rpc('commission_summary', { p_collaborator: id, p_period: 'month' })
      if (error) throw error
      return data as CommissionSummary
    }
  })

  const activityQuery = useQuery({
    queryKey: ['collaborator-activity', id],
    enabled: tab === 'actividad',
    queryFn: async () => {
      const { data, error } = await supabase.from('activity_logs').select('id, action, created_at, amount')
        .eq('user_id', id).order('created_at', { ascending: false }).limit(30)
      if (error) throw error
      return data as ActivityRow[]
    }
  })

  if (!isOwner && !hasPermission('employees.manage')) return <p className="text-sm text-content-muted">Solo el propietario o un gerente puede ver esta ficha.</p>
  if (!collaborator) return <p className="text-sm text-content-muted">Cargando…</p>

  return (
    <div className="space-y-6">
      <Link to="/colaboradores" className="inline-flex items-center gap-1.5 text-sm text-content-muted hover:text-content">
        <ArrowLeft size={16} /> Colaboradores
      </Link>

      <div className="glass-card p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-navy text-lg font-semibold text-on-navy">
            {(collaborator.full_name || collaborator.email).charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="t-h1 text-content">{collaborator.full_name || 'Sin nombre'}</h1>
            <p className="text-sm text-content-muted">{collaborator.email}{collaborator.phone ? ` · ${collaborator.phone}` : ''}</p>
            <span className={collaborator.is_active ? 'badge-success' : 'badge-neutral'}>{collaborator.is_active ? 'Activo' : 'Inactivo'}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'bg-primary-fill text-white' : 'glass-card text-content-muted'}`}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === 'perfil' && (
        <div className="glass-card p-5 text-sm text-content-muted">
          Gestiona los permisos, la contraseña y el acceso a préstamos ajenos de este colaborador desde{' '}
          <Link to="/colaboradores" className="text-primary hover:underline">Colaboradores</Link>.
        </div>
      )}

      {tab === 'cartera' && (
        <div className="glass-card">
          {(loansQuery.data?.length ?? 0) === 0 && <p className="px-5 py-8 text-center text-sm text-content-muted">Sin préstamos activos asignados.</p>}
          <ul className="divide-y divide-line">
            {loansQuery.data?.map((l) => (
              <li key={l.loan_id}>
                <Link to={`/prestamos/${l.loan_id}`} className="flex items-center justify-between px-5 py-3 hover:bg-background">
                  <p className="text-sm text-content">{l.client_name} <span className="text-content-muted">· #{l.loan_number}</span></p>
                  <p className="money text-sm font-semibold text-content">RD$ {money(l.total_pending)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'cobranza' && (
        <div className="glass-card">
          {(collectionQuery.data?.length ?? 0) === 0 && <p className="px-5 py-8 text-center text-sm text-content-muted">Sin cuentas vencidas.</p>}
          <ul className="divide-y divide-line">
            {collectionQuery.data?.map((c) => (
              <li key={c.loan_id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm text-content">{c.client_name} <span className="text-content-muted">· #{c.loan_number}</span></p>
                  <span className="badge-danger">{c.stage}</span>
                </div>
                <p className="money text-sm font-semibold text-danger">RD$ {money(c.total_pending)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'comisiones' && commissionQuery.data && (
        <div className="glass-card p-5">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div><dt className="text-xs text-content-muted">Puntos válidos</dt><dd className="text-lg font-semibold text-content">{commissionQuery.data.valid_points}</dd></div>
            <div><dt className="text-xs text-content-muted">Nivel</dt><dd className="text-lg font-semibold text-content">{commissionQuery.data.level_name}</dd></div>
            <div><dt className="text-xs text-content-muted">Morosidad</dt><dd className="text-lg font-semibold text-content">{commissionQuery.data.delinquency_percent === null ? 'Sin cartera' : `${commissionQuery.data.delinquency_percent}%`}</dd></div>
            <div><dt className="text-xs text-content-muted">Comisión (mes)</dt><dd className="money text-lg font-semibold text-success-text">RD$ {money(commissionQuery.data.final_commission)}</dd></div>
          </dl>
          <Link to="/comisiones" className="mt-4 inline-block text-xs text-primary hover:underline">Ver desglose completo →</Link>
        </div>
      )}

      {tab === 'actividad' && (
        <div className="glass-card divide-y divide-line">
          {(activityQuery.data?.length ?? 0) === 0 && <p className="px-5 py-8 text-center text-sm text-content-muted">Sin actividad registrada.</p>}
          {activityQuery.data?.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm text-content">{a.action}</p>
                <p className="text-xs text-content-muted">{shortDate(a.created_at.slice(0, 10))}</p>
              </div>
              {a.amount !== null && <p className="money text-sm text-content">RD$ {money(a.amount)}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
