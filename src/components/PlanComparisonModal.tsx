import { useQuery } from '@tanstack/react-query'
import { Check, X as XIcon, MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { upgradeWhatsappLink, PLAN_NAME_ES } from '@/components/UpgradeToProModal'
import { useAuth } from '@/contexts/AuthContext'

type Plan = 'basic' | 'pro' | 'business'
const PLANS: Plan[] = ['basic', 'pro', 'business']
const PLAN_LABEL: Record<Plan, string> = { basic: 'Básico', pro: 'Pro', business: 'Business' }
type PlanLimitRow = {
  plan: Plan; price_label: string
  max_clients: number | null; max_loans: number | null; max_collaborators: number | null
  one_loan_per_client: boolean
}
const countOrUnlimited = (n: number | null) => n === null ? 'Ilimitados' : `Hasta ${n}`

// Un ejemplo concreto de qué significa cada función en la práctica — no solo el nombre. El orden es
// el mismo en que aparecen en el panel de administración, para que ambos se lean igual.
const FEATURE_INFO: Record<string, { label: string; example: string }> = {
  cobranza: { label: 'Cobranza', example: 'Ej.: lista diaria de quién está atrasado o por cobrar hoy, lista para que tu cobrador la trabaje.' },
  rutas: { label: 'Rutas', example: 'Ej.: organiza a tus cobradores por zona, con mapa y la lista de clientes de cada uno.' },
  calendario: { label: 'Calendario de cobros', example: 'Ej.: ve en un calendario todas las cuotas que vencen esta semana.' },
  colaboradores: { label: 'Colaboradores', example: 'Ej.: dale acceso a un cobrador con su propio usuario, sin compartir el tuyo.' },
  gastos: { label: 'Gastos', example: 'Ej.: registra la gasolina o la papelería del mes junto a tus ingresos.' },
  renovaciones: { label: 'Renovaciones', example: 'Ej.: un cliente que ya pagó pide un préstamo nuevo — lo renuevas sin crear todo de cero.' },
  comisiones: { label: 'Comisiones', example: 'Ej.: calcula cuánto le toca a cada cobrador según lo que cobró en el mes.' },
  solicitudes: { label: 'Solicitudes', example: 'Ej.: un cliente nuevo pasa por revisión y aprobación antes de desembolsarle.' },
  garantias: { label: 'Garantías', example: 'Ej.: guarda la foto y los datos de la garantía de un préstamo (un celular, una moto).' },
  inteligencia: { label: 'Inteligencia (IA)', example: 'Ej.: un resumen automático de cómo va tu cartera y qué clientes están en riesgo.' },
  actividad: { label: 'Registro de actividad', example: 'Ej.: ver quién anuló un pago o cambió una tasa, y cuándo.' },
  reportes_completos: { label: 'Reportes completos', example: 'Ej.: todas las pestañas de Reportes y exportar a PDF (Básico solo ve el financiero).' },
  dashboard_personalizado: { label: 'Personalizar el Dashboard', example: 'Ej.: reordena u oculta las tarjetas del inicio a tu gusto.' },
  sucursales: { label: 'Sucursales', example: 'Ej.: compara el desempeño de dos o más sucursales por separado.' },
  api_publica: { label: 'API pública', example: 'Ej.: conecta NEXCREDIT con otra herramienta tuya usando una llave de acceso.' }
}
const FEATURE_ORDER = Object.keys(FEATURE_INFO)

export function PlanComparisonModal({ onClose }: { onClose: () => void }) {
  const { business, session } = useAuth()
  const { data, isLoading } = useQuery({
    queryKey: ['plan_features_public'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plan_features').select('plan, feature_key, enabled')
      if (error) throw error
      return data as { plan: Plan; feature_key: string; enabled: boolean }[]
    }
  })
  const { data: limits, isLoading: limitsLoading } = useQuery({
    queryKey: ['plan_limits_public'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plan_limits').select('*')
      if (error) throw error
      return data as PlanLimitRow[]
    }
  })
  const has = (plan: Plan, key: string) => data?.find((r) => r.plan === plan && r.feature_key === key)?.enabled ?? false
  const limitOf = (plan: Plan) => limits?.find((l) => l.plan === plan)
  const LIMITS = [
    { label: 'Clientes', get: (p: Plan) => countOrUnlimited(limitOf(p)?.max_clients ?? null) },
    { label: 'Préstamos', get: (p: Plan) => countOrUnlimited(limitOf(p)?.max_loans ?? null) },
    { label: 'Préstamos activos por cliente', get: (p: Plan) => limitOf(p)?.one_loan_per_client ? '1 a la vez' : 'Varios' },
    { label: 'Colaboradores', get: (p: Plan) => countOrUnlimited(limitOf(p)?.max_collaborators ?? null) }
  ]

  return (
    <Modal title="Compara los planes de NEXCREDIT" subtitle="Lo que incluye cada uno, con ejemplos reales." onClose={onClose} size="xl">
      {isLoading || limitsLoading ? (
        <p className="py-8 text-center text-sm text-content-muted">Cargando…</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {PLANS.map((p) => (
              <div key={p} className="rounded-xl border border-line p-3 text-center">
                <p className="text-sm font-semibold text-content">{PLAN_LABEL[p]}</p>
                <p className="money text-lg font-bold text-primary-dark">{limitOf(p)?.price_label ?? '—'}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[46%]" />
                <col className="w-[18%]" /><col className="w-[18%]" /><col className="w-[18%]" />
              </colgroup>
              <tbody>
                {LIMITS.map((l) => (
                  <tr key={l.label} className="border-b border-line/60">
                    <td className="py-2.5 pr-4">
                      <p className="font-medium text-content">{l.label}</p>
                    </td>
                    {PLANS.map((p) => (
                      <td key={p} className="px-2 py-2.5 text-center text-content-muted">{l.get(p)}</td>
                    ))}
                  </tr>
                ))}
                {FEATURE_ORDER.map((key) => (
                  <tr key={key} className="border-b border-line/60 last:border-0">
                    <td className="py-2.5 pr-4">
                      <p className="font-medium text-content">{FEATURE_INFO[key].label}</p>
                      <p className="text-xs text-content-muted">{FEATURE_INFO[key].example}</p>
                    </td>
                    {PLANS.map((p) => (
                      <td key={p} className="px-2 py-2.5 text-center">
                        {has(p, key)
                          ? <Check size={16} className="mx-auto text-success-text" aria-label="Incluido" />
                          : <XIcon size={14} className="mx-auto text-content-muted/50" aria-label="No incluido" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <a href={upgradeWhatsappLink('Pro', business?.name, business?.owner_name, business ? PLAN_NAME_ES[business.subscription_plan] : null, session?.user.email)} target="_blank" rel="noopener noreferrer" className="btn-solid flex flex-1 items-center justify-center">
              <MessageCircle size={16} className="mr-1.5" /> Pasar a Pro
            </a>
            <a href={upgradeWhatsappLink('Business', business?.name, business?.owner_name, business ? PLAN_NAME_ES[business.subscription_plan] : null, session?.user.email)} target="_blank" rel="noopener noreferrer" className="btn-secondary flex flex-1 items-center justify-center">
              <MessageCircle size={16} className="mr-1.5" /> Pasar a Business
            </a>
          </div>
        </div>
      )}
    </Modal>
  )
}
