import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'url'

// NEXCREDIT — app de cobranza y préstamos
// El service worker cachea la shell y las lecturas (GET a Supabase REST) para consulta offline.
// Las escrituras (pagos, préstamos) NUNCA se cachean ni se reintentan en segundo plano:
// el cliente Supabase debe fallar visiblemente sin conexión (ver src/lib/supabase.ts y useOnlineStatus).
export default defineConfig({
  resolve: {
    // El mismo atajo "@/" que ya está declarado en tsconfig.json, pero Vite necesita
    // configurarlo aparte: tsconfig solo lo usa TypeScript/el editor, no el empaquetador.
    // Se usa import.meta.url (no __dirname) porque este archivo se carga como ESM.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'NEXCREDIT — Gestión de préstamos',
        short_name: 'NEXCREDIT',
        description: 'Control de clientes, préstamos, cobros y rutas.',
        theme_color: '#0A1A3A',
        background_color: '#0A1A3A',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Solo lecturas GET a la API de Supabase se cachean para consulta offline.
            urlPattern: ({ request, url }) => {
              if (request.method !== 'GET' || !url.hostname.endsWith('.supabase.co')) return false
              if (!url.pathname.startsWith('/rest/v1/')) return false
              const excluded = ['api_keys', 'backup_jobs', 'export_business_backup', 'get_my_business_nextex_identity']
              if (excluded.some((s) => url.pathname.includes(s) || url.search.includes(s))) return false
              return true
            },
            handler: 'NetworkFirst',
            options: {
              cacheName: 'capitalia-reads',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Librerías grandes en paquetes propios: se cachean aparte y no se re-descargan en cada versión.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          supabase: ['@supabase/supabase-js'],
          query: ['@tanstack/react-query']
        }
      }
    }
  },
  server: { port: 5173 }
})
