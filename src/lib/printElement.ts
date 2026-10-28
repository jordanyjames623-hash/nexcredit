// Imprime UN elemento (por ejemplo, un comprobante) en un documento aislado.
//
// Por qué así: imprimir la página de la app arrastra su barra lateral, sus capas flotantes y el tema oscuro
// (texto casi blanco sobre papel blanco) y cada navegador lo resuelve distinto. Aquí el comprobante se copia a un
// <iframe> con las mismas hojas de estilo pero SIN la clase "dark": el papel siempre usa el tema claro y la
// vista previa solo contiene el comprobante.
const FRAME_ATTR = 'data-print-frame'
let printingUntil = 0
let listening = false

// Quita los documentos de impresión que hayan quedado en la página. Un iframe olvidado puede "colarse" al
// imprimir OTRA pantalla (p. ej. Reportes) como una página extra en blanco.
export function removePrintFrames() {
  document.querySelectorAll(`iframe[${FRAME_ATTR}]`).forEach((frame) => frame.remove())
}

// Si se imprime la página principal, se descartan los iframes restantes. Se ignora durante los segundos en que se
// está abriendo la impresión de un comprobante (algunos navegadores disparan este evento también entonces).
function cleanBeforePrintingPage() {
  if (listening) return
  listening = true
  window.addEventListener('beforeprint', () => { if (Date.now() > printingUntil) removePrintFrames() })
}

export async function buildPrintFrame(source: HTMLElement): Promise<HTMLIFrameElement> {
  removePrintFrames()
  cleanBeforePrintingPage()
  const iframe = document.createElement('iframe')
  iframe.setAttribute(FRAME_ATTR, '')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.tabIndex = -1
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none'
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  if (!doc) { iframe.remove(); throw new Error('No se pudo preparar la impresión.') }
  doc.open()
  doc.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comprobante</title></head><body></body></html>')
  doc.close()

  // Mismas hojas de estilo que la app (la clase "dark" no se copia a propósito).
  const loading: Promise<void>[] = []
  document.querySelectorAll<HTMLElement>('link[rel="stylesheet"], style').forEach((node) => {
    const clone = node.cloneNode(true) as HTMLElement
    if (clone.tagName === 'LINK') {
      loading.push(new Promise<void>((resolve) => {
        clone.addEventListener('load', () => resolve())
        clone.addEventListener('error', () => resolve())
      }))
    }
    doc.head.appendChild(clone)
  })

  doc.body.style.margin = '0'
  doc.body.style.background = '#fff'
  doc.body.innerHTML = source.outerHTML

  // Espera a que carguen estilos, logo y tipografías (con un tope, para no dejar la pantalla colgada).
  const images = Array.from(doc.images).map((img) =>
    img.complete ? Promise.resolve() : new Promise<void>((resolve) => { img.onload = () => resolve(); img.onerror = () => resolve() })
  )
  const fonts = doc.fonts?.ready ? doc.fonts.ready.then(() => undefined) : Promise.resolve()
  await Promise.race([
    Promise.all([...loading, ...images, fonts]),
    new Promise<void>((resolve) => window.setTimeout(resolve, 3000))
  ])
  return iframe
}

export async function printElement(source: HTMLElement): Promise<void> {
  const iframe = await buildPrintFrame(source)
  const win = iframe.contentWindow
  if (!win) { iframe.remove(); throw new Error('No se pudo abrir la impresión.') }
  // No se quita al terminar la impresión: Safari avisa "afterprint" antes de que se cierre el cuadro de impresión y
  // quitarlo antes de tiempo dejaría el PDF en blanco. Se limpia al cerrar el comprobante, al imprimir otra cosa
  // o, como último recurso, pasados 10 minutos.
  window.setTimeout(() => iframe.remove(), 10 * 60_000)
  printingUntil = Date.now() + 4000
  win.focus()
  win.print()
}
