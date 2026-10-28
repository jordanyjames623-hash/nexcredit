# NEXCREDIT — Sistema de diseño

Toda la identidad visual sale de **`src/styles/tokens.css`**. Para cambiar la marca se editan esas variables; el resto de la app no necesita tocarse.

## Archivos
| Archivo | Contenido |
|---|---|
| `src/styles/tokens.css` | Colores (claro/oscuro), radios, sombras, vidrio, movimiento, medidas del layout |
| `src/styles/motion.css` | Animaciones (`page-enter`, `popover-enter`, `modal-enter`, `drawer-enter`, `sheet-enter`, `collapse-grid`) y `prefers-reduced-motion` |
| `src/index.css` | Clases del sistema: tipografía, botones, formularios, superficies, insignias, tablas, navegación |
| `tailwind.config.js` | Enlaza los colores de Tailwind con los tokens (no contiene colores propios) |

## Colores
Usar los nombres **semánticos** en código nuevo: `primary` (+ `-dark`, `-light`), `navy`, `on-navy`, `background`, `surface`, `content` (+ `-muted`), `success`, `warning`, `danger`, `info`.
Los nombres anteriores (`ink`, `paper`, `cream`, `gold`, `due`, `paid`, `line`) siguen funcionando como alias y ya apuntan a la nueva identidad; se reemplazan por los semánticos pantalla por pantalla.

Reglas: azul = acción e interacción · verde = positivo · ámbar = advertencia · rojo = error/crítico. Nada más.

## Tipografía
Inter. Números financieros: clase `money` (cifras tabulares). Jerarquía: `t-h1`, `t-h2`, `t-h3`, `t-label`, `t-kpi`.
Texto secundario: `text-content-muted` (contraste ≥ 5:1). No usar `text-ink-dark/40` ni `/50` (no cumplen AA).

## Superficies
- **`glass-card`**: tarjeta normal, sólida, sin blur.
- **`glass-panel`** + `glass-subtle | glass-medium | glass-strong`: Liquid Glass, **solo para elementos flotantes** (header, desplegables, modales, tooltips, barra inferior móvil).

## Botones
`btn-solid` (acción principal; `btn-gold` es el nombre anterior) · `btn-secondary` (`btn-primary` anterior) · `btn-ghost` · `btn-danger`. Estado cargando: `data-loading="true"`.

## Radios
Controles 10px · tarjetas 16px · paneles 22px · modales 24px (`--radius-*`).

## Movimiento
150–300 ms, solo `transform` y `opacity`. Desplegables: entran con `translateY(-4px) scale(.98)` → normal. Con `prefers-reduced-motion` todo se reduce.

## Layout
`components/layout/`: `Sidebar` (colapsable, recuerda su estado), `NavList` (grupos con animación), `AppHeader` (buscador global, campana, usuario), `MobileDrawer`, `PageTransition`, `navConfig.ts` (única fuente de la navegación).
`components/ui/Dropdown.tsx`: desplegable de vidrio reutilizable.

## Dashboard y gráficas (Etapa 2)
- **Colores de gráficas**: `useChartColors()` (`src/hooks/useChartColors.ts`) lee los tokens (`--c-*`, `--chart-1..5`) y se actualiza al cambiar claro/oscuro. Recharts no acepta variables CSS, por eso existe este hook. No escribir colores hex en las gráficas.
- **Tooltip de vidrio**: `components/ui/ChartTooltip.tsx` → `<Tooltip content={<ChartTooltip format={...} />} />`.
- **Animaciones de gráficas**: se apagan con `useReducedMotion()`.
- **Tarjeta KPI** (`KpiTile`): icono, título, cifra dominante (`RD$` en pequeño), variación y mini gráfico (`Sparkline`) solo si hay serie real.
- **`Panel`**: contenedor estándar de paneles (título con icono + enlace de acción).
- **Registro de widgets** (`pages/Dashboard.tsx`): cada panel declara su ancho (`span`) en una cuadrícula de 6 columnas.
- **Tablas**: clase `table-modern`. **Cargando**: `Skeleton`. **Etiquetas del historial**: `lib/activityLabels.ts`.

## Formularios, modales y pantallas (Etapa 3)
- **`ui/Modal.tsx`**: modal de vidrio (fondo oscurecido + blur, entrada con fade/escala, foco atrapado, Escape, hoja inferior en móvil). Usar siempre este componente; no crear overlays a mano. `flush` para contenido con diseño propio.
- **`ui/Stepper.tsx`** + **`ui/FormSection.tsx`** + **`ui/PageHeader.tsx`**: estructura de procesos por pasos (ver `pages/NewLoan.tsx`: 4 pasos con panel lateral de resumen).
- **`AccordionSection`**: apertura suave con `collapse-grid`; el contenido se monta solo al abrir.
- **Pantallas de acceso**: fondo `auth-bg`, `BrandMark` y tarjeta `glass-panel glass-strong`.
- **Nombres de color**: ya no quedan `gold/ink/paper/cream/paid/due` en el código (siguen como alias en `tailwind.config.js` solo por compatibilidad). Colores fijos permitidos: únicamente el degradado de marca (`#2C6CEE`, `#3B7BF0`, `#2563EB`).
- **Comprobantes** (`Receipt`, `QuoteReceipt`): conservan su estructura y sus ids porque la impresión depende de ellos.

## Movimiento, accesibilidad y rendimiento (Etapa 4)
**Estados de interacción** (todos los elementos interactivos): default · hover (elevación de 1–2 px) · active (`scale(.98)`) · focus-visible (anillo azul) · disabled (50 %) · loading (`data-loading="true"`, con spinner) · success (`data-state="success"`, y aviso con `useToast().success(...)`) · error (`role="alert"`: se sacude una vez).
**Tiempos**: 150–220 ms microinteracciones · 260–400 ms transiciones grandes · solo `transform` y `opacity`.

**Luz del cursor** (`hooks/usePointerLight.ts`): un único listener de `pointermove` para toda la app, como mucho un cálculo por cuadro (`requestAnimationFrame`), que solo escribe variables CSS (`--mx --my --px --py`) en la tarjeta bajo el cursor. El dibujo lo hace el navegador (pseudo-elemento con `opacity`). Se desactiva en pantallas táctiles y con "reducir movimiento". Micro-parallax: `data-parallax` en cualquier hijo de una tarjeta.

**Avisos** (`ui/Toast.tsx`): `const toast = useToast(); toast.success('Guardado')`. Máximo 3 visibles; se anuncian a lectores de pantalla.

**Accesibilidad**: enlace "Saltar al contenido"; título de pestaña y anuncio al cambiar de página; todos los campos tienen nombre accesible (`label`/`id` o `aria-label`); todos los botones solo-icono tienen `aria-label`; desplegables y modales con `aria-expanded`/`aria-modal`, foco atrapado y Escape; contraste ≥ 4.5:1 verificado; `prefers-reduced-motion` respetado (CSS, luz del cursor y animaciones de gráficas).

**Rendimiento**: las 24 pantallas se descargan bajo demanda (`React.lazy`), las librerías grandes (`react`, `recharts`, `supabase`, `react-query`) van en paquetes propios, las tarjetas no usan `backdrop-filter` (solo header, desplegables, modales y barra inferior), y el fondo ambiental es una capa fija propia.

## Regla para superposiciones (modales, comprobantes, menús a pantalla completa)
Todo elemento `position: fixed` que deba cubrir la pantalla se dibuja con `ui/Portal` (o con `ui/Modal`, que ya lo usa): así queda directamente en `<body>`. Las animaciones de entrada usan `animation-fill-mode: backwards` (nunca `both`/`forwards`): en Safari, dejar `transform`/`opacity` aplicados al terminar convierte al elemento en contenedor de sus hijos fijos y los modales quedan atrapados dentro de la página.

## Despliegue (importante)
`vercel.json` contiene la regla que sirve `index.html` para cualquier ruta interna. **No borrarlo**: sin él, abrir directamente `/clientes`, `/entrar`, etc. (o el enlace de un correo) da un 404 de Vercel en cualquier dispositivo que aún no tenga instalada la PWA. `lib/lazyPage.ts` recarga una vez si una pantalla no se puede descargar tras publicar una versión nueva.
Cuadrículas con fichas de igual altura: contenedor `flex flex-col` + `[&>section]:flex-1` (no `h-full`, que Safari no resuelve dentro de una cuadrícula).

## Impresión
**Comprobantes**: `lib/printElement.ts` copia el comprobante a un `<iframe>` aislado (mismas hojas de estilo, sin la clase `dark`) y imprime ese documento; así la vista previa solo contiene el comprobante y siempre usa el tema claro, sin depender del layout de la app ni del navegador. Si el iframe fallara, se imprime la página con las reglas de abajo como respaldo. El iframe **no** se quita al terminar la impresión (Safari avisa `afterprint` antes de cerrar el cuadro y el PDF saldría en blanco): se descarta al cerrar el comprobante, al imprimir otra pantalla (`beforeprint`) o a los 10 minutos. Un iframe olvidado puede añadir una página en blanco al imprimir otra pantalla.

El tema oscuro **no se aplica al imprimir** (`@media not print` en `tokens.css`): el papel es blanco y el texto claro saldría invisible. Con un comprobante abierto, `#root` se oculta al imprimir y solo sale el comprobante, que vive en un portal fuera de `#root`. Al añadir nuevas superficies imprimibles, usar `print:` para ocultar controles y `.print-hide` para elementos ajenos al documento; no fijar colores.

## Página en blanco al imprimir Reportes (seguimiento)
Si "Exportar PDF" vuelve a salir con una página 2 en blanco: la causa más probable es `min-h-screen` en el contenedor raíz de `AppLayout.tsx`, que fuerza una altura de pantalla completa que Safari puede contar como una página extra al imprimir. La regla `@media print` en `index.css` ya la neutraliza (`#root, #root > *, .min-h-screen { min-height: 0 !important }`), pero no se pudo reproducir el fallo ni confirmar el arreglo con Chromium — solo Safari real lo demuestra. Si persiste, revisar con el inspector de Safari en modo impresión qué elemento mide más que una hoja.

## Caja / cuadre de cobradores (integración, no diseño propio)
La tabla `cash_sessions` y las funciones `open_cash_session`, `close_cash_session`, `cash_session_running_total`
y el campo `payments.payment_method` ya existían en la base de datos (construidos en otra sesión, migraciones
`item10_cash_register` y siguientes, 2026-10-01). Aquí solo se construyó la pantalla `/caja` sobre ese diseño
existente, sin tocar la base de datos:
- `pages/CashRegister.tsx`: "Mi caja" (abrir/cerrar, total esperado en vivo), historial propio, y "Cajas del
  equipo" (solo visible si la consulta RLS devuelve filas — propietario o permiso `cash_sessions.view_all`).
- Cerrar caja pide el motivo de la diferencia *antes* de llamar a la función, no después: `close_cash_session`
  exige el motivo en la misma llamada cuando hay diferencia, no hay un paso de vista previa en el servidor.
- Selector de método de pago (`lib/format.ts`: `PAYMENT_METHODS`, `PAYMENT_METHOD_LABEL`) añadido a "Registrar
  pago" y al comprobante, para que `payment_method` se capture desde la interfaz.
- Permiso `cash_sessions.view_all` añadido al catálogo de `Collaborators.tsx` (ya existía en la base de datos,
  faltaba en la lista que ve el propietario al configurar a un colaborador).

## Portal del cliente (consulta, sin cuenta de staff)
Web aparte en `/portal/entrar` (cédula + PIN) y `/portal`, `/portal/prestamos/:id` — solo lectura: préstamos,
calendario de cuotas, recibos. No usa Supabase Auth ni ProtectedRoute: el cliente nunca es un `business_member`.

**Base de datos** (`client_portal_p1/p2*`): `clients.portal_pin_hash` (bcrypt vía pgcrypto, no sha256 — el PIN
es de baja entropía, a diferencia de las llaves de API) + contador de intentos fallidos y bloqueo de 15 min
tras 5 fallos. Tabla `client_portal_sessions` (token de alta entropía, hash sha256, expira a las 12h), sin
políticas RLS — se accede solo vía funciones `SECURITY DEFINER`, igual que `api_keys`. Funciones: `set_client_portal_pin`/
`clear_client_portal_pin` (propietario), `client_portal_login` (nunca lanza excepción — devuelve
`{ok,message}`: un RAISE deshace cualquier UPDATE previo en la misma función, así que el contador de intentos
fallidos no sobrevivía con el diseño original; se corrigió), `portal_get_summary/loans/loan_detail/payments`
(token-gated, reutilizan las vistas `installment_details`/`payment_details` ya existentes — no se duplicó
ningún cálculo). `anon` y `authenticated` tienen EXECUTE solo sobre estas 5 funciones puntuales, nunca
select/insert/update directo sobre `clients` ni `client_portal_sessions`.

**Frontend**: `src/portal/` (PortalLogin, PortalLayout, PortalSummary, PortalLoanDetail) + `lib/portalAuth.ts`
(sessionStorage, nunca localStorage ni el AuthContext de staff). Panel de activación en `ClientDetail.tsx`
(`PortalAccessPanel`, solo propietario): pide cédula registrada antes de poder activar, nunca vuelve a
mostrar el PIN una vez guardado.

## Mapa de rutas (GPS, sin rastreo)
`clients.latitude/longitude/location_captured_at` (migración `routes_p4_client_geo_columns`) — captura puntual,
opcional, iniciada por quien crea/edita el cliente (`components/LocationCapture.tsx`, botón "usar mi ubicación
actual"; nunca automática ni continua, no se guarda la ubicación del cobrador). `components/RouteMap.tsx`
(react-leaflet + OpenStreetMap, sin llave de API) en `RouteDetail.tsx`: marcadores numerados según el orden de
la ruta, con íconos propios en vez del ícono por defecto de Leaflet (evita el bug conocido de rutas de imagen
rotas con bundlers). Los clientes sin ubicación se listan aparte, no se ocultan.

**Dependencia nueva:** `leaflet`, `react-leaflet`, `@types/leaflet` — agregadas a `package.json`, requieren
`npm install` antes de `npm run build` (no alcanza con reemplazar los archivos). No se pudo verificar este
archivo con `tsc` en este entorno porque la librería no está instalada aquí (igual que cualquier paquete
nuevo); el build real de Jordany es la única prueba de esta parte.

## Pausa: modo offline para cobradores (pendiente decisión)
`hooks/useOnlineStatus.ts` documenta una decisión explícita ya tomada: las operaciones financieras deben
BLOQUEARSE sin conexión, nunca encolarse en silencio ("nada se envía en silencio al volver la señal"). Antes
de construir una cola de sincronización (que sería lo opuesto), hace falta que el dueño confirme si quiere
mantener esa política o revertirla a propósito.

## Modo offline para pagos (decisión revertida a propósito, 2026-10-01)
Ver el comentario completo en `hooks/useOnlineStatus.ts`: SOLO el registro de pagos se sacó del bloqueo
"sin conexión, no se puede" — todo lo demás (clientes, préstamos, anular pago, cobranza, rutas, colaboradores)
sigue bloqueado como antes, a propósito.

`lib/paymentQueue.ts` (localStorage, evento propio para notificar a los componentes): cada pago sin conexión
guarda SU PROPIA `idempotency_key` (generada una sola vez al encolarse) y la reintenta con esa misma llave al
sincronizar — la protección contra duplicados la da el servidor (`register_payment` ya resuelve la llave y
devuelve el pago existente marcado `duplicate: true` en vez de volver a aplicarlo), no el cliente.

**Detección de "sin conexión" al fallar una llamada**: por código de error de Postgres (`error.code`), no por
el texto del mensaje. Un error que SÍ llegó a Postgres siempre trae código, incluso un `raise exception`
simple (código por defecto P0001); uno que nunca llegó a responder, no. Importante porque Safari describe un
fetch fallido como *"Load failed"* — sin las palabras "network" ni "fetch" que sí usan Chrome/Firefox — así
que cualquier detección por texto del mensaje falla específicamente en Safari.

`hooks/usePaymentQueue.ts` + `components/PendingPaymentsIndicator.tsx`: indicador persistente (no un aviso
que desaparece) montado una vez en `AppLayout.tsx`, visible en cualquier pantalla mientras haya pagos
pendientes o con conflicto. Un conflicto real (el préstamo cambió de estado en otro dispositivo mientras
este estaba sin señal) se marca para revisión manual, nunca se descarta en silencio.

**Límite conocido, no resuelto**: `register_payment` calcula la mora con la fecha del momento en que se
sincroniza, no la fecha en que se cobró el dinero en la calle (no existe un parámetro para "aplicar como si
fuera tal fecha" en esa función). Para una sincronización de minutos u horas no debería notarse; para varios
días sin señal, el monto de mora aplicado podría diferir un poco del que se habría calculado el día del
cobro. No se resolvió aquí porque tocaría una función compartida con el resto del sistema de pagos.

## Endurecimiento de seguridad del Portal (2026-10-02, no aplicado todavía)
`supabase/migrations/20261002_portal_security_hardening.sql` — **sin aplicar a ningún entorno**. Agrega
`portal_logout(token)` (revoca la sesión en el servidor), hace que `set_client_portal_pin`/`clear_client_portal_pin`
borren las sesiones activas del cliente, y acorta el bloqueo de PIN de 15 a 5 minutos (ver el comentario en el
propio archivo para el porqué). `supabase/tests/portal_security.test.sql` — suite lista para correr contra una
rama de desarrollo de Supabase (nunca contra producción), aún no ejecutada. `src/portal/PortalLayout.tsx` —
el logout ahora llama a `portal_logout` antes de borrar la sesión local, y recarga la página completa (no solo
navega) para garantizar que no quede ningún dato en memoria del formulario de entrada.

## Bloqueo de PIN escalonado (opción B, aplicado y probado en vivo, 2026-10-02)
`clients.portal_pin_lockout_count` (nuevo). `client_portal_login` ahora bloquea 2 min el primer ciclo
consecutivo de 5 fallos, 5 min el segundo, 15 min el tercero en adelante — en vez del fijo anterior de
5 min. Se reinicia a 0 con un login correcto o al cambiar/quitar el PIN. Mitiga (no elimina del todo) que
un tercero que sepa la cédula de un cliente lo mantenga bloqueado indefinidamente; la solución completa
(canal de desbloqueo alterno por WhatsApp/SMS) sigue pendiente de que se decida un proveedor.
Probado en vivo con datos ficticios (negocio y cliente de prueba, revertidos automáticamente al terminar
con un error controlado — Postgres deshace todo el bloque si cualquier parte falla). Las 4 aserciones
(2 min, 5 min, 15 min, reinicio a cero) pasaron. `supabase/tests/portal_security.test.sql` documenta el
patrón para repetir esta prueba en el futuro.

## Canal de desbloqueo del Portal (opción C) — base de datos lista y probada, Twilio pendiente
Aplicado y probado en producción el 2026-10-02 (6 pruebas con datos ficticios, revertidas automáticamente):
`generate_portal_unlock_code` (nunca anon-callable — solo la función Edge con llave de servicio),
`confirm_portal_unlock` (anon-callable, como `client_portal_login`). Un código de 6 dígitos, bcrypt,
vence en 10 min, máximo 5 intentos, de un solo uso, limita a un pedido por minuto por cliente.

**Falta para activarlo de verdad:** `supabase/functions/portal-unlock/index.ts` está escrita pero
**no desplegada** — envía por Twilio (SMS por defecto; WhatsApp si `TWILIO_FROM` empieza con
`whatsapp:`). Necesita 3 secretos en Supabase (Project Settings → Edge Functions → Secrets):
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` — se obtienen al crear una cuenta en
twilio.com. Con esos tres y el comando de despliegue, queda funcionando sin tocar el resto del código.
Frontend ya integrado en `PortalLogin.tsx` (enlace "¿Olvidaste tu PIN?" cuando se ve el bloqueo).

## Cabeceras de seguridad (2026-10-02, confirmado con curl real contra producción)
Tu propio `curl -I` mostró que HSTS está activo (Vercel por defecto) pero faltaban CSP, X-Content-Type-Options,
X-Frame-Options, Referrer-Policy y Permissions-Policy. Agregadas en `vercel.json` → `headers`. La CSP va en
modo `Content-Security-Policy-Report-Only` a propósito: avisa en la consola del navegador si algo la violaría,
pero **no bloquea nada** — no se pudo probar en un navegador real antes de agregarla, y una CSP mal calibrada
puede romper la carga de Supabase, las fuentes de Google o el mapa de rutas (OpenStreetMap) en silencio. Una
vez confirmado que no aparecen avisos en la consola durante un uso normal de la app, cambiar la clave a
`Content-Security-Policy` (sin "-Report-Only") para que empiece a bloquear de verdad.

## Registro con un correo ya existente (2026-10-02)
`supabase.auth.signUp()` no devuelve error cuando el correo ya tiene cuenta confirmada — es
anti-enumeración a propósito (si devolviera error, cualquiera podría usar el formulario de registro
para probar qué correos ya son clientes). La señal oficial es `data.user.identities.length === 0`,
confirmada contra la documentación de Supabase. `Signup.tsx` ahora la detecta y muestra "Ese correo ya
tiene una cuenta" con enlaces directos a Entrar/Recuperar contraseña, en vez de llevar a una pantalla de
código que nunca iba a llegar. Si la cuenta existe pero NUNCA se confirmó, Supabase sí reenvía un código
real — ese caso queda intacto, sin cambios.

## Restablecer contraseña de propietarios desde Administración de la plataforma (2026-10-02)
Nueva función Edge `platform-admin` (acción `reset_owner_password`), desplegada. Exige reautenticación
con la contraseña del propio administrador de la plataforma, verifica `is_platform_admin` leyendo la
tabla directamente, cambia la contraseña del propietario objetivo vía `admin.auth.admin.updateUserById`,
y cierra todas sus sesiones activas después (`admin.auth.admin.signOut(..., 'global')`) — una contraseña
nueva no debe convivir con una sesión abierta con la anterior. Queda registrado en `activity_logs` del
negocio afectado. Botón nuevo (ícono de llave) en cada fila de `SuperAdmin.tsx`.

## Pendiente de decisión: funciones por plan configurables (no construido)
Pedido: poder anular lo que ve un negocio sin importar su plan, y poder configurar qué incluye cada
plan desde el panel en vez de en el código. Hoy el sistema solo distingue "básico vs. no básico" (página
`RequirePaid.tsx`) y "business vs. no business" (unas pocas pantallas) — ambos chequean
`business.subscription_plan` directo, repetido en ~10 lugares del frontend y en varias reglas de la base
de datos (p. ej. el límite de llaves de API solo para plan Business). Construir esto bien requiere una
tabla de funciones por plan más una de anulaciones por negocio, y reescribir esos ~10 lugares para
consultarla en vez del plan directo — un cambio de arquitectura real, no un ajuste rápido. Diseño
propuesto, sin construir todavía: `plan_features(plan, feature_key, enabled)` +
`business_feature_overrides(business_id, feature_key, enabled)` + una función `business_has_feature()`
que resuelve ambas.

## Funciones por plan, configurables (construido y probado en producción, 2026-10-02)
`plan_features` (qué incluye cada plan por defecto) + `business_feature_overrides` (anulación puntual
por negocio) + `business_has_feature()` los resuelve (anulación manda, si no hay, el plan). Valores
iniciales = exactamente el comportamiento de antes (probado contra INFINITE PLATFORM/business y
sigilo/basic — ambos dieron el resultado esperado). `resolve_api_key` también migrado a este sistema.
Frontend: `AuthContext` expone `hasFeature(key)`; `RequirePaid` ahora recibe `feature` como prop (antes
un solo interruptor "básico/no básico" para las 11 páginas Pro); `Dashboard`/`BranchPicker`/`Reports`/
`NotificationsBell` migrados — `isBusiness` en Dashboard.tsx se separó correctamente en dos funciones
independientes (`sucursales` y `dashboard_personalizado`), que antes compartían un solo interruptor sin
necesidad. Panel nuevo en `SuperAdmin.tsx`: tabla de 15 funciones × 3 planes (toggle directo), y un panel
expandible por negocio para forzar sí/no sin importar su plan. 14 claves de función, todas verificadas
contra la base de datos real antes de tocar el frontend.

## Comparativo real de planes ("Ver más", 2026-10-02)
`PlanComparisonModal.tsx` — tabla con límites (clientes/préstamos) + las 15 funciones de plan_features,
cada una con un ejemplo concreto de qué hace en la práctica, no solo el nombre. Lee `plan_features`
directo (ya tenía política de lectura para cualquier autenticado) — encontré y corregí que le faltaba el
permiso base de SELECT a nivel de tabla (la política de RLS sola no bastaba sin ese permiso; confirmado
con un propietario real de plan Básico antes y después del arreglo). Enlace "Ver más" agregado junto al
botón "Pasar a Pro"/"Pasar a Business" del banner del Dashboard.

## Cuota deseada → resuelve la tasa (2026-10-02)
Botón "Fijar cuota deseada" en la esquina de "Información del préstamo" (Nuevo préstamo). Abre un panel
inline: escribes cuánto quieres cobrar por cuota, y `solve_rate_for_installment` (búsqueda binaria sobre
el mismo private.build_schedule real, 60 iteraciones) devuelve la tasa exacta. Cubre los tres métodos con
una cuota fija única (solo interés, interés fijo sobre capital, francés); saldo decreciente queda fuera
a propósito — ahí cada cuota es distinta por diseño, no hay una sola cuota que fijar, y el botón se
reemplaza por un aviso en vez de ofrecer algo que no reflejaría el préstamo real. Probado con ejemplos
reales ida y vuelta (cuota→tasa→cuota) en los tres métodos antes de tocar el frontend — coincide hasta
redondeo de centavos. Mismo descuido de M-01 reaparecido aquí (revocar de "anon" no bastaba, hacía falta
revocar de "public" — el permiso real venía de ahí) y corregido de inmediato, confirmado con
has_function_privilege.

## Precios y límites por plan, configurables (2026-10-03)
Nueva tabla `plan_limits` (precio + máximo de clientes/préstamos/colaboradores + si limita a un
préstamo activo por cliente), reemplazando números escritos a mano en tres disparadores de la base de
datos (`guard_client_limit`, `guard_loan_limit`, `guard_collaborator_limit`) y una columna separada por
negocio (`businesses.max_collaborators`, que solo aplicaba a colaboradores y vivía aislada del resto).
La función Edge `collaborators-admin` también se actualizó para leer el límite de ahí en vez de la
columna vieja. **Cambio pedido aplicado:** Pro pasa de "ilimitado" a 100 clientes / 150 préstamos;
Básico y Business quedan exactamente como estaban. Probado en vivo con datos ficticios: los 10 clientes
de básico, el límite de 150 préstamos (bajado a 2 temporalmente para probar sin insertar 150 filas), y
el límite de colaboradores (bajado a 0 temporalmente) — los tres casos correctos, revertidos sin dejar
rastro. Frontend: `ProPitchContent`/`BusinessPitchContent`/`PlanComparisonModal`/el banner del Dashboard
ya no tienen precios ni "ilimitados" escritos a mano — todos leen `plan_limits` en vivo. Panel nuevo en
Administración de la plataforma: "Precios y límites por plan", una fila editable por plan con guardado
inmediato.

## Mensaje de WhatsApp con datos del negocio (2026-10-03)
`upgradeWhatsappLink` incluye ahora nombre del negocio, propietario, plan actual y correo — encontré que
esto se había empezado a agregar en un lugar (ProPitchContent, sin correo) pero no en los otros cuatro
(BusinessPitchContent no pasaba nada, el banner del Dashboard y los dos botones del comparativo
tampoco). Completado en los cinco lugares de forma consistente.

## Borrado de cliente no refrescaba la lista (2026-10-03)
`ClientDetail.tsx`: al borrar un cliente, el código navegaba de vuelta a /clientes pero nunca invalidaba
la caché de React Query — la lista seguía mostrando la versión vieja (con el cliente "borrado" todavía
ahí) hasta recargar la página a mano. El borrado en sí SIEMPRE funcionó bien en la base de datos
(confirmado: el cliente de prueba real quedó con deleted_at correcto). Corregido invalidando ['clients']
y ['client', id] en el onSuccess.

## Clientes eliminados seguían apareciendo (2026-10-03) — causa real encontrada
La lista principal de clientes (`Clients.tsx`) nunca filtraba por `deleted_at is null` — por eso, sin
importar cuántas veces se invalidara la caché (la corrección anterior), el servidor seguía devolviendo
al cliente "borrado" porque nunca se le pidió excluirlo. Corregido ahí, y en los otros tres lugares con
el mismo problema real (selector de cliente al crear préstamo, al crear solicitud, al agregar a una
ruta) — en los tres, un cliente eliminado podía seguir eligiéndose para algo nuevo. Dejados sin tocar a
propósito: Collateral.tsx y Loans.tsx, que solo muestran el nombre de un cliente junto a un préstamo o
garantía YA EXISTENTE — ahí sí debe verse el nombre aunque el cliente se haya borrado después.

## Actualizaciones tardaban en reflejarse — corregido (2026-10-03)
`registerType: 'autoUpdate'` solo controla qué hace el service worker nuevo cuando el navegador decide
revisar — pero nada en el código pedía esa revisión activamente, así que dependía de que el navegador lo
notara por su cuenta (podía tardar mucho). `UpdatePrompt.tsx` (montado en main.tsx) ahora revisa cada 60
segundos mientras la app está abierta, y muestra un aviso con botón "Actualizar ahora" en cuanto hay una
versión nueva — nunca recarga sola, para no interrumpir algo a medio llenar. No se pudo verificar con
`tsc` en este entorno (el módulo `virtual:pwa-register` solo lo resuelve Vite al compilar de verdad, no
hay node_modules aquí) — mismo tipo de limitación que con Leaflet; el build real es la prueba definitiva.

## Importar préstamos viejos: "Marcar cuotas ya pagadas" (2026-10-03)
`register_payment` ahora acepta un parámetro opcional `p_paid_at date` (null = hoy, igual que siempre —
cero cambio de comportamiento para pagos normales). Cuando se indica, se usa en vez de "hoy" para TODO el
cálculo interno (mora, fecha guardada en `payments.paid_at`, separada de `created_at` que sigue siendo
cuándo se ingresó de verdad). Permite registrar pagos de hace meses sin que los reportes los mezclen con
el mes actual. Nuevo botón "Marcar cuotas ya pagadas" en LoanDetail.tsx (solo visible si el préstamo
aún no tiene ningún pago — su propósito es el arranque de un préstamo importado, no uso diario): marca
las primeras N cuotas pendientes, cada una con su propia fecha de vencimiento como fecha de pago.

**Error grave encontrado y corregido en el camino:** el CREATE OR REPLACE con un parámetro nuevo creó
una SEGUNDA versión de register_payment (firma distinta) en vez de reemplazarla, dejando dos sobrecargas
ambiguas — cualquier llamada normal del sistema habría fallado. Detectado de inmediato al probar,
corregido eliminando la versión vieja antes de que afectara producción real.

**Dato real restaurado:** la investigación de hace dos turnos (bug "no se borra") había dejado al cliente
real "jordany" y a su préstamo marcados como eliminados, sin que se avisara explícitamente — nunca se
restauraron después de confirmar el diagnóstico. Encontrados y corregidos en el camino al diagnosticar
por qué register_payment decía "préstamo no encontrado" en las pruebas de regresión.

## Faltaba el campo "Fecha de inicio" en Nuevo préstamo — corregido (2026-10-03)
El formulario de "Nuevo préstamo" nunca tenía un campo para la fecha de inicio — ni una sola mención en
todo el archivo. Por eso create_loan siempre recibía la fecha de inicio implícita de la base de datos
(hoy), sin importar qué "Primer pago" se eligiera, bloqueando cualquier intento de traer un préstamo
viejo con fechas reales pasadas. Agregado el campo (por defecto hoy, editable), enviado como
p_start_date a create_loan, y mostrado en el resumen de confirmación. Probado en vivo: un préstamo con
fecha de inicio 1 de junio y primer pago 15 de junio se creó sin error.

## Paso 2 de Nuevo préstamo simplificado + compacto en móvil (2026-10-03)
Quitado el campo "La tasa aplica" — confirmé en el motor real (build_schedule) que "saldo decreciente" y
"francés" SIEMPRE exigen tasa por período (el motor los rechaza con "por todo el plazo"), así que esa
pregunta nunca tuvo sentido para esos dos métodos; solo aplicaba de verdad a "interés fijo sobre capital
inicial". Ese método se separó en dos opciones claras, sin preguntar nada aparte: "Capital + interés
(total, sin importar el tiempo)" (antes: fijo + por todo el plazo) e "Interés por cuota" (antes: fijo +
por período). El selector de Método pasó de 3 a 4 opciones; internamente se sigue traduciendo a
(amortization_method, rate_basis) antes de llamar a las mismas funciones de siempre — sin cambios en la
base de datos. Probado contra el motor real (incluido saldo decreciente, nunca antes probado solo en
esta sesión). El grid del formulario pasa a 2 columnas desde el móvil (antes era 1 columna ahí, muy
largo) para que se vea más compacto, como el ejemplo de referencia.

## Ronda de QA completo y correcciones (2026-10-23) — v85
Regresión completa de la PWA (todos los paneles, datos de prueba "PRUEBA QA") hecha por jail tras el
traspaso del proyecto. Hallazgos y correcciones:
- **Editar cliente (bug de QA) RESUELTO en base de datos:** faltaba el `GRANT UPDATE` sobre
  `clients.latitude/longitude/location_captured_at` para `authenticated` (el gemelo de INSERT se había
  corregido en su momento, solo INSERT). Verificado en vivo false→true y con prueba funcional en la
  app: la edición guarda sin error.
- **Seguridad (regresión de M-01):** `register_payment` era ejecutable por el rol `anon`. Revocado
  EXECUTE a `anon` y a `public`; `authenticated` lo conserva. Verificado por firma.
- **FUGA entre negocios:** `payment_details` era la única de las 10 vistas sin `security_invoker=true`;
  el panel Pagos mezclaba recibos de todos los negocios. `ALTER VIEW ... SET (security_invoker = true)`,
  verificado en pg_class.
- **Historial duplicado:** al editar un cliente, `audit_client_update` y `log_client_activity`
  registraban 'client_updated' dos veces. `log_client_activity` ahora omite ese caso cuando cambiaron
  full_name/phone/status/assigned_to (eso lo cubre `audit_client_update` con antes/después).
- **"Borrar cliente congela la página" NO era un bug para humanos:** con clic manual el borrado tarda
  ~2 s y navega a la lista. El supuesto congelamiento era el `confirm()` nativo, que el navegador
  automatizado de QA descarta sin mostrarlo.
- **Ficha fantasma de cliente borrado:** `ClientDetail.tsx` no filtraba `deleted_at` en la consulta del
  cliente; su ficha seguía abriendo por URL directa como "Activo". Agregado `.is('deleted_at', null)`:
  ahora responde "Cliente no encontrado". (Los préstamos del cliente borrado siguen visibles en
  Préstamos a propósito, como se decidió en su momento.)
- **Fecha del recibo corrida un día:** `payments.paid_at` se guarda como la medianoche UTC de su día y
  el recibo lo mostraba en hora local (día anterior, 8:00 p. m. en RD). `format.dateTime` ahora detecta
  la medianoche UTC y devuelve ese día sin hora inventada; `Receipt`/`QuoteReceipt` solo muestran la
  hora si existe; Reportes > Movimientos usa el mismo criterio (`movementWhen`).
- **Gastos sin salida:** la lista no filtraba `deleted_at` y no existía forma de borrar un gasto (un
  gasto de prueba de RD$1 quedó atrapado; se limpió por SQL con borrado lógico). Agregados el filtro y
  un botón de eliminar solo para el propietario (borrado lógico con confirmación, mismo patrón que
  clientes; la tabla ya tenía `deleted_at` y política UPDATE).
- **Sin verificar aún:** el modal del recibo no cerró tras "Imprimir / PDF" en el navegador de QA
  (posible artefacto de ese navegador, igual que el caso del confirm()); y estos cambios de código no
  se compilaron en esta carpeta (sin node_modules) — el build al desplegar v85 es la prueba definitiva,
  como en rondas anteriores.

## Rediseño v86 — port exacto de la maqueta Figma (2026-10-25)
Maqueta aprobada primero como artefacto interactivo y luego en Figma («NEXCREDIT — Maqueta
rediseño», cuenta jordanyjames623@gmail.com, file_key sISFgfQczsTTbvV2yQFV0w, 7 pantallas).
Port a la app real, sin cambiar la lógica ni los datos (solo presentación y navegación):
- **Splash nuevo** (`components/Splash.tsx`): NEXCREDIT letra por letra (keyframes `letter-in` en
  `motion.css`, solo transform/opacity, respeta `prefers-reduced-motion`), una vez por sesión
  (`sessionStorage nc_splash`), auto-cierre a los 2.6 s, botones Entrar / Saltar intro; se repite
  desde Más → «Ver introducción» (`MobileDrawer`, `AppLayout`).
- **Inicio** (`Dashboard.tsx` + `components/dashboard/HomeSections.tsx`): hero azul con contador
  animado de la cartera total (la misma cifra del resumen ejecutivo; la de la sucursal elegida si
  aplica), píldoras «Por cobrar hoy» y N cuotas; 4 botones grandes (Nuevo préstamo, Registrar
  pago → /prestamos, Nuevo cliente, Calculadora); «Para cobrar hoy» con datos reales del
  calendario (Llamar `tel:`, WhatsApp `wa.me`, Cobrar → ficha del préstamo). La cuadrícula vieja
  de acciones rápidas se reemplazó por la nueva; `AttentionStrip` y el resto de paneles ejecutivos
  se conservan debajo (la gráfica semanal y la dona de la maqueta corresponden a los paneles de
  Cobros y Cartera por estado que ya existían).
- **Préstamos** (`Loans.tsx`): barra de progreso por préstamo (cuotas pagadas ÷ totales desde
  `installment_details`; si esa vista falla, la fila se muestra sin barra, nunca rompe la lista) y
  botón Cobrar por préstamo activo; el número se muestra como PR-#### como en la maqueta.
- **Calculadora** (`Quote.tsx`): el resultado ahora es una sola tarjeta azul con la cuota destacada,
  interés total y total a pagar (los mismos valores de antes).
- **Sin tocar:** Clientes y Pagos ya tenían la presentación de la maqueta (buscador, píldoras,
  filas con avatar/recibo) y no se modificaron; Registrar pago sigue siendo el flujo existente en
  la ficha del préstamo (no se inventó un flujo nuevo).
- **Sin compilar en esta carpeta** (sin node_modules): el build al desplegar v86 es la prueba
  definitiva, como en rondas anteriores.

## Conector nextex v87 — NEXCREDIT-1A (2026-10-25)
Patrón Infinite Smells, sin repo ni push: el código vive en esta carpeta y JC despliega a mano.
- **Migración** (`supabase/migrations/20261025_nextex_connector.sql`, JC la ejecuta en el SQL de
  Supabase, proyecto capitalia): columnas `businesses.nextex_id` / `nextex_key` (únicas); trigger
  `private.assign_nextex_identity` (BEFORE INSERT, SECURITY DEFINER) que genera `cr` + secuencial
  (cr0001…) y llave `nx_` + 48 hex a todo negocio nuevo — cubre el registro (trigger
  `handle_new_user`) y cualquier otra vía, porque actúa sobre el INSERT, no sobre el form;
  backfill solo-agrega (nunca toca otros datos ni filas que ya tienen identidad); función
  `nextex_business_summary(uuid)` (SECURITY DEFINER, solo service_role) con los 5 datos del
  resumen, cada subconsulta filtrada explícitamente por business_id (o JOIN a loans para pagos).
- **Endpoint** (`api/v1/nextex.js`, función Vercel fuera de `src` para que `tsc -b` no la toque):
  GET /api/v1/nextex, header `x-nextex-key`, 401 sin llave válida, 405 si no es GET, `no-store`.
  Busca el negocio por `nextex_key` y devuelve su resumen. Requiere la variable
  `SUPABASE_SERVICE_ROLE_KEY` en Vercel (la URL sale de `SUPABASE_URL` o `VITE_SUPABASE_URL`).
- **Panel** (`components/NextexConnectionPanel.tsx`, sección «Conexión nextex» en Configuración,
  solo propietario): muestra nextex_id + estado Activa, llave con mostrar/ocultar y copiar,
  endpoint y header, y el snippet del widget. El tipo `Business` en AuthContext ya trae los dos
  campos nuevos (`select('*')` los trae solos). Si la migración aún no se aplicó, la sección lo
  dice en vez de romperse.
- **Widget**: el mismo script que Infinite Smells
  (`https://nextex-seven.vercel.app/widget/nextex-chat.js` con `data-key` = llave del negocio,
  verificado en el código real de nextex). En el panel hay «Probar chat aquí» que inyecta el
  script solo mientras está activo y lo retira al apagarlo. Ojo: la burbuja solo responde con
  los datos del negocio cuando nextex tenga registrada esta llave (registro del lado de nextex,
  igual que IS).
- **`vercel.json`**: el rewrite del SPA ahora excluye `/api/` (`/((?!api/).*)`) para que el
  endpoint no lo trague la app; el resto de headers y la regla SPA quedan igual.
- **Sin compilar en esta carpeta**: el build al desplegar v87 es la prueba definitiva.
