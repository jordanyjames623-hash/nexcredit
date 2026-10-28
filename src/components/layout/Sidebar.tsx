import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { BrandMark } from './BrandMark'
import { NavList } from './NavList'
import { PlanCard } from './PlanCard'
import type { NavGroup } from './navConfig'

// Barra lateral de escritorio: panel flotante azul profundo, expandible/compacta.
export function Sidebar({ groups, collapsed, onToggle }: { groups: NavGroup[]; collapsed: boolean; onToggle: () => void }) {
  const { business } = useAuth()
  // Configuración queda fija abajo: siempre visible aunque la lista de secciones necesite scroll.
  const mainGroups = groups.filter((g) => g.id !== 'config')
  const pinnedGroups = groups.filter((g) => g.id === 'config')

  return (
    <aside
      aria-label="Barra lateral"
      style={{ width: collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)' }}
      className="print-hide sticky top-3 m-3 mr-0 hidden h-[calc(100dvh-1.5rem)] shrink-0 flex-col self-start overflow-hidden rounded-[22px] border border-white/10 bg-gradient-to-b from-navy to-navy-light/90 shadow-[0_24px_56px_-24px_rgba(10,26,58,0.7)] transition-[width] duration-300 ease-out sm:flex"
    >
      <div className={`flex items-center gap-3 px-4 pb-3 pt-5 ${collapsed ? 'justify-center px-0' : ''}`}>
        {business?.logo_url ? (
          <img src={business.logo_url} alt="" className="h-9 w-9 shrink-0 rounded-[11px] object-cover" />
        ) : (
          <BrandMark size={36} />
        )}
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight text-on-navy">{business?.name ?? 'NEXCREDIT'}</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-on-navy/60">Nexcredit</p>
          </div>
        )}
      </div>

      <nav aria-label="Principal" className="scroll-thin flex-1 overflow-y-auto px-3 py-2">
        <NavList groups={mainGroups} collapsed={collapsed} />
      </nav>

      <div className="space-y-2 border-t border-white/10 p-3">
        {pinnedGroups.length > 0 && <NavList groups={pinnedGroups} collapsed={collapsed} />}
        <PlanCard collapsed={collapsed} />
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
          aria-pressed={collapsed}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium text-on-navy/60 transition-colors hover:bg-white/[0.07] hover:text-on-navy ${collapsed ? 'justify-center px-0' : ''}`}
        >
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          {!collapsed && 'Contraer menú'}
        </button>
      </div>
    </aside>
  )
}
