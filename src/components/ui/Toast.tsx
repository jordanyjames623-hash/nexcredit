import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, AlertTriangle, Info, X, type LucideIcon } from 'lucide-react'

type Kind = 'success' | 'error' | 'info'
type Item = { id: number; kind: Kind; message: string }
type Api = { success: (message: string) => void; error: (message: string) => void; info: (message: string) => void }

const ToastContext = createContext<Api | null>(null)

const STYLE: Record<Kind, { icon: LucideIcon; tone: string }> = {
  success: { icon: Check, tone: 'bg-success/10 text-success-text' },
  error: { icon: AlertTriangle, tone: 'bg-danger/10 text-danger' },
  info: { icon: Info, tone: 'bg-primary/10 text-primary' }
}

export function useToast(): Api {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider')
  return ctx
}

// Avisos breves de vidrio (éxito / error / información). Se anuncian a lectores de pantalla.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), [])
  const push = useCallback((kind: Kind, message: string) => {
    const id = nextId.current++
    setItems((list) => [...list.slice(-2), { id, kind, message }])   // máximo 3 a la vez
    window.setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3500)
  }, [dismiss])

  const api = useMemo<Api>(() => ({
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m)
  }), [push])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="print-hide pointer-events-none fixed inset-x-3 bottom-24 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:items-end"
      >
        {items.map((t) => {
          const { icon: Icon, tone } = STYLE[t.kind]
          return (
            <div key={t.id} className="glass-panel glass-strong popover-enter pointer-events-auto flex max-w-sm items-center gap-3 !rounded-2xl py-2.5 pl-3 pr-2 text-sm font-medium text-content">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tone}`}><Icon size={15} aria-hidden="true" /></span>
              <span>{t.message}</span>
              <button onClick={() => dismiss(t.id)} aria-label="Cerrar aviso" className="rounded-md p-1 text-content-muted transition-colors hover:text-content">
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
