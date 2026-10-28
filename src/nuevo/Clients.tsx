import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Banknote, MessageCircle, Phone } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { money0, initials, avatarColor, telLink, waLink } from './lib'
import { GreetingHeader } from './GreetingHeader'

// Clientes de la maqueta interactiva: subtitulo, buscador, tarjetas con avatar de color,
// estado, balance pendiente y botones Cobrar / Llamar / WhatsApp. Cobrar va al primer
// prestamo activo del cliente; sin prestamo activo no se muestra (como Pedro, saldado,
// en la maqueta). Crear cliente vive en su propia pantalla (NewClient, /clientes/nuevo)
// con TODAS las opciones viejas: cedula, direccion, asignar a un colaborador, sucursal y
// ubicacion GPS. Los colores salen de var(--nc-*).
type ClientStatus = 'ok' | 'late' | 'paid' | null

function Pill({ kind }: { kind: Exclude<ClientStatus, null> }) {
  if (kind === 'ok') return <span className="rounded-full bg-[#60A5FA]/10 px-2.5 py-0.5 text-xs font-semibold text-[#60A5FA]">Al día</span>
  if (kind === 'late') return <span className="rounded-full bg-red-400/10 px-2.5 py-0.5 text-xs font-semibold text-red-400">Atrasado</span>
  return <span className="rounded-full bg-amber-300/10 px-2.5 py-0.5 text-xs font-semibold text-amber-300">Saldado</span>
}

export function Clients() {
  const [q, setQ] = useState('')

  const clientsQuery = useQuery({
    queryKey: ['nuevo_clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, full_name, phone, whatsapp, sector, status').is('deleted_at', null).order('full_name')
      if (error) throw error
      return data as { id: string; full_name: string; phone: string | null; whatsapp: string | null; sector: string | null; status: string }[]
    }
  })
  const balancesQuery = useQuery({
    queryKey: ['nuevo_client_balances'],
    queryFn: async () => {
      const { data, error } = await supabase.from('client_balances').select('client_id, active_loans, total_pending, overdue_installments')
      if (error) return null
      return data as { client_id: string; active_loans: number; total_pending: number; overdue_installments: number }[]
    }
  })
  const activeLoansQuery = useQuery({
    queryKey: ['nuevo_client_active_loans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('loan_balances').select('loan_id, client_id, status').eq('status', 'active')
      if (error) return null
      const map = new Map<string, string>()
      ;(data ?? []).forEach((l: any) => { if (!map.has(l.client_id)) map.set(l.client_id, l.loan_id) })
      return map
    }
  })

  const balanceByClient = new Map((balancesQuery.data ?? []).map((b) => [b.client_id, b]))
  const activeLoanByClient = activeLoansQuery.data ?? null
  const needle = q.trim().toLowerCase()
  const clients = (clientsQuery.data ?? []).filter((c) =>
    !needle || c.full_name.toLowerCase().includes(needle) || (c.phone ?? '').toLowerCase().includes(needle)
  )

  return (
    <div className="space-y-4">
      <GreetingHeader />
      <div>
        <h1 className="text-[28px] font-bold leading-tight text-[var(--nc-text)]">Clientes</h1>
        <p className="text-sm text-[var(--nc-muted)]">Toca un cliente para ver su detalle, o cobra y contacta sin entrar a otra pantalla.</p>
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente por nombre…"
        className="w-full rounded-xl bg-[var(--nc-card)] px-4 py-3 text-sm text-[var(--nc-text)] outline-none placeholder:text-[var(--nc-faint)] focus:ring-2 focus:ring-[#2563EB]" />

      {clientsQuery.isLoading && <p className="text-sm text-[var(--nc-muted)]">Cargando…</p>}
      {clientsQuery.error && <p className="text-sm text-red-400">No se pudieron cargar los clientes.</p>}
      {!clientsQuery.isLoading && clients.length === 0 && (
        <div className="rounded-2xl bg-[var(--nc-card)] px-4 py-6 text-center text-sm text-[var(--nc-muted)]">Sin clientes con ese criterio.</div>
      )}

      <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
        {clients.map((c) => {
          const b = balanceByClient.get(c.id)
          const status: ClientStatus = !b ? null : b.overdue_installments > 0 ? 'late' : b.active_loans > 0 ? 'ok' : 'paid'
          const phone = c.phone ?? c.whatsapp ?? null
          const wa = waLink(phone, `Hola ${c.full_name}, te escribimos de NEXCREDIT.`)
          const tel = telLink(phone)
          const firstActiveLoan = activeLoanByClient?.get(c.id)
          return (
            <div key={c.id} className="rounded-[22px] bg-[var(--nc-card)] p-4">
              <Link to={`/clientes/${c.id}`} className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: avatarColor(c.id) }}>
                  {initials(c.full_name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[var(--nc-text)]">{c.full_name}</span>
                  {phone && <span className="block text-xs text-[var(--nc-muted)]">{phone}</span>}
                </span>
                {status && <Pill kind={status} />}
              </Link>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-[var(--nc-muted)]">Balance pendiente</span>
                <span className="font-disp text-sm font-bold text-[var(--nc-text)]">RD$ {money0(b?.total_pending ?? 0)}</span>
              </div>
              <div className="mt-3 flex gap-2">
                {firstActiveLoan && (
                  <Link to={`/registrar-pago/${firstActiveLoan}`} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#60A5FA] py-2 text-center text-sm font-semibold text-[#0B1120]"><Banknote size={15} /> Cobrar</Link>
                )}
                {tel && (
                  <a href={tel} className="flex items-center gap-1.5 rounded-lg bg-[var(--nc-soft)] px-3 py-2 text-sm font-medium text-[var(--nc-text)]"><Phone size={15} /> Llamar</a>
                )}
                {wa && (
                  <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg bg-[var(--nc-soft)] px-3 py-2 text-sm font-medium text-[var(--nc-text)]"><MessageCircle size={15} className="text-green-400" /> WhatsApp</a>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Crear cliente abre su propia pantalla (como crear préstamo): antes el formulario
         vivía al final de esta lista y había que deslizar hasta abajo para verlo. */}
      <Link to="/clientes/nuevo" className="block w-full rounded-xl bg-[#2563EB] py-3 text-center text-sm font-semibold text-white">+ Agregar cliente</Link>
    </div>
  )
}
