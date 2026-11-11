# AppBarPOS

POS de escritorio para Windows 10/11 x64 en desarrollo por etapas. Incluye acceso del
administrador y catálogo propio con imágenes, categorías, precios por unidad/shot y
activación/desactivación. Inventario, ventas, jornadas y caja siguen pendientes.
No se emiten facturas.
Las cuentas serán independientes, sin mesas, con un único administrador y ventas por
unidad/shot. La operación será offline; la recuperación opcional por correo será la
única excepción aprobada y todavía no está implementada.

## Estructura

```text
frontend/                 React + TypeScript + Vite
  src/app/                Composición de interfaz
  src/components/         Componentes compartidos
  src/catalog/            Tarjetas, edición, imágenes y dinero exacto
  src/pages/              Acceso y administración local
  src/services/           Autenticación y diagnóstico
backend/                  Spring Boot + Maven Wrapper
  src/main/java/com/appbarpos/
    infrastructure/       SQLite, rutas persistentes y seguridad técnica
    system/               Diagnóstico y ciclo de vida del proceso
    auth/                 API, servicios, identidad y auditoría del administrador
    catalog/              API, servicios, repositorios e imágenes de productos
database/migrations/      SQL versionado, incorporado al JAR
desktop/                  Electron y preload limitado
installer/                Electron Builder y verificación de recursos
docker/                   Herramientas opcionales de desarrollo
docs/                     Requisitos, arquitectura y datos
scripts/                  Arranque seguro del backend para desarrollo web
```

## Requisitos de desarrollo

- JDK 21 o superior compatible con Spring Boot (verificado con JDK 25.0.1).
- Node.js 22.12 o superior compatible con Vite (entorno: 22.19.0) y npm (10.9.3).
- Git. No se necesita instalar Maven globalmente: se incluye Maven Wrapper.
- Internet para descargar inicialmente Maven y dependencias Java/npm/Electron.

No se necesita Docker ni instalar SQLite por separado. El equipo del bar no requerirá
JDK, Node ni Maven: el paquete final deberá incluir sus componentes de ejecución.
Esta fase no entrega todavía un instalador listo para uso real.

## Backend

Compilar y probar desde la raíz:

```powershell
cd backend
.\mvnw.cmd verify
```

Para usar el frontend en navegador, ejecutar desde la raíz en otra terminal:

```powershell
.\scripts\start-backend-dev.ps1
```

El script genera un token de canal aleatorio, lo comparte con el proxy Vite mediante
un archivo en .local excluido de Git y ejecuta Maven Wrapper. Nunca crea un usuario o
PIN. El backend escucha únicamente en `http://127.0.0.1:8080`. Comprobar:

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/system/health
```

El diagnóstico consulta SQLite y debe devolver `status=UP` y `database=UP`.
Detener con Ctrl+C. Si el puerto está ocupado, el script se detiene antes de cambiar
el token. Se puede definir `$env:APPBARPOS_PORT = '8081'` en ambas terminales,
backend y frontend. Vite utiliza ese puerto como destino del proxy; la página sigue
en 5173 o 4173. No es necesario detener procesos ajenos.

El comando directo `.\mvnw.cmd spring-boot:run` dentro de backend/ sigue disponible
para diagnóstico técnico, pero genera un token privado que Vite desconoce. Para probar
login desde navegador, utilizar el script anterior; para escritorio, Electron lo gestiona.

## Frontend

En otra terminal desde la raíz:

```powershell
cd frontend
npm ci
npm run dev
```

Abrir `http://127.0.0.1:5173`. El proxy añade el token en el servidor sin exponerlo al
navegador. El primer uso permite elegir usuario y PIN; después se muestra el login.
La pantalla muestra un error real si el servicio local no responde.

```powershell
npm run build
npm run preview
```

Preview sirve la compilación en `http://127.0.0.1:4173` con el mismo proxy.
Usar preview o Electron para probar la compilación, no abrir el HTML en el navegador.

## Escritorio

Compilar primero backend y frontend. Desde la raíz:

```powershell
cd desktop
npm ci
npm run check
npm start
```

Electron carga el frontend compilado y arranca su propio Java desde
backend/target/appbarpos-backend-runtime.jar, en un puerto dinámico local. No requiere Vite ni un backend iniciado
manualmente. Usa JAVA_HOME/bin/java.exe o java del PATH durante el desarrollo.
Al cerrar, solicita el apagado del backend mediante un token efímero y limita la espera.
Durante el desarrollo ejecuta una copia temporal del JAR para no bloquear las próximas
compilaciones en Windows. La copia se libera al terminar Java; los datos permanecen en AppData.
El renderer no recibe el token ni acceso directo al sistema de archivos.
El primer arranque en desarrollo puede descargar el binario de Electron. El lanzador
evita heredar ELECTRON_RUN_AS_NODE desde herramientas del entorno.
La consola muestra el inicio del servicio y la carga de la ventana; Java puede tardar
varios segundos en arrancar. La consola permanece ocupada mientras la aplicación está
abierta. Electron muestra y enfoca la ventana explícitamente; un segundo arranque
recupera la ventana existente, incluso si estaba oculta o minimizada.

## Datos y configuración

Se conserva la ubicación documentada, independiente del nombre visible del producto:

```text
%LOCALAPPDATA%/BarSoftware/
  data/bar.db
  media/productos/
  backups/
  logs/backend.log
```

Reinstalar no debe borrar este directorio. Cada usuario Windows tiene datos propios.
Las imágenes importadas y el respaldo automático previo a migraciones ya funcionan.
La interfaz de respaldo/restauración sigue pendiente. Fuera de Windows se utiliza
~/.local/share/BarSoftware como alternativa de desarrollo.

Para aislar pruebas manuales, definir antes de ejecutar:

```powershell
$env:APPBARPOS_DATA_DIR = Join-Path $env:TEMP 'AppBarPOS-desarrollo'
```

| Variable | Uso |
| --- | --- |
| APPBARPOS_DATA_DIR | Raíz persistente alternativa para backend y escritorio |
| APPBARPOS_PORT | Backend: 8080 por defecto; el script web requiere puerto fijo; Electron usa 0 para uno libre |
| APPBARPOS_API_TOKEN | Token de canal local, distinto del PIN; Electron genera uno por arranque |
| JAVA_HOME | JDK de desarrollo para Wrapper y Electron |

No hay usuarios ni PIN precargados. El primer administrador elige su acceso en la
aplicación; el PIN se guarda con hash PBKDF2, sal y prefijo de algoritmo. Se aceptan
4 a 12 dígitos, incluidos ceros iniciales. El nombre distingue mayúsculas/minúsculas.
Cinco fallos bloquean nuevos intentos durante un minuto, incluso al reiniciar.
La sesión expira tras 30 minutos sin solicitudes autenticadas y al reiniciar el backend.
En «Acceso y seguridad», cambiar credenciales requiere el PIN actual y confirmación;
después exige iniciar sesión de nuevo y revoca las demás sesiones. Los datos se conservan.
La recuperación por correo todavía no está implementada y no existe un PIN maestro.
No se guarda el PIN temporal documentado en SQL, configuración o código de producción.

## Productos e imágenes

Después de entrar se abre «Productos». El catálogo comienza vacío y lo administra el
propietario: crear, editar, buscar por nombre/categoría y filtrar activos/inactivos.
Las categorías son texto libre; no se instala un catálogo comercial de muestra.

Configurar precio por unidad, por shot o ambos. Dejar vacío el precio de una presentación
que no se ofrece; al menos una debe tener precio. Usar valores no negativos, sin puntos
de miles y con hasta dos decimales (por ejemplo, 6500,50). Java y SQLite guardan centavos
enteros y la interfaz conserva la precisión al editar, incluso en importes grandes.

Se puede seleccionar PNG/JPEG de hasta 5 MiB desde el computador o USB. La aplicación
valida su contenido y dimensiones (máximo 4096 por lado y 10 millones de píxeles),
normaliza a PNG de hasta 1024 por lado y guarda una copia en media/productos. Retirar
la USB o mover el original no rompe la imagen. Se puede reemplazar o quitar la foto;
los archivos anteriores se conservan para auditoría y respaldo, sin limpieza automática.

Desactivar y reactivar requiere confirmación y conserva identidad, presentaciones y
auditoría. Los cambios guardan quién los hizo y el estado anterior/nuevo. Las peticiones
repetidas no duplican registros; una edición obsoleta se rechaza y solicita actualizar
el catálogo. No se muestran existencias ni se descuenta inventario en esta fase.

Para cargar una nueva versión, cerrar la ventana anterior y volver a ejecutar npm start.
Un segundo inicio mientras esté abierta recupera la instancia existente y no sustituye
el código que esa ventana ya cargó.

## Migraciones y verificación

Flyway aplica database/migrations al arrancar y conserva versiones y checksums en
flyway_schema_history. V1 crea app_metadata; V2 añade administrator y administrator_audit;
V3 añade product, sale_presentation y product_operation.
No editar migraciones aplicadas: añadir V4__descripcion.sql, etc. No se utiliza ddl-auto
y Flyway clean está deshabilitado. Si una base existente necesita migración, se genera
antes un ZIP con una copia SQLite consistente, medios y manifiesto SHA-256; si falla,
el arranque se detiene antes de migrar. La interfaz de restauración sigue pendiente.
Ver [estrategia de datos](docs/database/migraciones.md).

SQLite habilita claves foráneas por conexión, WAL, sincronización FULL y espera de
bloqueos de 5 segundos. El pool inicial admite una conexión.

Ejecutar `.\mvnw.cmd verify` dentro de backend/ verifica arranque, migraciones repetidas
sin duplicación, integridad SQLite, rollback, hash, login, sesiones, bloqueo, cambio de
credenciales y respaldo previo, en carpetas temporales. `npm run build` dentro de frontend/
comprueba tipos y compila; `npm run check` dentro de desktop/ revisa la sintaxis de
los archivos de escritorio y el hook del instalador.
`npm test` dentro de frontend/ comprueba que editar y mostrar precios no pierda centavos.
Las pruebas del catálogo cubren idempotencia, conflictos, precios, imágenes independientes
del original, rollback y acceso protegido. Ninguna crea productos en el directorio real.

Prueba integrada desde desktop/, tras compilar ambos componentes:

```powershell
npm run smoke
```

Genera un directorio temporal exclusivo, crea un administrador de prueba mediante
los formularios, cambia credenciales, comprueba un login fallido y uno correcto,
crea un producto con imagen, edita, desactiva/reactiva y busca, consulta SQLite y cierra
sesión y Java. No usar el flag manual sobre datos reales.
También verifica que la ventana nativa pueda mostrarse. Utiliza un perfil Electron
aislado para no reutilizar ni enfocar una instancia real que ya esté abierta.
Resultados y limitaciones: [Fase 3](docs/architecture/fase-3.md).

## Instalador y siguientes etapas

Electron Builder está configurado para NSIS Windows x64, con conservación de datos.
El empaquetado falla explícitamente si faltan el runtime Java, el JAR o el frontend.
Ver [preparación del instalador](installer/README.md).

La siguiente fase recomendada es el inventario trazable. Antes de desarrollarlo
deben resolverse las reglas pendientes de
shots, botellas, mermas y descuento de existencias. Se mantienen los requisitos de la
[propuesta inicial](docs/architecture/propuesta-inicial.md), con las aclaraciones de cada fase.
