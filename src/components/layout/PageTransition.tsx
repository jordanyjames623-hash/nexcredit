import { Suspense, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { PageFallback } from './PageFallback'

// Cada cambio de página entra con un fade + deslizamiento mínimo (respeta prefers-reduced-motion).
// Las pantallas se descargan bajo demanda; mientras llegan se muestra un esqueleto.
export function PageTransition() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return (
    <div key={pathname} className="page-enter">
      <Suspense fallback={<PageFallback />}>
        <Outlet />
      </Suspense>
    </div>
  )
}
