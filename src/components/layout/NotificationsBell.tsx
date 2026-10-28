import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, AlertTriangle, Clock, UserX, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Dropdown } from '@/components/ui/Dropdown'

type Alerts = { cuotas_vencidas: number; vencen_hoy: number; sin_pago_reciente: number }

// Campana: muestra las mismas alertas que calcula el Dashboard (misma consulta, misma caché).
export function NotificationsBell() {
  const { hasFeature } = useAuth()
  const query = useQuery({
    queryKey: ['dashboard_alerts'],
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_alerts')
      if (error) throw error
      return data as Alerts
    }
  })
  const a = query.data
  const items = a
    ? [
        { key: 'v', n: a.cuotas_vencidas, text: a.cuotas_vencidas === 1 ? 'cuota vencida' : 'cuotas vencidas', hint: 'Requieren gestión de cobro', to: hasFeature('cobranza') ? '/cobranza' : '/prestamos', icon: AlertTriangle, tone: 'text-danger bg-danger/10' },
        { key: 'h', n: a.vencen_hoy, text: a.vencen_hoy === 1 ? 'cuota vence hoy' : 'cuotas vencen hoy', hint: 'Cobros de hoy', to: hasFeature('calendario') ? '/calendario' : '/pagos', icon: Clock, tone: 'text-warning-text bg-warning/20' },
        { key: 's', n: a.sin_pago_reciente, text: a.sin_pago_reciente === 1 ? 'cliente sin pagos en 30 días' : 'clientes sin pagos en 30 días', hint: 'Conviene contactarlos', to: '/clientes', icon: UserX, tone: 'text-warning-text bg-warning/20' }
      ].filter((i) => i.n > 0)
    : []
  const total = items.reduce((sum, i) => sum + i.n, 0)

  return (
    <Dropdown
      label="Notificaciones"
      panelClassName="w-80"
      trigger={({ open, toggle }) => (
        <button
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={total > 0 ? `Notificaciones, ${total} pendientes` : 'Notificaciones'}
          className="relative flex h-10 w-10 items-center justify-center rounded-xl text-content-muted transition-colors hover:bg-primary/10 hover:text-primary active:scale-95"
        >
          <Bell size={19} />
          {total > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-[1.1rem] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-white">
              {total > 9 ? '9+' : total}
            </span>
          )}
        </button>
      )}
    >
      {({ close }) => (
        <div>
          <p className="px-3 pb-1 pt-2 text-sm font-semibold text-content">Notificaciones</p>
          {items.length === 0 ? (
            <div className="flex items-center gap-3 px-3 py-4 text-sm text-content-muted">
              <Check size={20} className="text-success-text" />
              Todo está al día.
            </div>
          ) : (
            <ul>
              {items.map((i) => {
                const Icon = i.icon
                return (
                <li key={i.key}>
                  <Link to={i.to} onClick={close} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-primary/10">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${i.tone}`}><Icon size={17} /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-content">{i.n} {i.text}</span>
                      <span className="block text-xs text-content-muted">{i.hint}</span>
                    </span>
                  </Link>
                </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </Dropdown>
  )
}
