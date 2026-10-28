import { useEffect, useRef } from 'react'
import { X, LogOut, Sparkles } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { BrandMark } from './BrandMark'
import { NavList } from './NavList'
import { PlanCard } from './PlanCard'
import type { NavGroup } from './navConfig'

// Menú lateral para móvil: se desliza desde la izquierda, oscurece y desenfoca el fondo.
export function MobileDrawer({ open, onClose, groups, onShowIntro }: { open: boolean; onClose: () => void; groups: NavGroup[]; onShowIntro?: () => void }) {
  const { business, signOut } = useAuth()
  const closeRef = useRef<HTMLButtonElement>(null)
  const mainGroups = groups.filter((g) => g.id !== 'config')
  const pinnedGroups = groups.filter((g) => g.id === 'config')

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="print-hide fixed inset-0 z-50 sm:hidden">
      <div className="overlay-enter absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menú principal"
        className="drawer-enter absolute inset-y-0 left-0 flex w-[84%] max-w-xs flex-col rounded-r-[24px] border-r border-white/10 bg-gradient-to-b from-navy to-navy-light shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-5">
          <div className="flex min-w-0 items-center gap-3">
            {business?.logo_url ? <img src={business.logo_url} alt="" className="h-9 w-9 rounded-[11px] object-cover" /> : <BrandMark size={36} />}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-on-navy">{business?.name ?? 'NEXCREDIT'}</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-on-navy/60">Nexcredit</p>
            </div>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Cerrar menú" className="flex h-9 w-9 items-center justify-center rounded-xl text-on-navy/70 transition-colors hover:bg-white/10 hover:text-on-navy">
            <X size={20} />
          </button>
        </div>

        <nav aria-label="Principal" className="scroll-thin flex-1 overflow-y-auto px-3 py-2">
          <NavList groups={mainGroups} onNavigate={onClose} />
          <div className="mt-3"><PlanCard onNavigate={onClose} /></div>
          {onShowIntro && (
            <button onClick={() => { onClose(); onShowIntro() }} className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-on-navy/80 transition-colors hover:bg-white/10">
              <Sparkles size={16} aria-hidden="true" /> Ver introducción
            </button>
          )}
        </nav>

        <div className="grid grid-cols-[1fr_auto] items-stretch gap-2 border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="min-w-0">
            {pinnedGroups.length > 0 && <NavList groups={pinnedGroups} onNavigate={onClose} />}
          </div>
          <button onClick={() => { onClose(); signOut() }} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-medium text-on-navy/80 transition-colors hover:bg-white/10">
            <LogOut size={16} aria-hidden="true" /> Salir
          </button>
        </div>
      </aside>
    </div>
  )
}
