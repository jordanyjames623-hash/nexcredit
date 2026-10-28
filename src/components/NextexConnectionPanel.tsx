import { useEffect, useState } from 'react'
import { Copy, Check, Eye, EyeOff, MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'

// Copia local del widget (SEC-038, mismo origen): el JS se sirve desde Capitalia, no desde
// nextex-seven. El archivo vive en public/widget/nextex-chat.js (copia de texter); su apiBase
// queda fija en nextex (ver el archivo) porque la configuracion y el chat viven alli.
const WIDGET_SRC = '/widget/nextex-chat.js'
// Widget key for nexcredit in nextex (client_widgets.embed_key). Public identifier, not a secret.
const WIDGET_EMBED_KEY = 'wdg_c5df95a06ac128e06440930ffa6e1a15'
const ENDPOINT = 'https://capitalia-beta.vercel.app/api/v1/nextex'

export function NextexConnectionPanel() {
  const { business } = useAuth()
  const toast = useToast()
  const [showKey, setShowKey] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [widgetOn, setWidgetOn] = useState(false)
  // SEC-002 capa DB: la identidad se pide por RPC solo-dueno (get_my_business_nextex_identity).
  // La lectura directa quedo revocada (migracion F6-B): un SELECT directo ya no devuelve nada.
  const [identity, setIdentity] = useState<{ nextex_id: string | null; nextex_key: string | null } | null>(null)
  useEffect(() => {
    let alive = true
    supabase.rpc('get_my_business_nextex_identity').maybeSingle().then(({ data, error }) => {
      if (alive && !error) setIdentity((data as { nextex_id: string | null; nextex_key: string | null }) ?? null)
    })
    return () => { alive = false }
  }, [])

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return
    }
    setCopied(label)
    toast.success('Copiado')
    window.setTimeout(() => setCopied(null), 2000)
  }

  // Chat en vivo dentro del panel: el script solo se inyecta al activarlo y se retira al
  // apagarlo o salir de la sección (no queda pegado al resto de la app).
  const nextexKey = identity?.nextex_key ?? ''
  useEffect(() => {
    if (!widgetOn) return
    const script = document.createElement('script')
    script.src = WIDGET_SRC
    script.setAttribute('data-key', WIDGET_EMBED_KEY)
    document.body.appendChild(script)
    return () => {
      script.remove()
      document.getElementById('nextex-widget-container')?.remove()
    }
  }, [widgetOn])

  if (!business) return null

  if (!identity?.nextex_id) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-content">La identidad nextex de este negocio aún no existe.</p>
        <p className="text-xs text-content-muted">
          Aplica la migración 20261025_nextex_connector.sql en Supabase (proyecto capitalia) y recarga:
          el negocio recibirá su nextex_id automáticamente, sin tocar ningún dato.
        </p>
      </div>
    )
  }

  const snippet = `<script src="${WIDGET_SRC}" data-key="${WIDGET_EMBED_KEY}"></script>`
  const copyBtn = (label: string) => (copied === label ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />)

  return (
    <div className="space-y-5">
      <div>
        <p className="t-label mb-1.5">Identificador nextex</p>
        <div className="flex items-center gap-2">
          <code className="rounded-lg bg-background px-3 py-2 font-mono text-sm font-semibold text-content">{identity?.nextex_id}</code>
          <span className="badge-success">Activa</span>
          <button onClick={() => copy(identity.nextex_id!, 'id')} className="btn-secondary !px-2.5 !py-2 text-xs" aria-label="Copiar identificador">
            {copyBtn('id')} Copiar
          </button>
        </div>
        <p className="mt-1.5 text-xs text-content-muted">Así te reconoce nextex entre todos los negocios.</p>
      </div>

      <div>
        <p className="t-label mb-1.5">Llave mini-API</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-lg bg-background px-3 py-2 font-mono text-sm text-content">
            {nextexKey ? (showKey ? nextexKey : `${nextexKey.slice(0, 3)}••••••••`) : 'Pendiente'}
          </code>
          {nextexKey && (
            <>
              <button onClick={() => setShowKey((v) => !v)} className="btn-secondary !px-2.5 !py-2 text-xs" aria-label={showKey ? 'Ocultar llave' : 'Mostrar llave'}>
                {showKey ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
              </button>
              <button onClick={() => copy(nextexKey, 'key')} className="btn-secondary !px-2.5 !py-2 text-xs" aria-label="Copiar llave">
                {copyBtn('key')} Copiar
              </button>
            </>
          )}
        </div>
        <p className="mt-1.5 text-xs text-content-muted">Con esta llave nextex lee tu negocio. No la compartas fuera de nextex.</p>
      </div>

      <div>
        <p className="t-label mb-1.5">Endpoint del negocio</p>
        <code className="block break-all rounded-lg bg-background px-3 py-2 font-mono text-xs text-content">{ENDPOINT}</code>
        <p className="mt-1.5 text-xs text-content-muted">
          GET con el header <code className="font-mono">x-nextex-key</code> y tu llave. Devuelve clientes activos,
          préstamos activos, total prestado, total cobrado y gastos del mes — solo de este negocio. Sin llave válida responde 401.
        </p>
      </div>

      <div>
        <p className="t-label mb-1.5">Widget de chat (mismo que Infinite Smells)</p>
        <pre className="overflow-x-auto rounded-lg bg-background px-3 py-2 font-mono text-xs leading-relaxed text-content">{snippet}</pre>
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={() => copy(snippet, 'snippet')} className="btn-secondary !px-3 !py-2 text-xs">
            {copyBtn('snippet')} Copiar código
          </button>
          <button onClick={() => setWidgetOn((v) => !v)} disabled={!WIDGET_EMBED_KEY} className="btn-solid !px-3 !py-2 text-xs">
            <MessageCircle size={14} aria-hidden="true" /> {widgetOn ? 'Ocultar chat' : 'Probar chat aquí'}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-content-muted">
          Al probarlo aparece la burbuja abajo a la derecha. El chat responde con los datos de este negocio
          cuando nextex tenga registrada esta llave (el mismo registro que usa Infinite Smells).
        </p>
      </div>
    </div>
  )
}
