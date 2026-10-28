import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Portal } from './Portal'

const SIZE = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-4xl' } as const
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Modal de vidrio: oscurece y desenfoca el fondo, aparece con fade + escala, atrapa el foco,
// se cierra con Escape o al tocar fuera, y en móvil se comporta como una hoja inferior.
export function Modal({ title, subtitle, onClose, children, size = 'md', flush = false }: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  size?: keyof typeof SIZE
  /** Sin encabezado ni relleno: el contenido trae su propio diseño (ej. la oferta de plan). */
  flush?: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const latestClose = useRef(onClose)
  latestClose.current = onClose

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const panel = panelRef.current
    panel?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { latestClose.current(); return }
      if (e.key !== 'Tab' || !panel) return
      const items = Array.from<HTMLElement>(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKey)
      previousFocus?.focus?.()
    }
  }, [])

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="overlay-enter absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={flush ? undefined : titleId}
        aria-label={flush ? title : undefined}
        tabIndex={-1}
        className={`glass-panel glass-strong modal-enter relative max-h-[92dvh] w-full ${SIZE[size]} overflow-y-auto !rounded-b-none outline-none sm:!rounded-[var(--radius-modal)] ${flush ? '' : 'p-5'}`}
      >
        {!flush && (
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={titleId} className="t-h3 truncate text-content">{title}</h2>
              {subtitle && <p className="mt-0.5 text-xs text-content-muted">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Cerrar"
              className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-primary/10 hover:text-content">
              <X size={18} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
    </Portal>
  )
}
