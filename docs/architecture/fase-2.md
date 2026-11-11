# Fase 2 — Acceso del administrador

Entrega histórica de acceso. El catálogo posterior se describe en [Fase 3](fase-3.md).

La orden «Sigamos con la siguiente fase» autoriza el módulo de acceso recomendado
en la entrega anterior. Se conservan el administrador único, el acceso con usuario y
PIN, los datos locales y la excepción futura de recuperación por correo.

## Diseño previo a la implementación

- Primer uso: formulario para elegir usuario y PIN, sin seed ni credenciales automáticas.
  La base admite una sola identidad administrativa estable, incluso al cambiar el nombre.
- Login y logout offline. Las sesiones viven en memoria del servidor y se invalidan
  al reiniciar. Una sesión no sustituye al token efímero del canal Electron/Java.
- Cambiar credenciales exige sesión y PIN actual, conserva el identificador y todos
  los datos, incrementa la versión de credenciales e invalida sesiones anteriores.
- PIN numérico de 4 a 12 caracteres, preservando ceros iniciales; nombre de 1 a 60
  caracteres, sin controles y con espacios externos eliminados. No se registra el PIN.
- Hash PBKDF2 con sal y prefijo de algoritmo para futuras actualizaciones.
- Cinco fallos bloquean los intentos durante 60 segundos. Los contadores se guardan
  en SQLite para impedir evadir el bloqueo reiniciando. Usuario o PIN incorrectos
  generan el mismo mensaje. Los límites son configuración técnica, no reglas del negocio.
- Cookie de sesión HttpOnly/SameSite=Strict, 30 minutos sin solicitudes autenticadas. En Electron,
  la cookie y el token del proceso permanecen en el proceso principal; el preload
  ofrece operaciones concretas y devuelve datos sin credenciales.
- En desarrollo web, Vite añade el token del canal en el proxy. Un script de desarrollo
  prepara el token en .local, excluido de Git; no se incrusta en el frontend.
- Auditoría de configuración, logins, logout y cambio de credenciales, sin PIN, hash,
  cookies o tokens. No se crean empleados, roles adicionales ni módulos POS.
- V2 incorpora identidad y auditoría sin modificar V1. Antes de actualizar una base
  existente se realiza un respaldo consistente previo a las migraciones.

La recuperación por correo continúa pendiente: requiere elegir proveedor y diseñar
la vinculación verificada. No se presenta un botón que simule enviar correos. El código
offline sigue sin aprobación y no se implementa como una puerta alternativa.

## API y desarrollo

Todas las rutas auth requieren el token del canal local, nunca el PIN como cabecera:

| Ruta | Función |
| --- | --- |
| GET /api/auth/session | Indica si existe administrador y si la sesión es válida; solo devuelve usuario al estar autenticado |
| POST /api/auth/setup | Crea el único administrador con usuario y PIN elegidos; rechaza un segundo alta |
| POST /api/auth/login | Valida usuario y PIN y crea una sesión nueva |
| POST /api/auth/logout | Invalida la sesión; repetible sin efectos adicionales |
| POST /api/auth/credentials | Exige sesión y PIN actual; actualiza usuario/PIN e invalida todas las sesiones previas |

Las demás rutas futuras del negocio requieren sesión además de token. El diagnóstico
técnico de solo lectura sigue público en loopback y el cierre del proceso exige token,
permitiendo que Electron cierre Java aunque el administrador haya cerrado sesión.
La API rechaza orígenes web distintos de 127.0.0.1:5173/4173; no se habilita CORS abierto.
Las respuestas de acceso llevan Cache-Control: no-store. Las solicitudes con credenciales
tienen representación textual redactada y el logging web/JDBC no registra sus cuerpos.

El flujo de navegador usa scripts/start-backend-dev.ps1 desde la raíz. Genera un token
en .local/api-token-<puerto>.txt, que Vite lee en el proxy al solicitar la API. El puerto
es 8080 por defecto; APPBARPOS_PORT permite otro, definido en ambas terminales. Se verifica
su disponibilidad antes de escribir el token. La interfaz permanece en 5173 o 4173.
No se incluyen secretos en VITE_*, bundle, localStorage o sessionStorage.

El nombre conserva distinción entre mayúsculas y minúsculas. Para cambiar únicamente
el usuario se puede repetir el PIN actual como PIN nuevo. El frontend confirma los
cambios antes de enviarlos y muestra la espera cuando hay bloqueo temporal.

## Verificación realizada

- Maven verify: 11 pruebas aprobadas, sin errores ni fallos. Incluyen las 5 comprobaciones
  de infraestructura, recorrido HTTP de acceso, 3 pruebas de servicio y 2 de respaldo.
- Alta única, sal/prefijo del hash, ceros iniciales, mensajes de error uniformes,
  cookie HttpOnly/SameSite, rechazo de canales/orígenes no autorizados y cierre de sesión.
- Cambio con PIN actual, rechazo de PIN incorrecto, identidad estable, conservación de
  un marcador de datos y revocación de dos sesiones independientes.
- Bloqueo persistido tras recrear el servicio y desbloqueo al avanzar un reloj de prueba,
  sin esperas reales. Rollback de cambio de credenciales si falla la auditoría.
- Reinicio real del proceso Java sobre la base temporal creada por el recorrido de
  Electron: la identidad y el PIN actualizado permanecen; la sesión anterior no.
  El nuevo login y logout pasan: PROCESS_RESTART_AUTH_PERSISTENCE_OK.
- Respaldo de V1 antes de V2 con datos, medios, manifiesto y checksum; extracción e
  integrity_check del snapshot. Un fallo de respaldo impide aplicar V2.
- TypeScript y Vite compilan. El puente Electron pasó el recorrido por formularios de
  alta, cambio, intento con el PIN anterior rechazado, reingreso y logout, usando una
  base temporal marcada explícitamente. Se comprueba que el PIN se limpia tras fallar.
  El resultado fue APPBARPOS_AUTH_SMOKE=setup,credentials,relogin,logout:OK y
  APPBARPOS_RENDER_SMOKE=true. Se inspeccionó visualmente la pantalla de primer uso.
- Proxy web verificado en preview 4173 con backend aislado 8081: alta, cookie, sesión,
  logout, rechazo de origen externo y de solicitudes directas sin token. El token del
  ensayo no aparece en los archivos JavaScript compilados.

Los puertos 8080 y 5173 estaban ocupados durante la verificación web; se conservaron
los procesos existentes y se utilizó un par alternativo permitido. El primer intento
fallido motivó el control previo de disponibilidad en el script.

Se mantienen las versiones de Fase 1. Se añade solo @types/node 22.20.5 como dependencia
de desarrollo para tipar el proxy Vite. El runtime redistribuible y el instalador offline
siguen pendientes, igual que recuperación por correo y restauración mediante interfaz.

Siguiente etapa recomendada: catálogo propio de productos con imágenes locales.
Inventario y ventas requieren primero confirmar las reglas de medidas y movimientos
que siguen pendientes en la propuesta original.

## Corrección de ventana oculta tras npm start

Al revisar el primer arranque del propietario se comprobó que Java había iniciado,
SQLite estaba actualizado y existía una ventana nativa titulada AppBarPOS con
IsWindowVisible=false. Se recuperó esa ventana sin cerrar procesos ni modificar datos.

El lanzador ahora inicia Electron como aplicación visible (windowsHide=false), mientras
Java continúa como proceso auxiliar oculto. El proceso principal mantiene la referencia
de ventana, ejecuta show/focus al cargar y también ante second-instance. Se añaden
mensajes de progreso para distinguir espera de arranque, disponibilidad y ventana lista.

La prueba de escritorio usa un perfil Electron independiente y verifica isVisible
después de mostrar la ventana nativa, además del recorrido de formularios. Esto cubre
un caso que la comprobación anterior, ejecutada siempre en ventana oculta, no detectaba.
Se retiró la captura opcional de pantalla del recorrido automático para que no dependa
de la disponibilidad de captura de una ventana oculta en Windows. Resultado final:
npm run check correcto, APPBARPOS_WINDOW_VISIBILITY=true, recorrido auth OK y render OK.

Fuentes: [almacenamiento de credenciales en Spring Security](https://docs.spring.io/spring-security/reference/features/authentication/password-storage.html)
y [seguridad IPC en Electron](https://www.electronjs.org/docs/latest/tutorial/security).
