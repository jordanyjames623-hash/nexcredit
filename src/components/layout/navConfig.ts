import {
  LayoutDashboard, Users, HandCoins, CalendarDays, Map, Wallet, Receipt,
  UserSquare2, BarChart3, History, Settings, UserPlus, Landmark, Wallet as WalletIcon,
  Award, Repeat2, AlertTriangle, Sparkles, ShieldCheck, Calculator, ClipboardList,
  type LucideIcon
} from 'lucide-react'

export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean }
export type NavGroup = { id: string; label: string | null; items: NavItem[] }

// Misma navegación de siempre (mismas rutas), agrupada por tema.
export const NAV_GROUPS: NavGroup[] = [
  { id: 'inicio', label: null, items: [{ to: '/', label: 'Inicio', end: true, icon: LayoutDashboard }] },
  {
    id: 'cartera', label: 'Cartera', items: [
      { to: '/clientes', label: 'Clientes', icon: Users },
      { to: '/prestamos', label: 'Préstamos', icon: HandCoins },
      { to: '/solicitudes', label: 'Solicitudes', icon: ClipboardList },
      { to: '/renovaciones', label: 'Renovaciones', icon: Repeat2 },
      { to: '/garantias', label: 'Garantías', icon: ShieldCheck }
    ]
  },
  {
    id: 'cobranza', label: 'Cobranza', items: [
      { to: '/pagos', label: 'Pagos', icon: Receipt },
  { to: '/caja', label: 'Caja', icon: Wallet },
      { to: '/calendario', label: 'Calendario', icon: CalendarDays },
      { to: '/cobranza', label: 'Cobranza', icon: AlertTriangle },
      { to: '/rutas', label: 'Rutas', icon: Map }
    ]
  },
  {
    id: 'finanzas', label: 'Finanzas', items: [
      { to: '/gastos', label: 'Gastos', icon: Wallet },
      { to: '/comisiones', label: 'Comisiones', icon: Award },
      { to: '/reportes', label: 'Reportes', icon: BarChart3 }
    ]
  },
  {
    id: 'equipo', label: 'Equipo', items: [
      { to: '/colaboradores', label: 'Colaboradores', icon: UserSquare2 },
      { to: '/actividad', label: 'Historial', icon: History }
    ]
  },
  {
    id: 'herramientas', label: 'Herramientas', items: [
      { to: '/calculadora', label: 'Calculadora', icon: Calculator },
      { to: '/inteligencia', label: 'Inteligencia', icon: Sparkles }
    ]
  },
  { id: 'config', label: null, items: [{ to: '/configuracion', label: 'Configuración', icon: Settings }] }
]

// Solo el propietario ve estas secciones.
const OWNER_ONLY = ['/colaboradores', '/actividad', '/garantias']
// El plan Básico solo ve Dashboard, Clientes, Préstamos, Pagos, Reportes (básicos), Calculadora y Configuración.
// (La base de datos y las páginas también lo bloquean; esto solo evita mostrar enlaces que no aplican.)
const BASIC_BLOCKED = ['/calendario', '/cobranza', '/rutas', '/gastos', '/solicitudes', '/comisiones', '/renovaciones', '/inteligencia', '/colaboradores', '/actividad', '/garantias']

export function visibleGroups(isOwner: boolean, isBasic: boolean): NavGroup[] {
  return NAV_GROUPS
    .map((g) => ({
      ...g,
      items: g.items.filter((n) => (isOwner || !OWNER_ONLY.includes(n.to)) && (!isBasic || !BASIC_BLOCKED.includes(n.to)))
    }))
    .filter((g) => g.items.length > 0)
}

export function flatNav(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((g) => g.items)
}

// Barra inferior móvil: Inicio | Clientes | (+) | Pagos | Más — el "+" no es una ruta, es un atajo.
export const MOBILE_LEFT = ['/', '/clientes']
export const MOBILE_RIGHT = ['/pagos']

export const QUICK_ACTIONS: NavItem[] = [
  { to: '/clientes?crear=1', label: 'Nuevo cliente', icon: UserPlus },
  { to: '/prestamos/nuevo', label: 'Nuevo préstamo', icon: Landmark },
  { to: '/calculadora', label: 'Cotizar', icon: Calculator },
  { to: '/gastos', label: 'Nuevo gasto', icon: WalletIcon }
]
export const QUICK_BLOCKED_BASIC = ['/gastos']
