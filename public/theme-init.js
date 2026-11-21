// Tema antes de pintar: oscuro por defecto (el aspecto actual); claro solo si quedo guardado.
try { if (localStorage.getItem('nc_theme') !== 'light') document.documentElement.classList.add('dark') }
catch (e) { document.documentElement.classList.add('dark') }
