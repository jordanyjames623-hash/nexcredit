import type { CapacitorConfig } from '@capacitor/cli'

// Configuración base para empacar NEXCREDIT como app nativa (iOS y Android)
// con Capacitor, manteniendo el mismo código de la PWA sin reescribir nada.
//
// appId: cámbialo por tu propio identificador antes de subir a las tiendas
// (formato inverso de dominio, ej. com.tunegocio.nexcredit). Una vez publicado
// con un appId, NO se puede cambiar sin crear la app de nuevo en la tienda.
const config: CapacitorConfig = {
  appId: 'com.nexcredit.app',
  appName: 'NEXCREDIT',
  webDir: 'dist',
  server: {
    // Mientras desarrollas localmente, esto permite ver cambios sin recompilar
    // la app nativa cada vez. Coméntalo o quítalo antes de compilar la versión
    // final para las tiendas, para que la app cargue los archivos empacados.
    // url: 'http://localhost:5173',
    // cleartext: true
  }
}

export default config
