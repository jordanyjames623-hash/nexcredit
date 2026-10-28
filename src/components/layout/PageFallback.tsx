import { Skeleton } from '@/components/dashboard/shared'

// Esqueleto que se ve mientras se descarga la pantalla (la barra lateral y el header no desaparecen).
export function PageFallback() {
  return (
    <div aria-busy="true" aria-label="Cargando pantalla" className="space-y-4">
      <Skeleton className="h-9 w-56" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 !rounded-2xl" />)}
      </div>
      <Skeleton className="h-64 !rounded-2xl" />
    </div>
  )
}
