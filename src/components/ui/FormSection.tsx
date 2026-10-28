import type { ReactNode } from 'react'

// Sección de formulario: título claro, descripción corta y los campos debajo. "action" es opcional —
// un botón o enlace en la esquina superior derecha del encabezado, junto al título.
export function FormSection({ title, description, headingId, action, children }: { title: string; description?: string; headingId?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={headingId} tabIndex={headingId ? -1 : undefined} className="t-h3 text-content outline-none">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-content-muted">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}
