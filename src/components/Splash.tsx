import { useEffect, useRef } from 'react'

// Intro de la app (maqueta v86): el nombre entra letra por letra, como el splash de NexFinance.
// Se muestra una sola vez por sesión; AppLayout guarda la marca en sessionStorage.
export function Splash({ onDone }: { onDone: () => void }) {
  // El temporizador se arma una sola vez: si onDone cambiara de identidad en cada render,
  // el timeout se reiniciaría sin parar y la intro nunca se cerraría sola.
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  useEffect(() => {
    const t = window.setTimeout(() => doneRef.current(), 2600)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <div role="dialog" aria-label="Bienvenido a NEXCREDIT" className="print-hide fixed inset-0 z-[70] flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#2C6CEE] to-primary-fill px-6">
      <div aria-hidden="true" className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
      <div aria-hidden="true" className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-white/10" />
      <p className="splash-fade relative mb-1 text-xs font-semibold uppercase tracking-[0.28em] text-white/70">Bienvenido a</p>
      <h1 className="relative text-center text-[42px] font-extrabold leading-none tracking-tight text-white" aria-label="NEXCREDIT">
        {'NEXCREDIT'.split('').map((letter, i) => (
          <span key={i} aria-hidden="true" className="splash-letter" style={{ animationDelay: `${300 + i * 90}ms` }}>{letter}</span>
        ))}
      </h1>
      <p className="splash-fade relative mt-4 text-center text-[15px] text-white/85">Préstamos claros, cobros al día</p>
      <div className="splash-btn relative mt-14 flex w-full max-w-xs flex-col items-center">
        <button onClick={onDone} className="w-full rounded-2xl bg-white py-3.5 text-base font-bold text-primary-dark shadow-lg transition-transform active:scale-[0.98]">
          Entrar
        </button>
        <button onClick={onDone} className="mt-3 py-1 text-sm font-medium text-white/80 transition-colors hover:text-white">
          Saltar intro
        </button>
      </div>
    </div>
  )
}
