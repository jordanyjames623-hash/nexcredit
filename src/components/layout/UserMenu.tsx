import { Link } from 'react-router-dom'
import { ChevronDown, Settings, LogOut, ShieldAlert } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Dropdown } from '@/components/ui/Dropdown'

export function UserMenu() {
  const { profile, session, isOwner, signOut } = useAuth()
  const name = profile?.full_name || 'Sin nombre'
  const role = isOwner ? 'Propietario' : 'Colaborador'

  return (
    <Dropdown
      label="Menú de usuario"
      panelClassName="w-64"
      trigger={({ open, toggle }) => (
        <button
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="flex items-center gap-2 rounded-2xl p-1 pr-2 transition-colors hover:bg-primary/10 active:scale-[0.98]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark text-sm font-semibold text-white">
            {name.charAt(0).toUpperCase()}
          </span>
          <span className="hidden text-left md:block">
            <span className="block max-w-[10rem] truncate text-sm font-semibold leading-tight text-content">{name}</span>
            <span className="block text-xs text-content-muted">{role}</span>
          </span>
          <ChevronDown size={16} className={`hidden text-content-muted transition-transform md:block ${open ? 'rotate-180' : ''}`} />
        </button>
      )}
    >
      {({ close }) => (
        <div>
          <div className="px-3 pb-2 pt-2">
            <p className="truncate text-sm font-semibold text-content">{name}</p>
            <p className="truncate text-xs text-content-muted">{session?.user.email ?? role}</p>
          </div>
          <div className="my-1 h-px bg-line/70" />
          <Link to="/configuracion" onClick={close} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-content transition-colors hover:bg-primary/10">
            <Settings size={16} className="text-content-muted" /> Configuración
          </Link>
          {profile?.is_platform_admin && (
            <Link to="/superadmin" onClick={close} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-content transition-colors hover:bg-primary/10">
              <ShieldAlert size={16} className="text-content-muted" /> Administración de la plataforma
            </Link>
          )}
          <button onClick={() => { close(); signOut() }} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-danger transition-colors hover:bg-danger/10">
            <LogOut size={16} /> Salir
          </button>
        </div>
      )}
    </Dropdown>
  )
}
