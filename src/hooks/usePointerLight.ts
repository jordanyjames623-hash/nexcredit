import { useEffect } from 'react'

// Luz sutil que sigue al cursor sobre la tarjeta o el panel de vidrio que está debajo.
// - Un único listener para toda la app (no uno por tarjeta) y como mucho un cálculo por cuadro.
// - Solo actualiza variables CSS en UN elemento; el dibujo lo hace el navegador (opacity/transform).
// - Se desactiva con pantallas táctiles y con "reducir movimiento".
const SELECTOR = '.glass-card, .glass-panel'

export function usePointerLight() {
  useEffect(() => {
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!finePointer.matches || reduced.matches) return

    let frame = 0
    let current: HTMLElement | null = null
    let last: PointerEvent | null = null

    function release(el: HTMLElement | null) {
      if (!el) return
      el.removeAttribute('data-lit')
      el.style.removeProperty('--px')   // el micro-parallax vuelve suavemente a su lugar
      el.style.removeProperty('--py')
    }

    function update() {
      frame = 0
      const e = last
      if (!e) return
      const target = (e.target as Element | null)?.closest<HTMLElement>(SELECTOR) ?? null
      if (target !== current) {
        release(current)
        current = target
        current?.setAttribute('data-lit', 'true')
      }
      if (current) {
        const rect = current.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        current.style.setProperty('--mx', `${x.toFixed(0)}px`)
        current.style.setProperty('--my', `${y.toFixed(0)}px`)
        current.style.setProperty('--px', ((x / Math.max(rect.width, 1)) * 2 - 1).toFixed(3))
        current.style.setProperty('--py', ((y / Math.max(rect.height, 1)) * 2 - 1).toFixed(3))
      }
    }

    function onMove(e: PointerEvent) {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
      last = e
      if (!frame) frame = requestAnimationFrame(update)
    }
    function onLeave() {
      last = null
      release(current)
      current = null
    }

    document.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      if (frame) cancelAnimationFrame(frame)
      release(current)
    }
  }, [])
}
