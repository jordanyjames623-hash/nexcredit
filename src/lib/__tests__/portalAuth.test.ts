import { describe, it, expect, beforeEach } from 'vitest'
import { getPortalToken, setPortalSession, getPortalClientName, clearPortalSession } from '../portalAuth'

// Pruebas de la sesión del portal en el navegador. No cubren el servidor (eso está en
// supabase/tests/portal_security.test.sql) — esto solo verifica que el lado del cliente
// guarda y, sobre todo, BORRA correctamente lo que debe.
describe('portalAuth', () => {
  beforeEach(() => sessionStorage.clear())

  it('no hay sesión antes de entrar', () => {
    expect(getPortalToken()).toBeNull()
    expect(getPortalClientName()).toBeNull()
  })

  it('guarda el token y el nombre al entrar', () => {
    setPortalSession('token-de-prueba', 'Cliente de prueba')
    expect(getPortalToken()).toBe('token-de-prueba')
    expect(getPortalClientName()).toBe('Cliente de prueba')
  })

  it('borra todo al salir — nada queda residual en el navegador', () => {
    setPortalSession('token-de-prueba', 'Cliente de prueba')
    clearPortalSession()
    expect(getPortalToken()).toBeNull()
    expect(getPortalClientName()).toBeNull()
    expect(sessionStorage.length).toBe(0)
  })

  it('el token no sobrevive si nunca se guardó (caso de doble logout)', () => {
    clearPortalSession()
    clearPortalSession()
    expect(getPortalToken()).toBeNull()
  })
})
