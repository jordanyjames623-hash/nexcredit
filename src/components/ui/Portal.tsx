import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Dibuja su contenido directamente en <body>, fuera de la página: así los modales y comprobantes
// siempre cubren toda la pantalla, sin importar animaciones ni contenedores de los que provengan.
export function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}
