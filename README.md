# NEXCREDIT

App de cobranza y gestión de préstamos. React + Vite + TypeScript + Tailwind + TanStack Query + Supabase, PWA instalable.

## Empezar

```bash
npm install
cp .env.example .env   # ya viene con las credenciales del proyecto "capitalia"
npm run dev
```

## Estado del proyecto

**Backend (Supabase, proyecto `capitalia`) — Fases 1 a 7 completas y auditadas:**
- Esquema con RLS, multi-tenant por `business_id`, sin DELETE físico en datos financieros.
- Cálculo de préstamos (fijo, saldo decreciente, francés, solo interés), mora, calendario semanal/quincenal/mensual.
- `register_payment` / `void_payment`: transaccionales, idempotentes, con auditoría append-only.
- Dashboard, reportes, calendario de cobros.
- Gestión de colaboradores y permisos, vía Edge Function con reautenticación por contraseña.
- Rutas de cobro.
- Backup y borrado total (`critical-actions`, exige contraseña + escribir "ELIMINAR").

**Frontend — completo:**
- Autenticación: entrar, crear cuenta, recuperar contraseña (correo) y cambiar contraseña propia (sin correo, con reautenticación).
- Dashboard con filtros de período (hoy/semana/quincena/mes/mes anterior/año).
- Clientes, Préstamos (alta con calculadora en vivo, detalle con cuotas), registrar/anular pago con **comprobante** (imprimir/PDF/compartir).
- Rutas, Gastos, Calendario de cobros.
- Reportes (con exportar a CSV) y Historial de actividad con filtros (usuario, acción, fecha, solo eliminaciones).
- Colaboradores: crear con contraseña asignada, permisos, activar/desactivar, cambiar contraseña — todo vía `collaborators-admin` con reautenticación del propietario.
- Configuración: datos del negocio, apariencia (claro/oscuro/automático), exportar copia de seguridad, eliminar todos los datos (contraseña + escribir "ELIMINAR").
- Layout con navegación de escritorio y barra inferior en móvil (con menú "Más"), aviso de sin conexión, service worker que cachea solo lecturas.

## Nota sobre el origen de este código

Este proyecto se construyó y auditó a través de varias conversaciones. En la más reciente se verificó directamente contra el proyecto de Supabase (no solo por lo que decía el historial pegado) que:
- El backend (Fases 1–7) está intacto y sin cambios no documentados.
- `collaborators-admin` está en su versión 3 (exige la contraseña del propietario para crear o resetear la contraseña de un colaborador, con `new_password` como campo separado).
- Se corrigió un bug real en `LoanDetail.tsx`: exigía un permiso `payments.create` que no existe en ningún lado (ni en la base de datos ni en la pantalla de Colaboradores), lo que habría bloqueado a todos los colaboradores de registrar pagos.
- Se completaron los módulos que faltaban: Configuración, Reportes, Calendario, Historial de actividad, Comprobante de pago, recuperar/cambiar contraseña, y los filtros de período del Dashboard.
- Se agregó modo oscuro real (antes no existía ninguna variante oscura en el sistema de diseño).

## Offline

El service worker (`vite-plugin-pwa`) cachea la app y las lecturas GET a Supabase con estrategia `NetworkFirst`, para consulta sin conexión. Las escrituras financieras (`register_payment`, `create_loan`, etc.) nunca se cachean ni se reintentan solas — `useOnlineStatus` bloquea esas acciones en la interfaz cuando no hay señal real, y `OfflineBanner` lo avisa.

## Desplegar

Cualquier host estático con soporte SPA sirve: Vercel, Netlify o Cloudflare Pages. Configura las mismas variables de `.env` en el panel del host. `npm run build` genera `dist/`.

## Verificar la instalación como app (iOS / Android)

1. Sirve la build de producción sobre HTTPS (Vercel/Netlify la dan por defecto).
2. **Android (Chrome):** abre el sitio → menú ⋮ → "Instalar app". Confirma que abre en modo standalone (sin barra del navegador).
3. **iPhone (Safari):** abre el sitio → compartir → "Añadir a pantalla de inicio". Confirma ícono y que abre en modo standalone.
4. En ambos, apaga el wifi/datos y confirma que la app abre y muestra el último dashboard cargado, con el aviso de "sin conexión" visible.
