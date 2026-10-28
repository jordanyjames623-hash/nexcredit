import { lazy, type ComponentType } from 'react'

const KEY = 'capitalia_chunk_reload'

// Igual que React.lazy, pero si una pantalla no se puede descargar (típico justo después de publicar una
// versión nueva, cuando los archivos viejos ya no existen) recarga la página UNA sola vez para traer la nueva.
export function lazyPage<T extends ComponentType<any>>(loader: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const loaded = await loader()
      sessionStorage.removeItem(KEY)
      return loaded
    } catch (error) {
      if (!sessionStorage.getItem(KEY)) {
        sessionStorage.setItem(KEY, '1')
        window.location.reload()
        return new Promise<never>(() => undefined)
      }
      throw error
    }
  })
}
