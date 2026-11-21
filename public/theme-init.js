// Tema antes de pintar: oscuro por defecto; claro solo si quedó guardado.
try {
  if (localStorage.getItem('nc_theme') !== 'light') document.documentElement.classList.add('dark')
} catch (_e) {
  document.documentElement.classList.add('dark')
}
