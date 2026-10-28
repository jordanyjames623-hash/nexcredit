import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { NotificationsBell } from '@/components/layout/NotificationsBell'
import { applyTheme, getTheme, type NcTheme } from './theme'

// Encabezado de la maqueta: fecha con ano, saludo segun la hora, boton claro/oscuro y
// campana. Lo llevan Inicio, Clientes, Pagos y Mas; Prestamos no lo lleva en la maqueta
// (empieza directo en el titulo).
export function GreetingHeader() {
  const { profile } = useAuth()
  const [theme, setTheme] = useState<NcTheme>(() => getTheme())
  const now = new Date()
  const firstName = (profile?.full_name || '').trim().split(' ')[0] || ''
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  const dateLine = now.toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const dateLabel = dateLine.charAt(0).toUpperCase() + dateLine.slice(1)

  function toggleTheme() {
    const next: NcTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-[var(--nc-muted)]">{dateLabel}</p>
        <h1 className="text-[26px] font-bold leading-tight text-[var(--nc-text)]">{greeting}{firstName ? `, ${firstName}` : ''} 👋</h1>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button onClick={toggleTheme} aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          className="rounded-xl bg-[var(--nc-card)] p-2 text-[var(--nc-muted)] active:scale-95">
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <div className="rounded-xl bg-[var(--nc-card)] p-1"><NotificationsBell /></div>
      </div>
    </div>
  )
}
