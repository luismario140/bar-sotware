# Migraciones y persistencia

La fuente SQL es database/migrations. Maven incorpora sus archivos *.sql en
classpath:db/migration del JAR; la aplicación instalada no depende del repositorio.
Flyway Core mantiene versiones y checksums; se configura explícitamente con SQLite,
validación de checksums habilitada y limpieza deshabilitada. V1 crea app_metadata; V2 añade la identidad única
del administrador y su auditoría. V3 crea product, sale_presentation y product_operation.
No se precargan credenciales ni productos. Las migraciones V1/V2 permanecen intactas.

## Evolución

1. Crear V<número>__descripcion.sql. No modificar una migración aplicada.
2. Probar desde base vacía y copia de la versión anterior; comprobar conservación de datos.
3. Revisar restricciones e índices. Las limitaciones de ALTER TABLE de SQLite pueden
   requerir reconstrucción de tablas, que deberá documentarse en cada cambio.
4. Antes de modificar datos reales, generar un respaldo consistente de base e imágenes.
5. Ante checksum incorrecto o migración fallida, detener el inicio. No ejecutar repair,
   clean ni eliminar la base automáticamente.

Las migraciones no crean usuarios o credenciales. El primer uso crea el administrador
elegido por el propietario y almacena solo un hash del PIN con sal y prefijo de algoritmo.

## Actualizaciones y recuperación pendientes

El directorio persistente es %LOCALAPPDATA%/BarSoftware por usuario Windows, separado
de la instalación. Desde Fase 2, si hay migraciones pendientes y tablas existentes,
se ejecuta VACUUM INTO antes de migrar. Se valida quick_check y se genera un ZIP con
data/bar.db, los archivos de media y manifest.properties con SHA-256 de cada entrada.
El archivo .zip solo se publica al finalizar; los .part no son respaldos completos.
Un error al generar el respaldo impide el arranque antes de ejecutar las migraciones.
No se recorren enlaces simbólicos en los medios y no se borran respaldos anteriores.
No se produce una copia adicional si el esquema ya está actualizado.

La prueba extrae el snapshot y comprueba integridad y conservación de datos de V1,
además de los medios y el checksum. Otra prueba impide escribir el respaldo y verifica
que V2 no se aplica. Flyway no ignora versiones futuras desconocidas.
También se comprueba el paso de V2 a V3: conserva la identidad y hash del administrador,
los medios existentes y produce un catálogo vacío con respaldo previo.

## Catálogo

Las presentaciones UNIT/SHOT conservan sus UUID al editar precios y se desactivan al
retirarlas del producto. No se define aún consumo ni unidad base de inventario. El precio
es INTEGER en centavos COP, limitado a enteros representables exactamente en el frontend.
Las escrituras verifican versión y guardan una operación inmutable con hash de petición
y resultado. La misma clave UUID no puede utilizarse para contenidos diferentes.

Las imágenes son archivos PNG administrados por UUID, sin rutas originales de USB.
Se escribe el archivo antes de confirmar la referencia; un rollback elimina únicamente
la imagen nueva no referenciada. Si no se puede determinar el estado del commit, se
conserva el archivo. Las imágenes anteriores no se borran automáticamente y siguen
incluidas en los respaldos completos.

Todavía están pendientes la interfaz de respaldo/restauración manual, su validación
completa, selección de destino externo, retención y automatización al cierre de jornada.
No presentar el respaldo previo a migrar como recuperación de PIN: restablecer el
acceso por correo sigue requiriendo el servicio externo verificado pendiente.

Fuentes: [Flyway](https://documentation.red-gate.com/flyway),
[claves foráneas SQLite](https://www.sqlite.org/foreignkeys.html) y
[backup SQLite](https://www.sqlite.org/backup.html).
