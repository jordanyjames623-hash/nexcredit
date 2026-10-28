import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { RefreshCw } from 'lucide-react'

// Antes: la app dependía de que el navegador, por su cuenta, notara una versión nueva — podía tardar
// mucho (a veces hasta que se cerraba la PWA del todo), por eso había que refrescar varias veces a mano.
// Ahora: comprueba activamente cada minuto mientras la app está abierta, y en cuanto hay una versión
// nueva lista, avisa con un botón — nunca recarga sola, para no perder algo que el usuario esté
// llenando a mitad de camino.
export function UpdatePrompt() {
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [updateFn, setUpdateFn] = useState<((reload?: boolean) => Promise<void>) | null>(null)

  useEffect(() => {
    const update = registerSW({
      immediate: true,
      onRegistered(registration) {
        if (!registration) return
        const interval = setInterval(() => { registration.update() }, 60_000)
        return () => clearInterval(interval)
      },
      onNeedRefresh() { setNeedsRefresh(true) },
    })
    setUpdateFn(() => update)
  }, [])

  if (!needsRefresh) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] flex justify-center px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:bottom-4">
      <div className="glass-panel glass-strong flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg">
        <RefreshCw size={16} className="shrink-0 text-primary" />
        <p className="text-sm text-content">Hay una versión nueva de NEXCREDIT lista.</p>
        <button
          onClick={() => updateFn?.(true)}
          className="btn-solid shrink-0 !px-3 !py-1.5 text-xs"
        >
          Actualizar ahora
        </button>
      </div>
    </div>
  )
}
