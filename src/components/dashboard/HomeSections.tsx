import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Landmark, Receipt, UserPlus, Calculator, Phone, MessageCircle, type LucideIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { money, type CalendarRow } from './shared'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?' 
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

// Contador animado del hero (sube de 0 al valor real en ~900 ms; sin animación si se pide menos movimiento).
function useCountUp(target: number): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }
    let raf = 0
    const start = performance.now()
    const dur = 900
    function tick(now: number) {
      const p = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return value
}

/* ───────────────────────── Hero de cartera (maqueta 01) ───────────────────────── */

export function HomeHero({ carteraTotal, pagosHoy, cuotasHoy }: { carteraTotal: number; pagosHoy: number; cuotasHoy: number }) {
  const animated = useCountUp(carteraTotal)
  return (
    <section aria-label="Resumen de cartera" className="page-enter relative overflow-hidden rounded-[20px] bg-gradient-to-b from-[#2C6CEE] to-primary-fill p-5 text-white shadow-[0_12px_24px_-14px_rgba(37,99,235,0.9)]">
      <div aria-hidden="true" className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10" />
      <p className="relative text-sm text-white/80">Cartera total</p>
      <p className="money relative mt-1 text-3xl font-extrabold">RD$ {money(animated)}</p>
      <div className="relative mt-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold">Por cobrar hoy · RD$ {money(pagosHoy)}</span>
        <span className="rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold">{cuotasHoy} {cuotasHoy === 1 ? 'cuota' : 'cuotas'}</span>
      </div>
    </section>
  )
}

/* ───────────────────────── Acciones grandes (maqueta 01) ───────────────────────── */

const HOME_ACTIONS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/prestamos/nuevo', label: 'Nuevo préstamo', icon: Landmark },
  { to: '/prestamos', label: 'Registrar pago', icon: Receipt },
  { to: '/clientes?crear=1', label: 'Nuevo cliente', icon: UserPlus },
  { to: '/calculadora', label: 'Calculadora', icon: Calculator }
]

export function HomeQuickActions() {
  return (
    <section aria-label="Acciones rápidas">
      <div className="grid grid-cols-2 gap-3">
        {HOME_ACTIONS.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className="glass-card card-hover flex items-center gap-3 !rounded-2xl p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white">
              <Icon size={20} aria-hidden="true" />
            </span>
            <span className="min-w-0 text-sm font-semibold leading-tight text-content">{label}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

/* ───────────────────────── Para cobrar hoy (maqueta 01) ───────────────────────── */

type Contact = { id: string; phone: string | null; whatsapp: string | null }

function digits(phone: string | null): string {
  const d = (phone ?? '').replace(/\D/g, '')
  if (d.length === 10) return `1${d}`
  return d
}

export function TodayCollections({ rows }: { rows: CalendarRow[] }) {
  const ids = Array.from(new Set(rows.map((r) => r.client_id)))
  const contactsQuery = useQuery({
    queryKey: ['today_contacts', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, phone, whatsapp').in('id', ids)
      if (error) throw error
      return data as Contact[]
    }
  })
  const contacts = new Map((contactsQuery.data ?? []).map((c) => [c.id, c]))

  return (
    <section aria-label="Para cobrar hoy">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-content">Para cobrar hoy</h2>
        <Link to="/calendario" className="text-xs font-medium text-primary hover:underline">Ver todo</Link>
      </div>
      {rows.length === 0 ? (
        <p className="glass-card px-5 py-6 text-center text-sm text-content-muted">Nada por cobrar hoy.</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => {
            const c = contacts.get(r.client_id)
            const phone = digits(c?.phone ?? null)
            const wa = digits(c?.whatsapp ?? phone)
            return (
              <article key={`${r.loan_id}-${r.installment_number}`} className="glass-card flex items-center gap-3 !rounded-2xl p-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {initials(r.client_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-content">{r.client_name}</p>
                  <p className="truncate text-xs text-content-muted">Cuota {r.installment_number} · PR-{r.loan_number}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {phone && (
                    <a href={`tel:+${phone}`} aria-label={`Llamar a ${r.client_name}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/20">
                      <Phone size={16} aria-hidden="true" />
                    </a>
                  )}
                  {wa && (
                    <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp de ${r.client_name}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-success/10 text-success-text transition-colors hover:bg-success/20">
                      <MessageCircle size={16} aria-hidden="true" />
                    </a>
                  )}
                  <Link to={`/prestamos/${r.loan_id}`} className="btn-solid !px-3 !py-2 text-xs">Cobrar</Link>
                </div>
                <p className="money hidden shrink-0 text-sm font-semibold text-content sm:block">RD$ {money(r.total_due)}</p>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
