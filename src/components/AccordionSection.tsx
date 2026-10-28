import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

// Sección desplegable con apertura suave. El contenido solo se monta cuando se abre
// (así los paneles pesados no consultan datos hasta que se necesitan).
export function AccordionSection({ id, title, tone, openId, setOpenId, children }: {
  id: string; title: string; tone?: 'danger'; openId: string | null; setOpenId: (id: string | null) => void
  children: ReactNode
}) {
  const isOpen = openId === id
  const [mounted, setMounted] = useState(isOpen)
  const panelId = `accordion-${id}`

  useEffect(() => {
    if (isOpen) { setMounted(true); return }
    const timer = window.setTimeout(() => setMounted(false), 260)   // deja terminar la animación de cierre
    return () => window.clearTimeout(timer)
  }, [isOpen])

  return (
    <section className={`glass-card overflow-hidden ${tone === 'danger' ? '!border-danger/30' : ''}`}>
      <button
        onClick={() => setOpenId(isOpen ? null : id)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-primary/5"
        aria-expanded={isOpen}
        aria-controls={panelId}
      >
        <h2 className={`text-sm font-semibold ${tone === 'danger' ? 'text-danger' : 'text-content'}`}>{title}</h2>
        <ChevronDown size={16} className={`shrink-0 text-content-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      <div id={panelId} role="region" aria-label={title} className="collapse-grid" data-open={isOpen} aria-hidden={!isOpen}>
        <div>
          {mounted && <div className="border-t border-line p-5">{children}</div>}
        </div>
      </div>
    </section>
  )
}
