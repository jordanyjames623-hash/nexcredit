import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { setPaymentQueueUser } from '@/lib/paymentQueue'

type Membership = {
  business_id: string
  role: 'owner' | 'collaborator'
  is_active: boolean
  permissions: Record<string, boolean>
}

export type Business = {
  id: string; name: string; owner_name: string | null; logo_url: string | null
  phone: string | null; whatsapp: string | null; address: string | null; email: string | null
  rnc: string | null; currency: string; receipt_footer: string | null
  subscription_plan: 'basic' | 'pro' | 'business'
  collection_goal: number | null
  nextex_id: string | null; nextex_key: string | null
}

export type DashboardWidgets = { order?: string[]; hidden?: string[] }
export type Profile = { id: string; full_name: string; phone: string | null; theme: 'light' | 'dark' | 'system'; is_platform_admin?: boolean; dashboard_widgets?: DashboardWidgets | null }

type AuthState = {
  session: Session | null
  membership: Membership | null
  business: Business | null
  profile: Profile | null
  loading: boolean
  isOwner: boolean
  hasPermission: (key: string) => boolean
  /** Función disponible para este negocio: valor por su plan, salvo que el administrador de la
   * plataforma le haya puesto una anulación puntual. Ver tabla plan_features / business_feature_overrides. */
  hasFeature: (key: string) => boolean
  signOut: () => Promise<void>
  refreshMembership: () => Promise<void>
  refreshBusiness: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

// NOTA (2026-10-25): el tema YA NO se aplica desde aquí. El único dueño del tema es
// nc_theme (src/nuevo/theme.ts), que maneja el botón sol/luna junto a la campana. Antes,
// este archivo pisaba ese botón en cada inicio de sesión y en cada renovación del token
// (loadProfile aplicaba profiles.theme) y además seguía al sistema en vivo: por eso el
// tema "se cambiaba solo". profiles.theme queda en la base sin usarse para pintar.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [membership, setMembership] = useState<Membership | null>(null)
  const [business, setBusiness] = useState<Business | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [features, setFeatures] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  async function loadMembership(userId: string) {
    // IMPORTANTE: filtrar por user_id explícitamente. Un negocio con colaboradores tiene
    // varias filas con el mismo business_id; sin este filtro, .maybeSingle() podía devolver
    // la fila de OTRO miembro (ej. el propietario viendo su cuenta como si fuera colaborador).
    const { data, error } = await supabase
      .from('business_members')
      .select('business_id, role, is_active, permissions')
      .eq('user_id', userId)
      .maybeSingle()
    if (!error) setMembership((data as Membership) ?? null)
  }

  // SEC-002: la llave nextex NO viaja en el contexto (la pide aparte solo el panel del
  // dueno). El resto de campos se piden explicitos para no traer columnas nuevas por accidente.
  async function loadBusiness() {
    const { data, error } = await supabase.from('businesses').select('id, name, owner_name, logo_url, phone, whatsapp, address, email, rnc, currency, receipt_footer, subscription_plan, collection_goal').maybeSingle()
    if (!error) setBusiness(data ? ({ ...data, nextex_id: null, nextex_key: null } as Business) : null)
  }

  async function loadProfile(userId: string) {
    const { data, error } = await supabase.from('profiles').select('id, full_name, phone, theme, is_platform_admin, dashboard_widgets').eq('id', userId).maybeSingle()
    if (!error) setProfile((data as Profile) ?? null)
  }

  async function loadFeatures() {
    const { data, error } = await supabase.rpc('get_my_business_features')
    if (!error) setFeatures((data as Record<string, boolean>) ?? {})
  }

  async function loadAll(userId: string) {
    await Promise.all([loadMembership(userId), loadBusiness(), loadProfile(userId), loadFeatures()])
  }

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setPaymentQueueUser(data.session?.user.id ?? null)
      if (data.session) {
        await loadAll(data.session.user.id)
      } else {
        void clearLocalSessionData()
      }
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next)
      setPaymentQueueUser(next?.user.id ?? null)
      if (next) {
        await loadAll(next.user.id)
      } else {
        setMembership(null); setBusiness(null); setProfile(null)
        void clearLocalSessionData()
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isOwner = membership?.role === 'owner'

  function hasPermission(key: string) {
    if (!membership) return false
    if (isOwner) return true
    return membership.permissions?.[key] === true
  }

  // SEC-003 (parcial): al cerrar sesión se borra la caché del service worker y las
  // métricas del día guardadas, para que el siguiente usuario no vea datos del anterior.
  // NO se borra capitalia_payment_queue: son pagos pendientes (decisión JC, Tanda 2).
  async function clearLocalSessionData() {
    try {
      if (typeof caches !== 'undefined') {
        const names = await caches.keys()
        await Promise.all(names.filter((n) => n === 'capitalia-reads').map((n) => caches.delete(n)))
      }
    } catch { /* sin caché disponible: se ignora */ }
    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith('nc_metrics_day:')) keys.push(k)
      }
      keys.forEach((k) => localStorage.removeItem(k))
    } catch { /* sin almacenamiento: se ignora */ }
  }

  async function signOut() {
    await clearLocalSessionData()
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        session, membership, business, profile, loading, isOwner, hasPermission,
        hasFeature: (key: string) => features[key] === true, signOut,
        refreshMembership: () => loadMembership(session!.user.id),
        refreshBusiness: async () => { await loadBusiness(); await loadFeatures() },
        refreshProfile: () => loadProfile(session!.user.id)
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
