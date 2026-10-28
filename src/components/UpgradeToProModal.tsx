import { useQuery } from '@tanstack/react-query'
import { X, Sparkles, MessageCircle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// TODO: reemplaza este número por el WhatsApp Business real de Jordany antes de publicar.
export const WHATSAPP_NUMBER = '18092498196'

export function upgradeWhatsappLink(
  plan: 'Pro' | 'Business', businessName?: string | null, ownerName?: string | null,
  currentPlan?: string | null, email?: string | null
) {
  const who = businessName
    ? `Soy ${ownerName ? ownerName + ', de ' : 'el propietario de '}${businessName}${currentPlan ? ` (plan actual: ${currentPlan})` : ''}${email ? `, correo: ${email}` : ''}. `
    : ''
  const message = encodeURIComponent(`Hola, ${who}Quiero pasar mi cuenta de NEXCREDIT al plan ${plan}.`)
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`
}

type PlanLimit = {
  plan: 'basic' | 'pro' | 'business'; price_label: string
  max_clients: number | null; max_loans: number | null; max_collaborators: number | null
  one_loan_per_client: boolean
}

// Precio y límites reales — los mismos que edita el administrador de la plataforma en "Precios y
// límites por plan". Un solo lugar de verdad: cambiarlos ahí cambia lo que se muestra aquí también.
export function usePlanLimits() {
  return useQuery({
    queryKey: ['plan_limits_public'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plan_limits').select('*')
      if (error) throw error
      return data as PlanLimit[]
    }
  })
}

function reasonText(reason: string, limits?: PlanLimit[]): string {
  const basic = limits?.find((l) => l.plan === 'basic')
  switch (reason) {
    case 'clients': return `Llegaste al límite de ${basic?.max_clients ?? 10} clientes del plan Básico.`
    case 'loans': return `Llegaste al límite de ${basic?.max_loans ?? 10} préstamos del plan Básico.`
    case 'one_loan_per_client': return 'Llegaste al límite de préstamos por cliente de tu plan.' // Genérico: el tope ya es un número por plan, no solo 1.
    case 'collaborators': return 'El plan Básico no incluye colaboradores — esa función es parte de Pro.'
    case 'pro_feature': return 'Esta función es parte del plan Pro.'
    case 'business_feature': return 'Esta función es parte del plan Business.'
    default: return ''
  }
}

// Mensaje entendible cuando la base de datos rechaza algo por el plan (o null si el error es otro).
export function planErrorMessage(message: string | undefined | null): string | null {
  if (!message) return null
  if (message.includes('PLAN_REQUIRED_BUSINESS')) return 'Esta función es del plan Business.'
  if (message.includes('PLAN_REQUIRED_PRO')) return 'Esta función es del plan Pro.'
  return null
}

const REASON_KEYS = ['clients', 'loans', 'one_loan_per_client', 'collaborators', 'pro_feature', 'business_feature'] as const

export function parsePlanLimitError(message: string | undefined | null): (typeof REASON_KEYS)[number] | null {
  if (!message) return null
  if (message.includes('PLAN_LIMIT_CLIENTS')) return 'clients'
  if (message.includes('PLAN_LIMIT_ONE_LOAN_PER_CLIENT')) return 'one_loan_per_client'
  if (message.includes('PLAN_LIMIT_LOANS')) return 'loans'
  if (message.includes('PLAN_LIMIT_COLLABORATORS')) return 'collaborators'
  if (message.includes('PLAN_REQUIRED_BUSINESS')) return 'business_feature'
  if (message.includes('PLAN_REQUIRED_PRO')) return 'pro_feature'
  return null
}

function countLabel(max: number | null, noun: string) {
  return max === null ? `${noun} ilimitados` : `Hasta ${max} ${noun}`
}

// Contenido reutilizable de la oferta Pro — lo usan el modal (al chocar con un límite),
// el banner del Dashboard, y la sección "Suscripción" de Configuración.
export const PLAN_NAME_ES: Record<string, string> = { basic: 'Básico', pro: 'Pro', business: 'Business' }

export function ProPitchContent({ compact }: { compact?: boolean }) {
  const { data: limits } = usePlanLimits()
  const { business, session } = useAuth()
  const pro = limits?.find((l) => l.plan === 'pro')
  return (
    <div>
      <div className={`mb-4 rounded-lg border border-primary/30 bg-primary/5 text-center ${compact ? 'p-3' : 'p-4'}`}>
        <p className={`money font-bold text-primary-dark ${compact ? 'text-2xl' : 'text-3xl'}`}>{pro?.price_label ?? '—'}</p>
        <p className="mt-1 text-xs text-content-muted">Plan Pro</p>
      </div>
      <ul className="mb-5 space-y-1.5 text-sm text-content/80">
        <li>✓ {countLabel(pro?.max_clients ?? null, 'clientes')}</li>
        <li>✓ {countLabel(pro?.max_loans ?? null, 'préstamos')}</li>
        <li>✓ {pro?.max_collaborators ? `Hasta ${pro.max_collaborators} colaboradores con permisos` : 'Colaboradores con permisos'}</li>
        <li>✓ Rutas, cobranza y seguimiento</li>
        <li>✓ Comisiones, riesgo y reportes avanzados</li>
      </ul>
      <a href={upgradeWhatsappLink('Pro', business?.name, business?.owner_name, business ? PLAN_NAME_ES[business.subscription_plan] : null, session?.user.email)} target="_blank" rel="noopener noreferrer" className="btn-solid flex w-full items-center justify-center">
        <MessageCircle size={16} className="mr-1.5" /> Escríbeme por WhatsApp para activarlo
      </a>
      <p className="mt-3 text-center text-xs text-content-muted">Activamos tu cuenta apenas confirmes el pago.</p>
    </div>
  )
}

// Oferta del plan Business — solo promete lo que realmente existe hoy en NEXCREDIT.
export function BusinessPitchContent({ compact }: { compact?: boolean }) {
  const { data: limits } = usePlanLimits()
  const { business: myBusiness, session } = useAuth()
  const business = limits?.find((l) => l.plan === 'business')
  return (
    <div>
      <div className={`mb-4 rounded-lg border border-primary/30 bg-primary/5 text-center ${compact ? 'p-3' : 'p-4'}`}>
        <p className={`money font-bold text-primary-dark ${compact ? 'text-2xl' : 'text-3xl'}`}>{business?.price_label ?? '—'}</p>
        <p className="mt-1 text-xs text-content-muted">Plan Business</p>
      </div>
      <ul className="mb-5 space-y-1.5 text-sm text-content/80">
        <li>✓ Todo lo del plan Pro, {countLabel(business?.max_clients ?? null, 'clientes')}</li>
        <li>✓ Concentración de cartera (Top 5 / 10 / 20 clientes)</li>
        <li>✓ Comparación de períodos (este mes vs. mes anterior)</li>
        <li>✓ Panel ejecutivo completo</li>
      </ul>
      <a href={upgradeWhatsappLink('Business', myBusiness?.name, myBusiness?.owner_name, myBusiness ? PLAN_NAME_ES[myBusiness.subscription_plan] : null, session?.user.email)} target="_blank" rel="noopener noreferrer" className="btn-solid flex w-full items-center justify-center">
        <MessageCircle size={16} className="mr-1.5" /> Escríbeme por WhatsApp para activarlo
      </a>
      <p className="mt-3 text-center text-xs text-content-muted">Activamos tu cuenta apenas confirmes el pago.</p>
    </div>
  )
}

export function UpgradeToProModal({ reason, onClose }: { reason: (typeof REASON_KEYS)[number]; onClose: () => void }) {
  const { data: limits } = usePlanLimits()
  const business = reason === 'business_feature'
  return (
    <Modal title={`Pasa a NEXCREDIT ${business ? 'Business' : 'Pro'}`} onClose={onClose} size="sm" flush>
      <button onClick={onClose} className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-on-navy/70 transition-colors hover:bg-white/10 hover:text-on-navy" aria-label="Cerrar">
        <X size={18} />
      </button>

      <div className="bg-gradient-to-b from-navy to-navy-light px-6 pb-5 pt-7 text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary-fill to-primary-dark">
          <Sparkles size={22} className="text-white" />
        </div>
        <p className="text-lg font-semibold text-on-navy">Pasa a NEXCREDIT {business ? 'Business' : 'Pro'}</p>
      </div>

      <div className="p-6">
        <p className="mb-4 text-sm text-content/80">{reasonText(reason, limits)}</p>
        {business ? <BusinessPitchContent /> : <ProPitchContent />}
      </div>
    </Modal>
  )
}
