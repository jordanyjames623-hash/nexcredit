import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu, Search, Settings, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { BrandMark } from './BrandMark'
import { GlobalSearch } from './GlobalSearch'
import { NotificationsBell } from './NotificationsBell'
import { UserMenu } from './UserMenu'
import type { NavItem } from './navConfig'

// Encabezado flotante de vidrio: buscador global, notificaciones, configuración y usuario.
export function AppHeader({ pages, onOpenDrawer }: { pages: NavItem[]; onOpenDrawer: () => void }) {
  const { business } = useAuth()
  const [mobileSearch, setMobileSearch] = useState(false)

  return (
    <div className="print-hide sticky top-0 z-30 bg-gradient-to-b from-background from-70% to-transparent px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-8">
      <header className="glass-panel glass-medium !rounded-[18px] mx-auto flex h-14 w-full max-w-[1600px] items-center gap-2 px-2.5 sm:gap-3 sm:px-3">
        <button onClick={onOpenDrawer} aria-label="Abrir menú"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-content-muted transition-colors hover:bg-primary/10 active:scale-95 sm:hidden">
          <Menu size={21} />
        </button>

        <Link to="/" className="flex min-w-0 items-center gap-2 sm:hidden" aria-label="Ir al inicio">
          {business?.logo_url ? <img src={business.logo_url} alt="" className="h-8 w-8 rounded-[10px] object-cover" /> : <BrandMark size={30} />}
          <span className="truncate text-sm font-semibold text-content">{business?.name ?? 'NEXCREDIT'}</span>
        </Link>

        <div className="hidden min-w-0 max-w-xl flex-1 sm:block">
          <GlobalSearch pages={pages} />
        </div>

        <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
          <button onClick={() => setMobileSearch((v) => !v)} aria-label={mobileSearch ? 'Cerrar búsqueda' : 'Buscar'}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-content-muted transition-colors hover:bg-primary/10 active:scale-95 sm:hidden">
            {mobileSearch ? <X size={19} /> : <Search size={19} />}
          </button>
          <NotificationsBell />
          <Link to="/configuracion" aria-label="Configuración"
            className="hidden h-10 w-10 items-center justify-center rounded-xl text-content-muted transition-colors hover:bg-primary/10 hover:text-primary active:scale-95 sm:flex">
            <Settings size={19} />
          </Link>
          <UserMenu />
        </div>
      </header>

      {mobileSearch && (
        <div className="popover-enter mx-auto mt-2 max-w-[1600px] sm:hidden">
          <GlobalSearch pages={pages} autoFocus onDone={() => setMobileSearch(false)} />
        </div>
      )}
    </div>
  )
}
