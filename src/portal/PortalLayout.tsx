import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { getPortalToken, getPortalClientName, clearPortalSession } from '@/lib/portalAuth'
import { supabase } from '@/lib/supabase'
import { BrandMark } from '@/components/layout/BrandMark'

// Envoltorio de las pantallas del portal: exige un token de sesión del portal (sessionStorage), nunca una
// sesión de staff. Si no hay token, manda a /portal/entrar — esto es independiente de ProtectedRoute,
// que es solo para el equipo del negocio.
export function PortalLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const name = getPortalClientName()

  useEffect(() => {
    if (!getPortalToken()) { navigate('/portal/entrar', { replace: true }); return }
    setReady(true)
  }, [navigate])

  if (!ready) return null

  // El logout avisa primero al servidor (revoca la sesión de verdad, no solo el navegador) y después
  // recarga la página completa en vez de navegar por el router: así se garantiza que no quede ningún
  // dato en memoria (el formulario de entrada nunca ve una cédula o PIN de una sesión anterior).
  async function logout() {
    const token = getPortalToken()
    clearPortalSession()
    if (token) { try { await supabase.rpc('portal_logout', { p_token: token }) } catch { /* ya se borró localmente; no bloquear la salida por un fallo de red */ } }
    window.location.href = '/portal/entrar'
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link to="/portal" className="flex items-center gap-2">
            <BrandMark size={28} />
            <span className="text-sm font-semibold text-content">Mi cuenta{name ? ` · ${name}` : ''}</span>
          </Link>
          <button onClick={() => { void logout() }} className="flex items-center gap-1.5 text-sm text-content-muted hover:text-content">
            <LogOut size={15} aria-hidden="true" /> Salir
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6 pb-12">{children}</main>
    </div>
  )
}
