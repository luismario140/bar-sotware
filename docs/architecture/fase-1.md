# Fase 1 — Configuración inicial de AppBarPOS

Documento histórico de la primera entrega. El estado actual del acceso administrativo
se describe en [Fase 2](fase-2.md); sus avances no cambian los resultados históricos aquí registrados.

## Revisión documental

Se leyó completa propuesta-inicial.md, el único documento de docs existente al comenzar,
además del README y la solicitud de Fase 1. No existían código ni migraciones.
Se conservaron los cambios documentales previos del árbol de trabajo.

Discrepancias y resolución conforme a la instrucción más reciente del propietario:

- «Esperar aprobación» y elección pendiente de Electron: la orden de comenzar Fase 1
  autoriza esta infraestructura y confirma Electron con Electron Builder.
- Se adopta AppBarPOS como nombre. Se conserva la ruta BarSoftware documentada para
  evitar cambiar silenciosamente la ubicación de los datos.
- Docker queda permitido solo como herramienta opcional de desarrollo; no se necesita ahora.
- Las credenciales temporales de desarrollo documentadas no son un seed de producción.
  No se crean cuentas ni PIN automáticamente. Preparar el hash no implementa el login.
- Offline de las operaciones coexiste con la excepción aprobada de recuperación por correo.
  Este servicio futuro no bloqueará el trabajo local ni recibirá la base del negocio.

## Entrega

- React/Vite con TypeScript, pantalla técnica en español y componentes/servicios separados.
- Spring Boot, Maven Wrapper y JAR con bytecode objetivo Java 21.
- SQLite JDBC con FK por conexión, WAL, FULL, busy_timeout y pool de una conexión.
- Flyway Core explícito, checksums y V1 solo de metadatos técnicos.
- Rutas persistentes fuera de instalación, con directorios de medios, logs y respaldos.
- Encoder PBKDF2-HMAC-SHA256 con sal aleatoria, sin cuentas o credenciales precargadas.
- API en loopback, diagnóstico real y protección del canal mediante token efímero.
- Electron aislado con preload mínimo, instancia única, proceso Java supervisado y
  cierre técnico protegido. No confundir este endpoint con un cierre de caja.
- Configuración Electron Builder/NSIS y hook que rechaza recursos ausentes.
- .gitignore, archivos de bloqueo npm y guía de desarrollo.

GET /api/system/health es público solo en loopback y devuelve estado genérico sin datos
del negocio. POST /api/system/shutdown exige token. El token del canal no es una sesión
del administrador; las futuras rutas necesitarán autenticación y autorización adicionales.

## Versiones y decisiones

Versiones directas: Spring Boot 4.1.2, objetivo Java 21, SQLite JDBC 3.54.1.0,
Maven 3.9.16, Wrapper 3.3.4, React/React DOM 19.3.1, Vite 8.3.8,
plugin React 6.3.0, TypeScript 5.9.3, Electron 45.3.0 y Electron Builder 26.18.0.
Flyway 12.4.0 y Spring Security Crypto 7.1.2 proceden del BOM de Spring Boot.
Los package-lock.json fijan las dependencias transitivas npm.

JDBC evita añadir un dialecto ORM para SQLite. Flyway evita crear un motor propio de
migración. El pool de una conexión reduce competencia por escrituras; las futuras
transacciones deben evitar reclamar otra conexión mientras mantienen una abierta.

Electron utiliza archivos compilados sin Vite. Inicia Java con puerto 0 y recibe el
puerto por un marcador de disponibilidad sin credenciales. El renderer no recibe el token.

## Pendientes

- Acceso con usuario y PIN: alta, cambios, sesión, política de PIN, límites y auditoría.
- Recuperación por correo: proveedor y vinculación con instalación/correo verificado.
  El código offline sigue siendo una propuesta pendiente de aprobación.
- Reglas de shots, botellas, mermas, stock y pagos pendientes en la propuesta original.
- Backups/restauración completos de base e imágenes, y respaldo previo a migrar datos reales.
- Runtime Java redistribuible, firma, automatización e instalador offline validado.
- Medir memoria y comprobar distribución en Windows 10 y 11 limpios.

No se implementan ventas, inventario, cuentas, caja, reportes ni facturas.

## Validación

Verificación realizada el 11 de noviembre de 2026 en el equipo Windows disponible,
con JDK 25.0.1, Node 22.19.0 y npm 10.9.3:

| Comprobación | Resultado real |
| --- | --- |
| Maven Wrapper verify | BUILD SUCCESS, JAR ejecutable generado; 5 pruebas, 0 errores y 0 fallos |
| SQLite | FK rechaza referencias inexistentes; WAL y FULL activos; rollback sin escrituras parciales |
| Flyway | V1 aplicada; segunda ejecución sin duplicar; validación de checksums correcta |
| Hash | Dos hashes diferentes para el mismo PIN de prueba; verifica el correcto y rechaza otro |
| HTTP backend | GET health devuelve 200 y estado UP desde SQLite; shutdown sin token devuelve 401 |
| Frontend build | TypeScript y Vite completados correctamente |
| Vite dev | HTTP 200 en 127.0.0.1:5173, con título y entrada React esperados |
| Proxy Vite | GET /api/system/health responde con backend y SQLite UP |
| Persistencia entre procesos | Tras apagar Java, insertar un marcador técnico aislado y arrancar de nuevo, el marcador permanece |
| Desktop check | Sintaxis de procesos, preload y scripts válida |
| Electron integrado | APPBARPOS_DESKTOP_SMOKE con status/database UP y APPBARPOS_RENDER_SMOKE=true |
| Cierre del escritorio | Respuesta 202 al cierre protegido, graceful shutdown de Tomcat y cierre de Hikari en el log |
| Electron Builder | Lee la configuración y ejecuta el hook; rechaza el empaquetado por ausencia del runtime Java, según lo previsto |

Las pruebas usaron carpetas temporales; no generaron productos, usuarios o ventas.
La prueba de persistencia utilizó node:sqlite únicamente como herramienta del ensayo,
no como dependencia de la aplicación, que accede a SQLite exclusivamente desde Java.

Problemas encontrados y resueltos:

- La búsqueda automática de configuración del test no encontró la aplicación: se
  declaró explícitamente AppBarPosApplication en SpringBootTest.
- El arranque de pruebas resolvía una ruta de logs fuera del directorio previsto:
  se corrigió el fallback y se aisló el log de tests en el directorio temporal.
- Una CSP fija impedía el preámbulo de React Refresh: Vite añade la política estricta
  solo a la compilación, utilizada por Electron. No se cargan recursos externos.
- Electron Builder rechaza hooks fuera de su raíz de trabajo: se ubicó en desktop/scripts.
- El entorno heredaba ELECTRON_RUN_AS_NODE: el lanzador propio lo elimina solo del
  proceso hijo Electron, sin modificar el entorno del sistema.

La primera instalación y el primer arranque de Electron descargaron dependencias y su
binario. Esto corresponde al entorno de desarrollo, no al funcionamiento del paquete
final. npm informó dependencias transitivas deprecadas de las herramientas; no impidieron
las comprobaciones. El JDK avisó de carga dinámica del agente de Mockito durante los
tests; no es un componente de ejecución del producto.

No se generó un instalador, no se probó en Windows 10 ni en un Windows 11 limpio y
no se verificó la redistribución de Java. Tampoco se simularon esas comprobaciones.
El siguiente paso recomendado es diseñar el acceso del administrador y el primer
esquema de identidad, manteniendo separadas las credenciales y los datos del negocio.

Fuentes: [Spring Boot](https://docs.spring.io/spring-boot/system-requirements.html),
[Vite](https://vite.dev/guide/), [Electron](https://www.electronjs.org/docs/latest/tutorial/security)
y [Electron Builder](https://www.electron.build/configuration.html).
