import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { AuthProvider } from '@/contexts/AuthContext'
import { ToastProvider } from '@/components/ui/Toast'
import { UpdatePrompt } from '@/components/UpdatePrompt'
// La app nueva vive en ./nuevo (la maqueta presentada). La App anterior queda en ./App
// sin usarse: no se publica en este despliegue.
import App from './nuevo/App'
import { installErrorReporter } from '@/lib/errorReporter'
import './styles/tokens.css'
import './styles/motion.css'
import './index.css'

// NEXCREDIT-2: los errores de la app se reportan a nextex (solo tipo + mensaje + ruta).
installErrorReporter()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <App />
            <UpdatePrompt />
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>
)
