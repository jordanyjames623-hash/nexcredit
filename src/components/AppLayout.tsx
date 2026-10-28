import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Plus, Menu } from 'lucide-react'
import { OfflineBanner } from '@/components/OfflineBanner'
import { useAuth } from '@/contexts/AuthContext'
import { Sidebar } from '@/components/layout/Sidebar'
import { AppHeader } from '@/components/layout/AppHeader'
import { MobileDrawer } from '@/components/layout/MobileDrawer'
import { PageTransition } from '@/components/layout/PageTransition'
import { usePointerLight } from '@/hooks/usePointerLight'
import { PendingPaymentsIndicator } from '@/components/PendingPaymentsIndicator'
import { Splash } from '@/components/Splash'
import { visibleGroups, flatNav, MOBILE_LEFT, MOBILE_RIGHT, QUICK_ACTIONS, QUICK_BLOCKED_BASIC } from '@/components/layout/navConfig'

const SIDEBAR_KEY = 'capitalia_sidebar_collapsed'

function initialCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_KEY)
    if (stored !== null) return stored === 'true'
  } catch { /* sin almacenamiento */ }
  // Tablet: barra compacta por defecto.
  return typeof window !== 'undefined' && window.innerWidth < 1024
}

export function AppLayout() {
  usePointerLight()
  const { business, isOwner } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<boolean>(initialCollapsed)
  // Intro (maqueta v86): una sola vez por sesión; "Ver introducción" en Más la repite.
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    try { return sessionStorage.getItem('nc_splash') !== '1' } catch { return true }
  })
  function dismissSplash() {
    try { sessionStorage.setItem('nc_splash', '1') } catch { /* sin almacenamiento */ }
    setShowSplash(false)
  }

  const isBasic = business?.subscription_plan === 'basic'
  const groups = visibleGroups(isOwner, isBasic)
  const flat = flatNav(groups)
  const mobileLeft = flat.filter((n) => MOBILE_LEFT.includes(n.to))
  const mobileRight = flat.filter((n) => MOBILE_RIGHT.includes(n.to))
  const quickActions = QUICK_ACTIONS.filter((a) => !isBasic || !QUICK_BLOCKED_BASIC.includes(a.to))

  // Título de la pestaña y anuncio para lectores de pantalla al cambiar de página.
  const pageTitle = flat.find((n) => (n.end ? pathname === n.to : pathname === n.to || pathname.startsWith(`${n.to}/`)))?.label
  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} · Nexcredit` : 'Nexcredit'
  }, [pageTitle])

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, String(collapsed)) } catch { /* sin almacenamiento */ }
  }, [collapsed])

  // Al cambiar de página se cierran los menús móviles.
  useEffect(() => {
    setDrawerOpen(false)
    setQuickOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!quickOpen) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setQuickOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [quickOpen])

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-[11px] font-medium transition-colors ${isActive ? 'text-primary' : 'text-content/50'}`

  return (
    <div className="min-h-screen sm:flex">
      <a href="#contenido" className="skip-link print-hide">Saltar al contenido</a>
      {showSplash && <Splash onDone={dismissSplash} />}
      <div className="sr-only" role="status" aria-live="polite">{pageTitle ? `Página: ${pageTitle}` : ''}</div>

      <Sidebar groups={groups} collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />

      <div className="min-w-0 flex-1">
        <OfflineBanner />
        <AppHeader pages={flat} onOpenDrawer={() => setDrawerOpen(true)} />

        <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-[1600px] px-4 pb-28 pt-3 focus:outline-none sm:px-8 sm:pb-10 sm:pt-4">
          <PageTransition />
        </main>

        {/* Navegación móvil inferior: Inicio | Clientes | (+) | Pagos | Más */}
        <nav aria-label="Navegación rápida" className="print-hide glass-panel glass-strong fixed inset-x-3 bottom-3 z-30 flex items-end justify-around !rounded-[22px] px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1 sm:hidden">
          {mobileLeft.map(({ to, label, end, icon: Icon }) => (
            <NavLink key={to} to={to} end={end} className={tabClass}>
              <Icon size={20} aria-hidden="true" />
              {label}
            </NavLink>
          ))}

          <div className="flex flex-1 flex-col items-center">
            <button
              onClick={() => setQuickOpen(true)}
              aria-label="Acción rápida"
              className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-[#2C6CEE] to-primary-fill text-white shadow-[0_10px_22px_-8px_rgba(37,99,235,0.9)] ring-4 ring-surface/80 transition-transform active:scale-95"
            >
              <Plus size={24} strokeWidth={2.5} />
            </button>
          </div>

          {mobileRight.map(({ to, label, end, icon: Icon }) => (
            <NavLink key={to} to={to} end={end} className={tabClass}>
              <Icon size={20} aria-hidden="true" />
              {label}
            </NavLink>
          ))}

          <button onClick={() => setDrawerOpen(true)} className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-[11px] font-medium text-content/50 transition-colors">
            <Menu size={20} aria-hidden="true" />
            Más
          </button>
        </nav>
      </div>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} groups={groups} onShowIntro={() => setShowSplash(true)} />
      <PendingPaymentsIndicator />

      {quickOpen && (
        <div className="print-hide fixed inset-0 z-40 sm:hidden">
          <div className="overlay-enter absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={() => setQuickOpen(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" aria-label="Acción rápida" className="glass-panel glass-strong sheet-enter absolute inset-x-3 bottom-3 !rounded-[24px] p-4 pb-5">
            <p className="mb-3 text-center text-sm font-semibold text-content">Acción rápida</p>
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map(({ to, label, icon: Icon }) => (
                <button
                  key={to}
                  onClick={() => { setQuickOpen(false); navigate(to) }}
                  className="flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-surface/70 px-2 py-3.5 text-center text-xs font-medium text-content/90 transition-all hover:border-primary/40 hover:bg-primary/10 active:scale-[0.97]"
                >
                  <Icon size={20} className="text-primary" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
