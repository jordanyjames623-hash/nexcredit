// Tema claro/oscuro de la app nueva. El mecanismo es la clase `dark` en <html>: los
// tokens viejos (src/styles/tokens.css, :root.dark) ya la entienden, asi que las pantallas
// viejas que se abren desde Mas cambian solas; las pantallas nuevas usan var(--nc-*),
// que tambien cambia con esa clase. Por defecto oscuro (el aspecto actual).
export type NcTheme = 'dark' | 'light'

const KEY = 'nc_theme'

export function getTheme(): NcTheme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyTheme(t: NcTheme) {
  document.documentElement.classList.toggle('dark', t === 'dark')
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* sin almacenamiento: el tema queda solo en esta sesion */
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', t === 'dark' ? '#0B1120' : '#F3F7FC')
}
