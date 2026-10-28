import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Activity, BarChart3, Bell, Brain, Calendar, ChevronDown, ChevronRight, FileText, HandCoins, LogOut, Percent, Receipt, RefreshCw, Route, Settings, Shield, Sparkles, Users, Wallet, type LucideIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { GreetingHeader } from './GreetingHeader'

// Pantalla Mas de la maqueta: "Todo lo demas de tu negocio, ordenado y a un toque."
// Primero las 9 filas de la maqueta en su orden exacto, luego el resto de funciones
// actuales, TODAS en una sola rejilla para que el espacio quede parejo (antes eran dos
// rejillas separadas y las filas impares dejaban un hueco). Los colores salen de
// var(--nc-*), asi que el boton claro/oscuro cambia tambien esta pantalla.
// Nota: no hay pantalla separada de recordatorios (decision 2026-10-27): Recordatorios abre
// el Calendario (que vence cada dia) y Cobranza sigue en cobranza (atrasados).
type Row = { icon: LucideIcon; color: string; title: string; sub: string; to?: string; action?: 'intro' | 'logout' }

const ROWS: Row[] = [
  { icon: Calendar, color: '#3B82F6', title: 'Calendario de cobros', sub: 'Qué vence cada día de la semana', to: '/calendario' },
  { icon: BarChart3, color: '#3B82F6', title: 'Reportes', sub: 'Ingresos, mora y resumen del mes', to: '/reportes' },
  { icon: Percent, color: '#F59E0B', title: 'Comisiones', sub: 'Lo que gana cada colaborador', to: '/comisiones' },
  { icon: RefreshCw, color: '#3B82F6', title: 'Renovaciones', sub: 'Clientes listos para renovar', to: '/renovaciones' },
  { icon: Shield, color: '#EF4444', title: 'Garantías', sub: 'Artículos dejados en garantía', to: '/garantias' },
  { icon: Users, color: '#A855F7', title: 'Colaboradores', sub: 'Tu equipo y sus accesos', to: '/colaboradores' },
  { icon: Bell, color: '#F59E0B', title: 'Recordatorios', sub: 'Avisos automáticos a clientes', to: '/calendario' },
  { icon: Settings, color: '#94A3B8', title: 'Configuración', sub: 'Tu negocio, tasas y respaldo', to: '/configuracion' },
  { icon: Sparkles, color: '#3B82F6', title: 'Ver la intro animada de nuevo', sub: 'Vuelve a ver la presentación', action: 'intro' },
  { icon: Wallet, color: '#22C55E', title: 'Caja', sub: 'Efectivo y movimientos del día', to: '/caja' },
  { icon: HandCoins, color: '#EF4444', title: 'Cobranza', sub: 'Gestión de cobros atrasados', to: '/cobranza' },
  { icon: Route, color: '#3B82F6', title: 'Rutas', sub: 'Rutas de cobro', to: '/rutas' },
  { icon: Receipt, color: '#F97316', title: 'Gastos', sub: 'Gastos del negocio', to: '/gastos' },
  { icon: FileText, color: '#A855F7', title: 'Solicitudes', sub: 'Solicitudes de préstamo', to: '/solicitudes' },
  { icon: Brain, color: '#6366F1', title: 'Inteligencia', sub: 'Análisis inteligente', to: '/inteligencia' },
  { icon: Activity, color: '#94A3B8', title: 'Actividad', sub: 'Registro de actividad', to: '/actividad' }
]

export function More() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [sessionOpen, setSessionOpen] = useState(false)
  // Solo la cuenta administradora maestra (profile.is_platform_admin) ve la entrada al
  // SaaS; las demás cuentas siguen viendo solo el botón de cerrar sesión de siempre.
  const isPlatformAdmin = profile?.is_platform_admin === true

  async function logout() {
    await supabase.auth.signOut()
    navigate('/entrar', { replace: true })
  }

  function renderRow(r: Row) {
    const body = (
      <span className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--nc-soft)]" style={{ color: r.color }}>
          <r.icon size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[var(--nc-text)]">{r.title}</span>
          <span className="block truncate text-xs text-[var(--nc-muted)]">{r.sub}</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-[var(--nc-faint)]" />
      </span>
    )
    if (r.action === 'intro') {
      return (
        <button key={r.title} onClick={() => window.dispatchEvent(new Event('nc:replay-intro'))} className="w-full rounded-[22px] bg-[var(--nc-card)] p-4 text-left active:scale-[0.99]">
          {body}
        </button>
      )
    }
    return (
      <Link key={r.title} to={r.to!} className="block rounded-[22px] bg-[var(--nc-card)] p-4 active:scale-[0.99]">
        {body}
      </Link>
    )
  }

  return (
    <div className="space-y-4">
      <GreetingHeader />
      <div>
        <h1 className="text-[28px] font-bold leading-tight text-[var(--nc-text)]">Más opciones</h1>
        <p className="text-sm text-[var(--nc-muted)]">Todo lo demás de tu negocio, ordenado y a un toque.</p>
      </div>

      <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
        {ROWS.map(renderRow)}
      </div>

      {isPlatformAdmin ? (
        <div className="rounded-[22px] bg-[var(--nc-card)] p-4">
          <button onClick={() => setSessionOpen((v) => !v)} aria-expanded={sessionOpen} className="flex w-full items-center gap-3 text-left active:scale-[0.99]">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--nc-soft)] text-red-400"><LogOut size={19} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[var(--nc-text)]">Sesión</span>
              <span className="block text-xs text-[var(--nc-muted)]">Cerrar sesión o entrar al SaaS</span>
            </span>
            <ChevronDown size={18} className={`shrink-0 text-[var(--nc-faint)] transition-transform ${sessionOpen ? 'rotate-180' : ''}`} />
          </button>
          {sessionOpen && (
            <div className="mt-3 space-y-2">
              <Link to="/superadmin" className="flex items-center gap-3 rounded-xl bg-[var(--nc-soft)] px-3 py-3 active:scale-[0.99]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--nc-card)] text-[#A855F7]"><Shield size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[var(--nc-text)]">Entrar al SaaS</span>
                  <span className="block text-xs text-[var(--nc-muted)]">Administración de la plataforma</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-[var(--nc-faint)]" />
              </Link>
              <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl bg-[var(--nc-soft)] px-3 py-3 text-left active:scale-[0.99]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--nc-card)] text-red-400"><LogOut size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[var(--nc-text)]">Cerrar sesión</span>
                  <span className="block text-xs text-[var(--nc-muted)]">Salir de tu cuenta</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-[var(--nc-faint)]" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <button onClick={logout} className="flex w-full items-center gap-3 rounded-[22px] bg-[var(--nc-card)] p-4 text-left active:scale-[0.99]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--nc-soft)] text-red-400"><LogOut size={19} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[var(--nc-text)]">Cerrar sesión</span>
            <span className="block text-xs text-[var(--nc-muted)]">Salir de tu cuenta</span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-[var(--nc-faint)]" />
        </button>
      )}
    </div>
  )
}
