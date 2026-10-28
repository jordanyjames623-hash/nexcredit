import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ACTION_LABEL } from '@/lib/activityLabels'

type LogRow = {
  id: string; user_name: string | null; action: string; entity_type: string | null
  client_id: string | null; loan_id: string | null; amount: number | null
  status: string; created_at: string; before_state: Record<string, unknown> | null; after_state: Record<string, unknown> | null
  ip_address: string | null; device_info: string | null
}
const ENTITY_LABEL: Record<string, string> = {
  client: 'Clientes', loan: 'Préstamos', payment: 'Pagos', collaborator: 'Colaboradores',
  collection_gestion: 'Cobranza', commission_period: 'Comisiones', business: 'Negocio'
}

const DELETION_ACTIONS = new Set(['client_deleted', 'payment_voided', 'all_data_wiped'])

export function ActivityLog() {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [userFilter, setUserFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [onlyDeletions, setOnlyDeletions] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [minAmount, setMinAmount] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['activity-log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('id, user_name, action, entity_type, client_id, loan_id, amount, status, created_at, before_state, after_state, ip_address, device_info')
        .order('created_at', { ascending: false })
        .limit(300)
      if (error) throw error
      return data as LogRow[]
    }
  })

  const users = useMemo(() => Array.from(new Set((data ?? []).map((l) => l.user_name).filter(Boolean))) as string[], [data])
  const actions = useMemo(() => Array.from(new Set((data ?? []).map((l) => l.action))), [data])
  const entities = useMemo(() => Array.from(new Set((data ?? []).map((l) => l.entity_type).filter(Boolean))) as string[], [data])

  const filtered = (data ?? []).filter((l) => {
    if (userFilter && l.user_name !== userFilter) return false
    if (actionFilter && l.action !== actionFilter) return false
    if (entityFilter && l.entity_type !== entityFilter) return false
    if (onlyDeletions && !DELETION_ACTIONS.has(l.action)) return false
    if (from && l.created_at.slice(0, 10) < from) return false
    if (to && l.created_at.slice(0, 10) > to) return false
    if (minAmount && (l.amount === null || Number(l.amount) < Number(minAmount))) return false
    return true
  })

  return (
    <div className="space-y-6">
      <h1 className="t-h1 text-content">Historial de actividad</h1>

      <div className="grid gap-3 glass-card p-4 sm:grid-cols-4 lg:grid-cols-7">
        <select aria-label="Filtrar por usuario" className="field-input" value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
          <option value="">Todos los usuarios</option>
          {users.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <select aria-label="Filtrar por acción" className="field-input" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
          <option value="">Todas las acciones</option>
          {actions.map((a) => <option key={a} value={a}>{ACTION_LABEL[a] ?? a}</option>)}
        </select>
        <select aria-label="Filtrar por módulo" className="field-input" value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
          <option value="">Todos los módulos</option>
          {entities.map((en) => <option key={en} value={en}>{ENTITY_LABEL[en] ?? en}</option>)}
        </select>
        <input aria-label="Desde" type="date" className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input aria-label="Hasta" type="date" className="field-input" value={to} onChange={(e) => setTo(e.target.value)} />
        <input aria-label="Monto mínimo" type="number" className="field-input money" placeholder="Monto mínimo" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-content">
          <input type="checkbox" checked={onlyDeletions} onChange={(e) => setOnlyDeletions(e.target.checked)} />
          Solo eliminaciones
        </label>
      </div>

      {isLoading && <p className="text-sm text-content-muted">Cargando…</p>}
      {error && <p className="text-sm text-danger">No se pudo cargar el historial.</p>}
      {!isLoading && filtered.length === 0 && (
        <p className="glass-card px-5 py-8 text-center text-sm text-content-muted">Sin actividad para este filtro.</p>
      )}

      <div className="divide-y divide-line glass-card">
        {filtered.map((l) => {
          const hasDiff = l.before_state || l.after_state || l.ip_address || l.device_info
          return (
            <div key={l.id} className={hasDiff ? 'cursor-pointer' : ''} onClick={() => hasDiff && setExpandedId(expandedId === l.id ? null : l.id)}>
              <div className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className={`text-sm ${DELETION_ACTIONS.has(l.action) ? 'text-danger font-medium' : 'text-content'}`}>
                    {ACTION_LABEL[l.action] ?? l.action}{hasDiff && <span className="ml-1.5 text-xs text-primary">(ver antes/después)</span>}
                  </p>
                  <p className="text-xs text-content-muted">{l.user_name ?? '—'} · {new Date(l.created_at).toLocaleString('es-DO')}</p>
                </div>
                {l.amount !== null && <p className="money text-sm text-content">RD$ {Number(l.amount).toFixed(2)}</p>}
              </div>
              {expandedId === l.id && hasDiff && (
                <div className="border-t border-line bg-background px-5 py-3 text-xs">
                  {(l.before_state || l.after_state) && (
                    <div className="mb-2 grid grid-cols-2 gap-3">
                      <div>
                        <p className="mb-1 font-semibold text-content-muted">Antes</p>
                        <pre className="whitespace-pre-wrap text-content-muted">{JSON.stringify(l.before_state, null, 1)}</pre>
                      </div>
                      <div>
                        <p className="mb-1 font-semibold text-content-muted">Después</p>
                        <pre className="whitespace-pre-wrap text-content-muted">{JSON.stringify(l.after_state, null, 1)}</pre>
                      </div>
                    </div>
                  )}
                  {(l.ip_address || l.device_info) && (
                    <p className="text-content-muted">
                      {l.ip_address && `IP: ${l.ip_address}`}{l.ip_address && l.device_info && ' · '}{l.device_info && `Dispositivo: ${l.device_info}`}
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
