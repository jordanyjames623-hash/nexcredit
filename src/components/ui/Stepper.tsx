import { Check } from 'lucide-react'

export type Step = { id: string; label: string; description?: string }

// Progreso de un proceso por pasos. Los pasos ya completados se pueden volver a abrir.
export function Stepper({ steps, current, onSelect }: { steps: Step[]; current: number; onSelect?: (index: number) => void }) {
  return (
    <ol aria-label="Progreso" className="flex items-start">
      {steps.map((step, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={step.id} className="flex flex-1 items-start last:flex-none" aria-current={active ? 'step' : undefined}>
            <button
              type="button"
              disabled={!done || !onSelect}
              onClick={() => onSelect?.(i)}
              className="flex items-center gap-3 rounded-xl text-left disabled:cursor-default"
              aria-label={`Paso ${i + 1}: ${step.label}${done ? ' (completado)' : ''}`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-all duration-200 ${
                  done ? 'border-primary bg-primary text-white'
                    : active ? 'border-primary bg-primary/10 text-primary ring-4 ring-primary/20'
                    : 'border-line bg-surface text-content-muted'
                }`}
              >
                {done ? <Check size={16} aria-hidden="true" /> : i + 1}
              </span>
              <span className="hidden sm:block">
                <span className={`block text-sm font-semibold ${active || done ? 'text-content' : 'text-content-muted'}`}>{step.label}</span>
                {step.description && <span className="block text-xs text-content-muted">{step.description}</span>}
              </span>
            </button>
            {i < steps.length - 1 && (
              <span aria-hidden="true" className={`mx-3 mt-[17px] h-0.5 min-w-4 flex-1 rounded-full transition-colors duration-300 ${done ? 'bg-primary' : 'bg-line'}`} />
            )}
          </li>
        )
      })}
    </ol>
  )
}
