import { useEffect } from 'react'

// Intro de la maqueta: fondo azul plano con dos círculos decorativos, NEXCREDIT en letras
// que entran una por una (como el splash de NexFinance) y "Saltar intro". Sin botón Entrar:
// la intro entra sola a los 2.6 s (decisión de JC 2026-10-25). 
const LETTERS = 'NEXCREDIT'.split('')

export function Splash({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 2600)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#2563EB]" role="dialog" aria-label="Bienvenido a NEXCREDIT">
      <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#3B82F6]" aria-hidden="true" />
      <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-[#3B82F6]" aria-hidden="true" />
      <div className="relative flex flex-1 flex-col items-center justify-center px-6">
        <h1 className="text-center text-[40px] font-extrabold leading-none tracking-tight text-white" aria-hidden="true">
          {LETTERS.map((ch, i) => (
            <span key={i} className="splash-letter" style={{ animationDelay: `${i * 90}ms` }}>{ch}</span>
          ))}
        </h1>
        <p className="splash-fade mt-3 text-center text-base text-white/90">Préstamos claros, cobros al día</p>
      </div>
      <div className="relative px-4 pb-8">
        <button onClick={onDone} className="text-sm text-white/90">Saltar intro</button>
      </div>
    </div>
  )
}
