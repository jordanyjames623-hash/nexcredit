// Sesión del portal del cliente: vive en sessionStorage (se borra al cerrar la pestaña), separada por
// completo de la sesión de staff (AuthContext/Supabase Auth). El cliente nunca tiene una cuenta de staff.
const TOKEN_KEY = 'capitalia_portal_token'
const NAME_KEY = 'capitalia_portal_name'

export function getPortalToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}
export function setPortalSession(token: string, clientName: string) {
  sessionStorage.setItem(TOKEN_KEY, token)
  sessionStorage.setItem(NAME_KEY, clientName)
}
export function getPortalClientName(): string | null {
  return sessionStorage.getItem(NAME_KEY)
}
export function clearPortalSession() {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(NAME_KEY)
}
