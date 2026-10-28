import { useEffect, useMemo, useState } from 'react'

export type Token = 'primary' | 'primary-dark' | 'primary-light' | 'success' | 'warning' | 'danger' | 'text' | 'text-muted' | 'line' | 'surface' | 'navy'

function readTriplet(name: string): [number, number, number] {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()
  const parts = raw.split(/\s+/).map(Number)
  return parts.length === 3 && parts.every(Number.isFinite) ? [parts[0], parts[1], parts[2]] : [0, 0, 0]
}

export type ChartColors = {
  /** Color de un token del sistema: c('primary'), c('danger', 0.2) */
  c: (token: Token, alpha?: number) => string
  /** Serie n (0-4) de la paleta azul de gráficas */
  series: (index: number, alpha?: number) => string
}

// Recharts necesita colores reales (no variables CSS): se leen de los tokens y se actualizan
// solo cuando cambia el tema (claro/oscuro).
export function useChartColors(): ChartColors {
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const observer = new MutationObserver(() => setVersion((v) => v + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return useMemo(() => {
    const fmt = ([r, g, b]: [number, number, number], alpha?: number) =>
      alpha === undefined ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`
    return {
      c: (token: Token, alpha?: number) => fmt(readTriplet(`c-${token}`), alpha),
      series: (index: number, alpha?: number) => fmt(readTriplet(`chart-${(index % 5) + 1}`), alpha)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])
}
