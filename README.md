# AppBarPOS

Flujo de trabajo con ramas: [CONTRIBUTING.md](CONTRIBUTING.md).

POS de escritorio para Windows 10/11 x64 en desarrollo por etapas. Incluye acceso del
administrador e inventario en tabla por categorías, precios por unidad/shot y
ventas por unidades completas con actualización automática de existencias y reposición.
Jornadas, caja y venta por shots con descuento de volumen siguen pendientes.
No se emiten facturas.
Las cuentas serán independientes, sin mesas, con un único administrador y ventas por
unidad/shot. La operación será offline; la recuperación opcional por correo será la
única excepción aprobada y todavía no está implementada.

## Estructura

```text
frontend/                 React + TypeScript + Vite
  src/app/                Composición de interfaz
  src/components/         Componentes compartidos
  src/catalog/            Edición de inventario y dinero exacto
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

El footer de escritorio muestra la versión del ejecutable, los créditos de Mario Dev
y la fecha del último respaldo previo a migraciones finalizado en `backups/`, en la
hora local del equipo. Ignora archivos parciales; si no hay copias registradas lo indica.
La consulta se actualiza al enfocar la ventana y cada minuto. Esta información no crea
respaldos adicionales. `npm test` en `desktop/` verifica la lectura de estos metadatos.

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
únicamente PIN de 4 dígitos, incluidos ceros iniciales, tanto en los formularios
como en el backend. El nombre distingue mayúsculas/minúsculas.
Cinco fallos bloquean nuevos intentos durante un minuto, incluso al reiniciar.
La sesión expira tras 30 minutos sin solicitudes autenticadas y al reiniciar el backend.
En «Acceso y seguridad», cambiar credenciales requiere el PIN actual y confirmación;
después exige iniciar sesión de nuevo y revoca las demás sesiones. Los datos se conservan.
La recuperación por correo permite restablecer el PIN con un código temporal de un
solo uso. El correo se registra al crear el administrador o desde «Acceso y seguridad».
El envío necesita internet y una cuenta emisora configurada; consulta
[la guía de configuración de Gmail](docs/recuperacion-acceso.md). No existe un PIN maestro.
No se guarda el PIN temporal documentado en SQL, configuración o código de producción.

## Productos e inventario

Después de entrar se abre «Inventario». Muestra una tabla con ID abreviado, nombre,
categoría, precio, cantidad vendida y cantidad restante. Los productos se agrupan en
categorías plegables; se puede buscar por ID/nombre/categoría y filtrar por categoría.
Seleccionar el nombre abre la edición. Es obligatorio escoger una categoría de la
lista: Cervezas, Aguardientes, Rones, Tequilas, Whiskies, Cócteles, Bebidas sin alcohol -
energizantes y Bebidas preparadas mezclas, en ese orden. Las categorías aparecen incluso
vacías y cada una tiene «Agregar producto» con la categoría preseleccionada.
Los productos antiguos con categorías diferentes aparecen en «Por clasificar» hasta
que se editen; no se reclasifican ni se eliminan automáticamente.
En escritorio, al desplegar las categorías se desplaza únicamente la lista de
inventario: el título, los filtros y el panel lateral permanecen visibles. Las tablas
anchas tienen desplazamiento horizontal propio para no ensanchar la página.

En Rones y Aguardientes se exige presentación: Media (375 ml), Botella (750 ml) o Litro
(1000 ml). El contenido se puede ajustar según la etiqueta. Crear un producto por
presentación permite mantener existencias separadas de una misma marca.

Configurar precio por unidad, por shot o ambos. Dejar vacío el precio de una presentación
que no se ofrece; al menos una debe tener precio. Usar valores no negativos, sin puntos
de miles y con hasta dos decimales (por ejemplo, 6500,50). Java y SQLite guardan centavos
enteros y la interfaz conserva la precisión al editar, incluso en importes grandes.

El formulario permite registrar o corregir cantidades restantes enteras no negativas;
la cantidad vendida es de solo lectura. «Agregar existencias» suma unidades nuevas
sobre las disponibles sin modificar lo vendido. Ambos cambios se guardan en SQLite.

La sección «Registrar venta», en el menú lateral, muestra tarjetas pequeñas agrupadas
por categoría y filtros mediante botones. Cada clic agrega una unidad al comprobante situado
a la derecha; se pueden modificar cantidades o quitar productos y el total se actualiza
al instante. El borrador se conserva al cambiar de sección durante la sesión.
Las tarjetas descuentan de las unidades disponibles las que ya están en la cuenta.
Al seleccionar todas, la tarjeta se deshabilita y muestra «Todo en esta cuenta»;
si no quedan existencias, muestra «Agotado». En ambos casos se atenúa y se oculta
el signo de agregar. Quitar unidades de la cuenta o reponer stock vuelve a habilitarla.
Las existencias entre 1 y 14 unidades se muestran en amarillo como alerta de stock
bajo en inventario y en las tarjetas de venta. Con 15 o más unidades se muestran normalmente.
En escritorio, el panel lateral, el título de la sección y el comprobante permanecen
visibles mientras se recorre el catálogo. Si el comprobante contiene muchos productos,
su lista se desplaza por separado y mantiene visibles el total y los botones de venta.
El panel lateral muestra el administrador bajo AppBarPOS, el botón para cerrar sesión
y un pie breve con el crédito del desarrollador.
Al completar una venta, el comprobante se vacía automáticamente y queda listo para
la siguiente, sin pulsar un botón adicional. La venta guardada se puede consultar en
«Ventas guardadas». Para vender no hace falta buscar productos con el teclado.
La confirmación de guardado desaparece a los tres segundos. El comprobante usa un
formato de ticket de papel y ocupa toda la altura disponible junto al catálogo;
el icono de recarga permite actualizar productos o ventas guardadas.
«Completar venta»
calcula el total en el servidor, descuenta existencias y aumenta las cantidades vendidas
en una sola transacción. Cancelar no modifica nada. Se rechazan cantidades fraccionarias,
existencias insuficientes, versiones obsoletas y totales fuera del rango seguro.
Reintentar la misma operación no duplica ventas ni reposiciones. Se conservan el importe,
precios, productos, administrador y saldos antes/después de cada movimiento.
Estas ventas son por presentaciones completas y requieren precio por unidad. La conversión
de shots a ml y las recetas de cócteles siguen pendientes; el precio por shot se conserva.

El recibo exige escoger «Efectivo» o «Transferencia» y permite indicar cuenta «Abierta»
o «Cerrada», además de un nombre opcional de hasta 80 caracteres. «Guardar cuenta abierta»
conserva la cuenta en SQLite y reserva sus unidades sin contarlas como vendidas ni cobradas.
Desde «Cuentas abiertas» se puede retomar, agregar o quitar productos y volver a guardarla.
Los productos ya reservados conservan el precio con el que se agregaron; los productos
nuevos usan el precio actual. No se permite eliminar del inventario un producto reservado.
Al escoger «Cerrada» y completar la venta se cobra la cuenta y se cuentan sus productos
vendidos, sin descontar las reservas otra vez. Descartar cambios de una cuenta retomada
conserva su última versión guardada. El nombre puede quedar vacío tanto al abrir como al cerrar.
«Anular» en la lista de cuentas abiertas, o «Anular cuenta» al retomarla, pide confirmación
y devuelve sus reservas al inventario sin registrar ventas ni modificar las cantidades
vendidas. Se conserva la cuenta, quién la anuló, la fecha y las unidades devueltas.
«Anuladas» muestra las últimas 20 anulaciones. Volver de la confirmación conserva la cuenta;
al confirmar se descartan sus cambios sin guardar y se devuelven solo las reservas guardadas.
Reintentar no devuelve stock dos veces. Las cuentas ya cobradas no se anulan desde esta opción.

Los nombres de productos y de usuario se muestran con la inicial de cada palabra en
mayúscula, por ejemplo «Aguardiente Antioqueño», sin cambiar las credenciales guardadas.

«Ventas guardadas» muestra las últimas 20 ventas en hasta 5 páginas de 4 ventas,
con fecha, productos, cantidades, precios y total. Las ventas conservan los precios y nombres
del momento de la compra aunque después se edite o elimine el producto. En Inventario,
«Editar precio» abre el formulario de edición; al regresar a Registrar venta se actualizan
los precios y existencias del borrador antes de confirmarlo. «Exportar Excel» descarga
un archivo .xlsx con todas las ventas, incluidas las anteriores a las 20 visibles.
Contiene las hojas «Ventas» (una fila por venta con fecha y total) y «Detalle»
(productos, presentaciones, cantidades y precios históricos). La exportación no elimina
registros de SQLite y funciona sin conexión a Internet ni tener Excel instalado.
La hoja «Ventas» incluye método de pago, estado cerrado, nombre opcional y referencia
a la cuenta original. Las cuentas abiertas se consultan por separado y no se suman a ventas
pagadas. Los recibos anteriores sin método de pago muestran «No registrado».

La interfaz no muestra imágenes ni controles de activo/inactivo. Los datos e imágenes
anteriores se conservan para compatibilidad y respaldo. Los cambios guardan quién los
hizo y el estado anterior/nuevo. Las peticiones repetidas no duplican registros;
una edición obsoleta se rechaza y solicita actualizar el inventario.

Cada fila tiene un botón «Eliminar» con confirmación. El producto desaparece del
inventario, incluso al reiniciar; sus datos y el registro de quién lo eliminó se
conservan en la base de datos para mantener el historial. Si quedan existencias,
la confirmación muestra la cantidad. Un producto eliminado no se puede editar ni reactivar.

Para cargar una nueva versión, cerrar la ventana anterior y volver a ejecutar npm start.
Un segundo inicio mientras esté abierta recupera la instancia existente y no sustituye
el código que esa ventana ya cargó.

## Migraciones y verificación

Flyway aplica database/migrations al arrancar y conserva versiones y checksums en
flyway_schema_history. V1 crea app_metadata; V2 añade administrator y administrator_audit;
V3 añade product, sale_presentation y product_operation; V4 añade las cantidades de inventario;
V5 registra la eliminación de productos sin borrar su historial; V6 añade presentaciones,
volúmenes, ventas y movimientos de inventario; V7 añade cuentas abiertas y sus operaciones;
V8 conserva las anulaciones de cuentas y la devolución de sus reservas.
No editar migraciones aplicadas: añadir V9__descripcion.sql, etc. No se utiliza ddl-auto
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
comprueba las ocho categorías obligatorias, presentaciones en ml, reposición, tarjetas,
comprobante lateral y total en vivo, edición de precios, historial, venta de varios
productos, cancelación, persistencia, búsqueda y eliminación, y cierra
sesión y Java. No usar el flag manual sobre datos reales.
También verifica que la ventana nativa pueda mostrarse. Utiliza un perfil Electron
aislado para no reutilizar ni enfocar una instancia real que ya esté abierta.
Resultados y limitaciones: [Fase 3](docs/architecture/fase-3.md).

## Instalador y siguientes etapas

Electron Builder está configurado para NSIS Windows x64, con conservación de datos.
El empaquetado falla explícitamente si faltan el runtime Java, el JAR o el frontend.
Ver [preparación del instalador](installer/README.md).

Las siguientes etapas incluyen jornadas, caja, recetas, mermas y venta por shots con
descuento de volumen. Antes deben resolverse las reglas de conversión y los tamaños
de cada shot. Se mantienen los requisitos de la
[propuesta inicial](docs/architecture/propuesta-inicial.md), con las aclaraciones de cada fase.
