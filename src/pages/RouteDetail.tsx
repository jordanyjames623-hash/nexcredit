import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { money } from '@/lib/format'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useAuth } from '@/contexts/AuthContext'
import { RouteMap, type MapClient } from '@/components/RouteMap'

type RouteRow = { id: string; name: string; description: string | null; is_active: boolean }
type Balance = {
  client_count: number; pending_principal: number; pending_interest: number
  pending_late_fee: number; total_pending: number; overdue_clients: number; scoped_to_viewer: boolean
}
type ClientOption = { id: string; full_name: string; phone: string | null; address: string | null; latitude: number | null; longitude: number | null }
type RouteClientRow = { client_id: string; position: number }
type Collector = { user_id: string; full_name: string; assigned_at: string }
type Collaborator = { user_id: string; full_name: string }

export function RouteDetail() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const isOnline = useOnlineStatus()
  const { isOwner, hasPermission } = useAuth()
  const canManage = (isOwner || hasPermission('routes.manage')) && isOnline

  const routeQuery = useQuery({
    queryKey: ['route', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('routes').select('id, name, description, is_active').eq('id', id).single()
      if (error) throw error
      return data as RouteRow
    }
  })

  const balanceQuery = useQuery({
    queryKey: ['route-balance', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('route_balances')
        .select('client_count, pending_principal, pending_interest, pending_late_fee, total_pending, overdue_clients, scoped_to_viewer')
        .eq('route_id', id)
        .maybeSingle()
      if (error) throw error
      return (data as Balance) ?? { client_count: 0, pending_principal: 0, pending_interest: 0, pending_late_fee: 0, total_pending: 0, overdue_clients: 0, scoped_to_viewer: false }
    }
  })

  const allClientsQuery = useQuery({
    queryKey: ['clients-picker'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, full_name, phone, address, latitude, longitude').is('deleted_at', null).order('full_name')
      if (error) throw error
      return data as ClientOption[]
    }
  })

  const routeClientsQuery = useQuery({
    queryKey: ['route-clients', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('route_clients').select('client_id, position').eq('route_id', id).order('position')
      if (error) throw error
      return data as RouteClientRow[]
    }
  })

  const collectorsQuery = useQuery({
    queryKey: ['route-collectors', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('route_collector_details').select('user_id, full_name, assigned_at').eq('route_id', id)
      if (error) throw error
      return data as Collector[]
    }
  })

  const collaboratorsQuery = useQuery({
    queryKey: ['collaborators-picker'],
    enabled: canManage,
    queryFn: async () => {
      const { data: members, error: mErr } = await supabase
        .from('business_members').select('user_id').eq('role', 'collaborator').eq('is_active', true)
      if (mErr) throw mErr
      const ids = (members ?? []).map((m) => m.user_id)
      if (ids.length === 0) return [] as Collaborator[]
      const { data: profiles, error: pErr } = await supabase.from('profiles').select('id, full_name').in('id', ids)
      if (pErr) throw pErr
      return ids.map((uid) => ({ user_id: uid, full_name: profiles?.find((p) => p.id === uid)?.full_name || 'Sin nombre' }))
    }
  })

  function invalidateRoute() {
    qc.invalidateQueries({ queryKey: ['route-clients', id] })
    qc.invalidateQueries({ queryKey: ['route-balance', id] })
    qc.invalidateQueries({ queryKey: ['route-balances'] })
    qc.invalidateQueries({ queryKey: ['route-collectors', id] })
  }

  const addClient = useMutation({
    mutationFn: async (clientId: string) => {
      const position = routeClientsQuery.data?.length ?? 0
      const { error } = await supabase.from('route_clients').insert({ route_id: id, client_id: clientId, position })
      if (error) throw error
    },
    onSuccess: invalidateRoute,
    onError: (e: any) => window.alert(e.message ?? 'No se pudo agregar el cliente.')
  })

  const removeClient = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase.from('route_clients').delete().eq('route_id', id).eq('client_id', clientId)
      if (error) throw error
    },
    onSuccess: invalidateRoute,
    onError: (e: any) => window.alert(e.message ?? 'No se pudo quitar el cliente.')
  })

  const addCollector = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('route_collectors').insert({ route_id: id, user_id: userId })
      if (error) throw error
    },
    onSuccess: invalidateRoute,
    onError: (e: any) => window.alert(e.message ?? 'No se pudo asignar el cobrador.')
  })

  const removeCollector = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('route_collectors').delete().eq('route_id', id).eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: invalidateRoute,
    onError: (e: any) => window.alert(e.message ?? 'No se pudo quitar el cobrador.')
  })

  const [clientPick, setClientPick] = useState('')
  const [collectorPick, setCollectorPick] = useState('')

  const clientsInRoute = useMemo(() => {
    const byId = new Map((allClientsQuery.data ?? []).map((c) => [c.id, c]))
    return (routeClientsQuery.data ?? [])
      .map((rc) => byId.get(rc.client_id))
      .filter((c): c is ClientOption => Boolean(c))
  }, [allClientsQuery.data, routeClientsQuery.data])

  const mapClients = useMemo<MapClient[]>(() =>
    clientsInRoute
      .filter((c): c is ClientOption & { latitude: number; longitude: number } => c.latitude !== null && c.longitude !== null)
      .map((c) => ({ id: c.id, full_name: c.full_name, address: c.address, latitude: c.latitude, longitude: c.longitude })),
    [clientsInRoute])
  const clientsWithoutLocation = useMemo(() => clientsInRoute.filter((c) => c.latitude === null || c.longitude === null), [clientsInRoute])

  const availableClients = useMemo(() => {
    const inRoute = new Set((routeClientsQuery.data ?? []).map((rc) => rc.client_id))
    return (allClientsQuery.data ?? []).filter((c) => !inRoute.has(c.id))
  }, [allClientsQuery.data, routeClientsQuery.data])

  const availableCollaborators = useMemo(() => {
    const assigned = new Set((collectorsQuery.data ?? []).map((c) => c.user_id))
    return (collaboratorsQuery.data ?? []).filter((c) => !assigned.has(c.user_id))
  }, [collaboratorsQuery.data, collectorsQuery.data])

  if (routeQuery.isLoading) return <p className="text-sm text-content-muted">Cargando…</p>
  if (routeQuery.error || !routeQuery.data) return <p className="text-sm text-danger">Ruta no encontrada.</p>
  const route = routeQuery.data
  const balance = balanceQuery.data

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="t-h1 text-content">{route.name}</h1>
          {route.description && <p className="text-sm text-content-muted">{route.description}</p>}
        </div>
        <Link to="/rutas" className="text-sm text-primary hover:underline">Todas las rutas</Link>
      </div>

      {balance && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="glass-card p-4">
            <p className="text-xs text-content-muted">Clientes</p>
            <p className="mt-1 text-lg font-semibold text-content">{balance.client_count}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs text-content-muted">Vencidos</p>
            <p className={`mt-1 text-lg font-semibold ${balance.overdue_clients > 0 ? 'text-danger' : 'text-content'}`}>{balance.overdue_clients}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs text-content-muted">Mora pendiente</p>
            <p className="money mt-1 text-lg font-semibold text-content">RD$ {money(balance.pending_late_fee)}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs text-content-muted">Total por cobrar{balance.scoped_to_viewer ? ' (solo lo tuyo)' : ''}</p>
            <p className="money mt-1 text-lg font-semibold text-content">RD$ {money(balance.total_pending)}</p>
            {balance.scoped_to_viewer && <p className="mt-1 text-[11px] text-danger">Puede haber más préstamos en esta ruta que no ves.</p>}
          </div>
        </div>
      )}

      <div className="glass-card">
        <div className="ledger-rule flex items-center justify-between px-5 py-3">
          <h2 className="text-sm font-semibold text-content">Clientes de la ruta</h2>
        </div>
        {canManage && (
          <div className="flex gap-2 border-b border-line px-5 py-3">
            <select aria-label="Cliente a agregar" className="field-input" value={clientPick} onChange={(e) => setClientPick(e.target.value)}>
              <option value="">Agregar cliente…</option>
              {availableClients.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
            <button
              className="btn-secondary whitespace-nowrap"
              disabled={!clientPick || addClient.isPending}
              onClick={() => { addClient.mutate(clientPick); setClientPick('') }}
            >
              Agregar
            </button>
          </div>
        )}
        {mapClients.length > 0 && (
          <div className="px-5 pt-4">
            <RouteMap clients={mapClients} />
            {clientsWithoutLocation.length > 0 && (
              <p className="mt-2 text-xs text-content-muted">
                Sin ubicación guardada: {clientsWithoutLocation.map((c) => c.full_name).join(', ')}
              </p>
            )}
          </div>
        )}
        {clientsInRoute.length === 0 && <p className="px-5 py-6 text-center text-sm text-content-muted">Sin clientes asignados.</p>}
        <ul className="divide-y divide-line">
          {clientsInRoute.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-5 py-3">
              <Link to={`/clientes/${c.id}`} className="text-sm text-content hover:text-primary">
                {c.full_name} <span className="text-xs text-content-muted">{c.phone ?? ''}</span>
              </Link>
              {canManage && (
                <button onClick={() => removeClient.mutate(c.id)} className="text-xs text-danger hover:underline">Quitar</button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="glass-card">
        <div className="ledger-rule flex items-center justify-between px-5 py-3">
          <h2 className="text-sm font-semibold text-content">Cobradores asignados</h2>
        </div>
        {canManage && (
          <div className="flex gap-2 border-b border-line px-5 py-3">
            <select aria-label="Cobrador a agregar" className="field-input" value={collectorPick} onChange={(e) => setCollectorPick(e.target.value)}>
              <option value="">Asignar cobrador…</option>
              {availableCollaborators.map((c) => <option key={c.user_id} value={c.user_id}>{c.full_name}</option>)}
            </select>
            <button
              className="btn-secondary whitespace-nowrap"
              disabled={!collectorPick || addCollector.isPending}
              onClick={() => { addCollector.mutate(collectorPick); setCollectorPick('') }}
            >
              Asignar
            </button>
          </div>
        )}
        {(collectorsQuery.data?.length ?? 0) === 0 && <p className="px-5 py-6 text-center text-sm text-content-muted">Sin cobradores asignados.</p>}
        <ul className="divide-y divide-line">
          {collectorsQuery.data?.map((c) => (
            <li key={c.user_id} className="flex items-center justify-between px-5 py-3">
              <p className="text-sm text-content">{c.full_name}</p>
              {canManage && (
                <button onClick={() => removeCollector.mutate(c.user_id)} className="text-xs text-danger hover:underline">Quitar</button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
