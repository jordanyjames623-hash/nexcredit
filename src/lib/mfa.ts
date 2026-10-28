import { supabase } from '@/lib/supabase'

// SEC-007: segundo factor TOTP obligatorio para el propietario, con Supabase Auth MFA nativo.
// Los colaboradores no usan MFA (decisión JC 2026-10-27). Si el propietario pierde el teléfono,
// el factor se elimina desde el panel de Supabase (no hay baja desde la app, a propósito).

/** Factor TOTP verificado de la sesión actual, si existe. */
export async function getVerifiedTotpFactorId(): Promise<string | null> {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error || !data) return null
  return data.totp.find((f) => f.status === 'verified')?.id ?? null
}

export type TotpEnrollment = { factorId: string; qrCode: string; secret: string; uri: string }

/** Crea un factor TOTP nuevo y devuelve QR + secreto para mostrarlos. */
export async function startTotpEnroll(): Promise<TotpEnrollment> {
  // Cada intento usa un nombre distinto: GoTrue rechaza inscribir otro factor con el mismo
  // friendly_name, y el intento anterior queda sin verificar con el nombre vacio, lo que
  // bloqueaba todos los reintentos con 422. Con nombre unico el reintento siempre funciona.
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Capitalia-' + Date.now() })
  if (error || !data?.totp) throw new Error('No se pudo generar el código. ' + (error?.message ?? 'Intenta de nuevo.'))
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri }
}

/** Verifica un código TOTP contra un factor (sirve para inscribir y para entrar). */
export async function verifyTotpCode(factorId: string, code: string): Promise<void> {
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
  if (challengeError || !challenge) throw new Error('No se pudo iniciar la verificación. Intenta de nuevo.')
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: code.trim() })
  if (error) throw new Error('Código incorrecto o vencido.')
}
