import { Sparkles } from 'lucide-react'

const EXAMPLES = [
  '¿Cuánto tengo prestado?', '¿Cuánto está vencido?', '¿Cuánto recuperamos este mes?',
  '¿Cuál es mi cartera vencida?', '¿Qué producto tiene mayor mora?', '¿Cuánto generó cada colaborador?'
]

export function Intelligence() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="t-h1 text-content">Inteligencia</h1>
        <p className="text-sm text-content-muted">Asistente Nexcredit — preparado, aún sin activar.</p>
      </div>

      <div className="glass-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles size={18} className="text-primary" />
          <h2 className="text-sm font-semibold text-content">Asistente Nexcredit</h2>
        </div>
        <p className="text-sm text-content-muted">
          Esta sección está lista para conectarse a un modelo de lenguaje que responda preguntas sobre tu negocio,
          consultando los mismos datos que ya ves en Dashboard, Cobranza, Riesgo, Finanzas y Colaboradores —
          respetando siempre los permisos de quien pregunta. Aún no está conectada a ningún proveedor de IA.
        </p>
        <div className="mt-4 border-t border-line pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-muted">Lo que podrá responder</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <span key={e} className="rounded-full border border-line px-3 py-1.5 text-xs text-content-muted">{e}</span>
            ))}
          </div>
        </div>
        <p className="mt-4 text-xs text-content-muted">
          Para activarlo hace falta decidir un proveedor de modelo de lenguaje (y su costo por uso) — cuando lo tengas, lo conectamos aquí.
        </p>
      </div>
    </div>
  )
}
