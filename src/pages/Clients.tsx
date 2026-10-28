import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Search, Plus, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useAuth } from '@/contexts/AuthContext'
import { AssigneePicker } from '@/components/AssigneePicker'
import { LocationCapture } from '@/components/LocationCapture'
import { BranchPicker } from '@/components/BranchPicker'
import { UpgradeToProModal, parsePlanLimitError } from '@/components/UpgradeToProModal'

type Client = {
  id: string
  full_name: string
  phone: string | null
  sector: string | null
  status: 'active' | 'inactive'
}
type Balance = { client_id: string; active_loans: number; total_pending: number; overdue_installments: number }

const FILTERS = [
  { v: 'all', l: 'Todos' },
  { v: 'active', l: 'Activos' },
  { v: 'inactive', l: 'Inactivos' },
  { v: 'overdue', l: 'Vencidos' }
] as const

function money(n: number) {
  return new Intl.NumberFormat('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

export function Clients() {
  const qc = useQueryClient()
  const isOnline = useOnlineStatus()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['v']>('all')
  const [showForm, setShowForm] = useState(() => searchParams.get('crear') === '1')

  useEffect(() => {
    if (searchParams.get('crear') === '1') {
      setShowForm(true)
      const next = new URLSearchParams(searchParams)
      next.delete('crear')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data: clients, isLoading, error } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, full_name, phone, sector, status')
        .is('deleted_at', null)
        .order('full_name')
      if (error) throw error
      return data as Client[]
    }
  })

  const { data: balances } = useQuery({
    queryKey: ['client_balances'],
    queryFn: async () => {
      const { data, error } = await supabase.from('client_balances').select('client_id, active_loans, total_pending, overdue_installments')
      if (error) throw error
      return data as Balance[]
    }
  })

  const balanceMap = useMemo(() => {
    const map = new Map<string, Balance>()
    ;(balances ?? []).forEach((b) => map.set(b.client_id, b))
    return map
  }, [balances])

  const filtered = (clients ?? []).filter((c) => {
    if (!c.full_name.toLowerCase().includes(search.toLowerCase())) return false
    const b = balanceMap.get(c.id)
    if (filter === 'active') return c.status === 'active'
    if (filter === 'inactive') return c.status === 'inactive'
    if (filter === 'overdue') return (b?.overdue_installments ?? 0) > 0
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="t-h1 text-content">Clientes</h1>
          <p className="text-sm text-content-muted">Gestiona toda tu cartera de clientes.</p>
        </div>
        <button className="btn-solid" disabled={!isOnline} onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancelar' : <><Plus size={16} className="mr-1.5" /> Nuevo cliente</>}
        </button>
      </div>

      {showForm && (
        <NewClientForm
          onDone={() => {
            setShowForm(false)
            qc.invalidateQueries({ queryKey: ['clients'] })
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-auto sm:min-w-[14rem] sm:max-w-sm sm:flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
          <input aria-label="Buscar cliente…"
            className="field-input pl-9"
            placeholder="Buscar cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.v}
              onClick={() => setFilter(f.v)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f.v ? 'bg-primary-fill text-white' : 'glass-card text-content-muted hover:text-content'
              }`}
            >
              {f.l}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-sm text-content-muted">Cargando…</p>}
      {error && <p className="text-sm text-danger">No se pudo cargar la lista de clientes.</p>}

      {!isLoading && filtered.length === 0 && (
        <div className="glass-card px-5 py-10 text-center text-sm text-content-muted">
          {search || filter !== 'all' ? 'Ningún cliente coincide con este filtro.' : 'Aún no has registrado clientes.'}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((c) => {
          const b = balanceMap.get(c.id)
          return (
            <Link key={c.id} to={`/clientes/${c.id}`} className="glass-card flex items-center gap-3 px-4 py-3.5 transition-transform hover:-translate-y-0.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-semibold text-on-navy">
                {c.full_name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-content">{c.full_name}</p>
                  {c.status === 'inactive' && <span className="badge-danger shrink-0">Inactivo</span>}
                  {c.status === 'active' && (b?.overdue_installments ?? 0) > 0 && <span className="badge-danger shrink-0">Vencido</span>}
                  {c.status === 'active' && (b?.overdue_installments ?? 0) === 0 && <span className="badge-success shrink-0">Activo</span>}
                </div>
                <p className="truncate text-xs text-content-muted">{c.phone ?? 'sin teléfono'}{c.sector ? ` · ${c.sector}` : ''}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="money text-sm font-semibold text-content">RD$ {money(b?.total_pending ?? 0)}</p>
                <p className="text-xs text-content-muted">{b?.active_loans ?? 0} préstamo(s)</p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-content/30" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function NewClientForm({ onDone }: { onDone: () => void }) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [sector, setSector] = useState('')
  const [address, setAddress] = useState('')
  const [documentId, setDocumentId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const { session } = useAuth()
  const toast = useToast()
  const [assignedTo, setAssignedTo] = useState(session?.user.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [upgradeReason, setUpgradeReason] = useState<ReturnType<typeof parsePlanLimitError>>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('clients').insert({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        sector: sector.trim() || null,
        address: address.trim() || null,
        document_id: documentId.trim() || null,
        assigned_to: assignedTo || null,
        branch_id: branchId || null,
        latitude: location?.lat ?? null, longitude: location?.lng ?? null,
        location_captured_at: location ? new Date().toISOString() : null
      })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Cliente guardado'); onDone() },
    onError: (e: any) => {
      const reason = parsePlanLimitError(e.message)
      if (reason) setUpgradeReason(reason)
      else setError(e.message ?? 'No se pudo guardar el cliente.')
    }
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!fullName.trim()) {
      setError('El nombre es obligatorio.')
      return
    }
    mutation.mutate()
  }

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-4 glass-card p-5">
      {error && <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      <div className="grid grid-cols-2 gap-4">
        <div className="min-w-0">
          <label className="field-label" htmlFor="fullName">Nombre completo</label>
          <input id="fullName" required className="field-input w-full min-w-0" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="min-w-0">
          <label className="field-label" htmlFor="phone">Teléfono</label>
          <input id="phone" className="field-input w-full min-w-0" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="min-w-0">
          <label className="field-label" htmlFor="sector">Sector</label>
          <input id="sector" className="field-input w-full min-w-0" value={sector} onChange={(e) => setSector(e.target.value)} />
        </div>
        <div className="min-w-0">
          <label className="field-label" htmlFor="documentId">Cédula</label>
          <input id="documentId" className="field-input w-full min-w-0" value={documentId} onChange={(e) => setDocumentId(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="field-label" htmlFor="address">Dirección</label>
          <input id="address" className="field-input" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="col-span-2">
          <AssigneePicker value={assignedTo} onChange={setAssignedTo} label="Asignar cliente a" />
        </div>
        <div className="col-span-2">
          <BranchPicker value={branchId} onChange={setBranchId} emptyLabel="Sin sucursal" />
        </div>
        <div className="col-span-2">
          <LocationCapture value={location} onChange={setLocation} />
        </div>
      </div>
      <button type="submit" disabled={mutation.isPending} className="btn-solid">
        {mutation.isPending ? 'Guardando…' : 'Guardar cliente'}
      </button>
    </form>
    {upgradeReason && <UpgradeToProModal reason={upgradeReason} onClose={() => setUpgradeReason(null)} />}
    </>
  )
}
