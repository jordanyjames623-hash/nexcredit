import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  // Falla ruidosamente en desarrollo si falta configurar el .env — mejor que un error críptico después.
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Copia .env.example a .env y complétalo.')
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'capitalia-auth'
  }
})

/**
 * Llama a las Edge Functions críticas (collaborators-admin, critical-actions).
 * Estas exigen reautenticación con contraseña; nunca se llaman sin conexión.
 */
export async function callEdgeFunction<T = unknown>(
  fn: 'collaborators-admin' | 'critical-actions' | 'backup-manager' | 'platform-admin',
  body: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(fn, { body })
  if (error) throw error
  if (data && typeof data === 'object' && 'error' in (data as any) && (data as any).error) {
    throw new Error((data as any).error as string)
  }
  return data as T
}
