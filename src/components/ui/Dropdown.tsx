import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

// Cierra al hacer clic fuera o presionar Escape.
export function useOutsideClose(ref: RefObject<HTMLElement>, open: boolean, onClose: () => void) {
  const latest = useRef(onClose)
  latest.current = onClose
  useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) latest.current()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') latest.current()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, ref])
}

// Desplegable de vidrio: aparece con fade + escala suave. El botón que lo abre lo pones tú (trigger).
export function Dropdown({ trigger, children, align = 'right', panelClassName = 'w-72', label }: {
  trigger: (ctl: { open: boolean; toggle: () => void }) => ReactNode
  children: (ctl: { close: () => void }) => ReactNode
  align?: 'left' | 'right'
  panelClassName?: string
  label: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useOutsideClose(ref, open, close)

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className={`glass-panel glass-strong popover-enter absolute z-50 mt-2 p-1.5 ${align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'} ${panelClassName}`}
        >
          {children({ close })}
        </div>
      )}
    </div>
  )
}
