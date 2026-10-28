import { Suspense, useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Banknote, Calculator, CreditCard, DollarSign, FileText, Home as HomeIcon, LayoutGrid, Plus, UserPlus, Users, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Splash } from './Splash'
import { applyTheme, getTheme } from './theme'

// Armazon de la maqueta interactiva: columna centrada, barra inferior con Inicio |
// Prestamos | Clientes | Pagos | Mas (con insignia de atrasados en Prestamos) y boton +
// flotante abajo a la derecha que abre las 4 acciones. Los colores salen de var(--nc-*),
// asi que el boton claro/oscuro junto a la campana cambia toda la app.
const NAV_ITEM = 'flex flex-1 flex-col items-center gap-1 py-1 text-[11px] transition-colors'

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-label={title}>
      <button aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[480px] rounded-t-[22px] bg-[var(--nc-card)] p-5 pb-8 shadow-xl md:max-w-3xl lg:max-w-5xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-[var(--nc-text)]">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-full p-1 text-[var(--nc-muted)] hover:text-[var(--nc-text)]"><X size={18} /></button>
        </div>
        <div className="space-y-1">{children}</div>
      </div>
    </div>
  )
}

function SheetLink({ to, icon, color, label, onClick }: { to: string; icon: ReactNode; color: string; label: string; onClick: () => void }) {
  return (
    <Link to={to} onClick={onClick} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-[var(--nc-text)] hover:bg-[var(--nc-soft)]">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ backgroundColor: color }}>{icon}</span>
      {label}
    </Link>
  )
}

export function Layout() {
  const [sheet, setSheet] = useState(false)
  const [showSplash, setShowSplash] = useState(() => sessionStorage.getItem('nc_splash') !== '1')
  const { pathname } = useLocation()

  // Al cambiar de pagina se vuelve arriba (como en la app anterior): si no, al tocar una
  // opcion de Mas se aterriza a mitad de la pantalla nueva y parece que no abrio.
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])

  // El tema guardado se aplica al arrancar (el script de index.html ya lo puso antes de
  // pintar; esto lo reafirma si algo lo perdio).
  useEffect(() => { applyTheme(getTheme()) }, [])

  // La fila "Ver la intro animada de nuevo" de Mas dispara este evento.
  useEffect(() => {
    const h = () => setShowSplash(true)
    window.addEventListener('nc:replay-intro', h)
    return () => window.removeEventListener('nc:replay-intro', h)
  }, [])

  function closeSplash() {
    sessionStorage.setItem('nc_splash', '1')
    setShowSplash(false)
  }

  // Insignia roja de Prestamos: cantidad de prestamos atrasados (como en la maqueta).
  const overdueQuery = useQuery({
    queryKey: ['nuevo_nav_overdue'],
    queryFn: async () => {
      const { data, error } = await supabase.from('loan_balances').select('status, days_overdue')
      if (error) return 0
      return (data ?? []).filter((l: any) => l.status === 'active' && l.days_overdue > 0).length
    }
  })
  const overdue = overdueQuery.data ?? 0

  return (
    <div className="min-h-dvh bg-[var(--nc-bg)] text-[var(--nc-text)]">
      {showSplash && <Splash onDone={closeSplash} />}

      <div className="mx-auto min-h-dvh w-full max-w-[480px] px-4 pb-48 pt-[max(1.25rem,env(safe-area-inset-top))] md:max-w-3xl lg:max-w-5xl">
        {/* Las pantallas de Mas se descargan bajo demanda (lazy): sin este Suspense, al
           tocar una opcion la app se quedaba en blanco/trabada en vez de mostrar el
           "Cargando…" mientras llega el archivo. La app anterior lo tenia en PageTransition. */}
        <Suspense fallback={<p className="py-10 text-center text-sm text-[var(--nc-muted)]">Cargando…</p>}>
          <Outlet />
        </Suspense>
      </div>

      {/* El + flotante va POR ENCIMA de la barra inferior con aire: antes quedaba a 84px
         fijos y en el iPhone la barra crece con el área segura (indicador de inicio) hasta
         ~98px, así que el botón quedaba debajo del panel y tapaba la última tarjeta. */}
      <button onClick={() => setSheet(true)} aria-label="Acciones rapidas"
        className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#2563EB] text-white shadow-xl active:scale-95">
        <Plus size={26} />
      </button>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--nc-border)] bg-[var(--nc-card)]" aria-label="Navegacion principal">
        <div className="mx-auto flex w-full max-w-[480px] items-stretch justify-around px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 md:max-w-3xl lg:max-w-5xl">
          <NavLink to="/" end className={({ isActive }) => `${NAV_ITEM} ${isActive ? 'text-[#60A5FA]' : 'text-[var(--nc-muted)]'}`}>
            <HomeIcon size={20} /> Inicio
          </NavLink>
          <NavLink to="/prestamos" className={({ isActive }) => `${NAV_ITEM} ${isActive ? 'text-[#60A5FA]' : 'text-[var(--nc-muted)]'}`}>
            <span className="relative">
              <FileText size={20} />
              {overdue > 0 && (
                <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{overdue}</span>
              )}
            </span>
            Préstamos
          </NavLink>
          <NavLink to="/clientes" className={({ isActive }) => `${NAV_ITEM} ${isActive ? 'text-[#60A5FA]' : 'text-[var(--nc-muted)]'}`}>
            <Users size={20} /> Clientes
          </NavLink>
          <NavLink to="/pagos" className={({ isActive }) => `${NAV_ITEM} ${isActive ? 'text-[#60A5FA]' : 'text-[var(--nc-muted)]'}`}>
            <Banknote size={20} /> Pagos
          </NavLink>
          <NavLink to="/mas" className={({ isActive }) => `${NAV_ITEM} ${isActive ? 'text-[#60A5FA]' : 'text-[var(--nc-muted)]'}`}>
            <LayoutGrid size={20} /> Más
          </NavLink>
        </div>
      </nav>

      {sheet && (
        <Sheet title="Acciones" onClose={() => setSheet(false)}>
          <SheetLink to="/prestamos/nuevo" icon={<DollarSign size={16} />} color="#2563EB" label="Nuevo préstamo" onClick={() => setSheet(false)} />
          <SheetLink to="/prestamos" icon={<CreditCard size={16} />} color="#F59E0B" label="Registrar pago" onClick={() => setSheet(false)} />
          <SheetLink to="/clientes/nuevo" icon={<UserPlus size={16} />} color="#22C55E" label="Nuevo cliente" onClick={() => setSheet(false)} />
          <SheetLink to="/calculadora" icon={<Calculator size={16} />} color="#EF4444" label="Calculadora" onClick={() => setSheet(false)} />
        </Sheet>
      )}
    </div>
  )
}
