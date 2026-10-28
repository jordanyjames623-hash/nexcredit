import { Link } from 'react-router-dom'
import { Crown } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

const COPY = {
  basic: { title: 'Plan Básico', text: 'Desbloquea todo con Pro', cta: 'Mejorar plan' },
  pro: { title: 'Plan Pro', text: 'Sucursales y API en Business', cta: 'Ver planes' },
  business: { title: 'Plan Business', text: 'Todas las funciones activas', cta: 'Ver mi plan' }
} as const

// Tarjeta del plan al pie de la barra lateral (solo para el propietario).
export function PlanCard({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { business, isOwner } = useAuth()
  if (!isOwner || !business) return null
  const copy = COPY[business.subscription_plan]

  if (collapsed) {
    return (
      <Link to="/configuracion" onClick={onNavigate} title={copy.title} aria-label={copy.title}
        className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-on-navy transition-colors hover:bg-white/10">
        <Crown size={18} />
      </Link>
    )
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-on-navy"><Crown size={15} className="text-on-navy/80" aria-hidden="true" /> {copy.title}</p>
      <p className="mb-2.5 mt-0.5 truncate text-[11px] text-on-navy/60">{copy.text}</p>
      <Link to="/configuracion" onClick={onNavigate} className="btn-solid w-full !py-1.5 text-xs">{copy.cta}</Link>
    </div>
  )
}
