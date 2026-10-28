import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Map as MapIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { money } from '@/lib/format'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useAuth } from '@/contexts/AuthContext'

type RouteBalance = {
  route_id: string
  name: string
  is_active: boolean
  client_count: number
  total_pending: number
  overdue_clients: number
  scoped_to_viewer: boolean
}
type Collector = { route_id: string; full_name: string }
type Collection = { expected_in_period: number; collected_in_period: number }

export function RoutesPage() {
  const qc = useQueryClient()
  const isOnline = useOnlineStatus()
  const { isOwner, hasPermission } = useAuth()
  const canManage = isOwner || hasPermission('routes.manage')
  const [showForm, setShowForm] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['route-balances'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('route_balances')
        .select('route_id, name, is_active, client_count, total_pending, overdue_clients, scoped_to_viewer')
        .order('name')
      if (error) throw error
      return data as RouteBalance[]
    }
  })

  const { data: collectors } = useQuery({
    queryKey: ['route-collectors-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('route_collector_details').select('route_id, full_name')
      if (error) throw error
      return data as Collector[]
    }
  })
  const collectorByRoute = new Map<string, string>()
  ;(collectors ?? []).forEach((c) => { if (!collectorByRoute.has(c.route_id)) collectorByRoute.set(c.route_id, c.full_name) })

  const { data: collections } = useQuery({
    queryKey: ['route-collections', (data ?? []).map((r) => r.route_id).join(',')],
    enabled: (data?.length ?? 0) > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        (data ?? []).map(async (r) => {
          const { data: c } = await supabase.rpc('route_collections', { p_route_id: r.route_id, p_period: 'month' })
          return [r.route_id, c as Collection] as const
        })
      )
      return new Map(entries)
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="t-h1 text-content">Rutas</h1>
          <p className="text-sm text-content-muted">Organiza tus cobradores y clientes por zona.</p>
        </div>
        {canManage && (
          <button className="btn-solid" disabled={!isOnline} onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancelar' : 'Nueva ruta'}
          </button>
        )}
      </div>

      {showForm && (
        <NewRouteForm onDone={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['route-balances'] }) }} />
      )}

      {isLoading && <p className="text-sm text-content-muted">Cargando…</p>}
      {error && <p className="text-sm text-danger">No se pudo cargar la lista de rutas.</p>}
      {data?.length === 0 && !isLoading && (
        <div className="glass-card px-5 py-10 text-center text-sm text-content-muted">Aún no hay rutas creadas.</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((r) => {
          const col = collections?.get(r.route_id)
          const percent = col && col.expected_in_period > 0 ? Math.min(100, Math.round((col.collected_in_period / col.expected_in_period) * 100)) : null
          return (
            <Link key={r.route_id} to={`/rutas/${r.route_id}`} className="glass-card p-5 transition-transform hover:-translate-y-0.5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><MapIcon size={16} /></div>
                  <p className="text-sm font-semibold text-content">{r.name}</p>
                </div>
                {!r.is_active && <span className="badge-neutral">Inactiva</span>}
              </div>
              <p className="mt-3 text-xs text-content-muted">
                {collectorByRoute.get(r.route_id) ?? 'Sin cobrador'} · {r.client_count} cliente{r.client_count === 1 ? '' : 's'}
                {r.overdue_clients > 0 && <span className="text-danger"> · {r.overdue_clients} vencido{r.overdue_clients === 1 ? '' : 's'}</span>}
              </p>
              <p className="money mt-3 text-lg font-semibold text-content">RD$ {money(r.total_pending)}</p>
              <p className="text-xs text-content-muted">
                {r.scoped_to_viewer ? 'por cobrar de lo que tú ves (puede haber más en esta ruta)' : 'por cobrar'}
              </p>
              {percent !== null && (
                <div className="mt-3">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-success" style={{ width: `${percent}%` }} />
                  </div>
                  <p className="mt-1 text-right text-xs text-content-muted">{percent}% cobrado este mes</p>
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function NewRouteForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('routes').insert({
        name: name.trim(),
        description: description.trim() || null
      })
      if (error) throw error
    },
    onSuccess: onDone,
    onError: (e: any) => setError(e.message ?? 'No se pudo crear la ruta.')
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('El nombre es obligatorio.'); return }
    mutation.mutate()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 glass-card p-5">
      {error && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="name">Nombre de la ruta</label>
          <input id="name" required className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ruta Norte" />
        </div>
        <div>
          <label className="field-label" htmlFor="description">Descripción (opcional)</label>
          <input id="description" className="field-input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
      <button type="submit" disabled={mutation.isPending} className="btn-solid">
        {mutation.isPending ? 'Guardando…' : 'Guardar ruta'}
      </button>
    </form>
  )
}
