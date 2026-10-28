import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { ProPitchContent } from '@/components/UpgradeToProModal'

// Las páginas de funciones por plan no se abren si el negocio no tiene esa función activa — ni
// escribiendo la dirección a mano. (La base de datos también las bloquea; esto solo evita mostrar una
// pantalla vacía.) Qué función exige cada página se decide en App.tsx, no aquí; lo que está disponible
// para el negocio viene de business_has_feature() — su plan, salvo que el administrador de la
// plataforma le haya puesto una anulación puntual (ver SuperAdmin → Funciones por plan).
export function RequirePaid({ feature, children }: { feature: string; children: ReactNode }) {
  const { isOwner, hasFeature } = useAuth()
  if (hasFeature(feature)) return <>{children}</>
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="glass-card p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Lock size={22} className="text-primary" />
        </div>
        <h1 className="t-h1 text-content">Esta función no está disponible en tu plan</h1>
        <p className="mt-1 text-sm text-content-muted">
          {isOwner ? 'Mejora tu plan para usar rutas, cobranza, gastos, colaboradores y más.' : 'Pídele al propietario del negocio que mejore el plan.'}
        </p>
      </div>
      {isOwner && (
        <div className="glass-card p-6"><ProPitchContent compact /></div>
      )}
      <Link to="/" className="block text-center text-sm text-primary hover:underline">Volver al inicio</Link>
    </div>
  )
}
