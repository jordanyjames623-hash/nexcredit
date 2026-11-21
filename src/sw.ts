/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

declare const self: ServiceWorkerGlobalScope

// Limpia cachés viejos y sirve la shell precacheada.
cleanupOutdatedCaches()
const manifest = (self as unknown as { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }).__WB_MANIFEST
precacheAndRoute(manifest)

// Solo lecturas GET a la API de Supabase se cachean para consulta offline.
// Las escrituras (pagos, préstamos) NUNCA se cachean ni se reintentan en segundo plano.
// Se excluyen auth, storage, funciones y las lecturas sensibles (mismo criterio que antes).
registerRoute(
  ({ request, url }) => {
    if (request.method !== 'GET' || !url.hostname.endsWith('.supabase.co')) return false
    if (!url.pathname.startsWith('/rest/v1/')) return false
    const excluded = ['api_keys', 'backup_jobs', 'export_business_backup', 'get_my_business_nextex_identity']
    if (excluded.some((s) => url.pathname.includes(s) || url.search.includes(s))) return false
    return true
  },
  new NetworkFirst({
    cacheName: 'capitalia-reads',
    networkTimeoutSeconds: 4,
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 }),
      new CacheableResponsePlugin({ statuses: [0, 200] })
    ]
  })
)

type PushPayload = { title?: string; body?: string; url?: string }

self.addEventListener('push', (event) => {
  let data: PushPayload = {}
  try {
    data = (event.data?.json() ?? {}) as PushPayload
  } catch {
    data = { body: event.data?.text() ?? '' }
  }
  const title = data.title ?? 'NEXCREDIT'
  const options: NotificationOptions = {
    body: data.body ?? '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url ?? '/' }
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/'
  const target = new URL(url, self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((c) => c.url.startsWith(self.location.origin))
      if (existing) return existing.navigate(target).then((c) => c?.focus())
      return self.clients.openWindow(target)
    })
  )
})
