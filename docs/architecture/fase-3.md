# Fase 3 — Catálogo propio de productos e imágenes

## Diseño previo

La instrucción de continuar autoriza el catálogo recomendado tras Fase 2. Se conservan
administrador único y autenticación local, COP inicial y operación offline. No se
desarrollan ventas, inventario, jornadas, caja ni facturación.

- Producto: identidad UUID estable, nombre, categoría libre opcional, estado, versión
  y referencia opcional a imagen administrada. El catálogo comienza vacío.
- Presentaciones: unidad y/o shot, con precios independientes. Al menos una debe tener
  precio. Se admiten importes no negativos con hasta dos decimales; se guardan como
  enteros en centavos COP. No se define todavía consumo ni unidad base de inventario.
- Editar no borra productos ni presentaciones: una presentación retirada se desactiva.
  Desactivar/reactivar un producto requiere confirmación y conserva sus datos.
- Cada escritura registra administrador, antes/después y clave de petición UUID.
  Reintentos con la misma clave y contenido devuelven el resultado anterior. Una clave
  con contenido diferente o una versión desactualizada se rechaza sin sobrescribir.
- Imágenes opcionales PNG/JPEG de hasta 5 MiB; se inspecciona contenido y dimensiones
  antes de decodificar (máximo 4096 por lado y 10 millones de píxeles). Se normalizan
  a PNG de hasta 1024 por lado, sin metadatos, en media/productos con nombre UUID.
- Nunca se conserva la ruta del archivo original. Reemplazar publica el nuevo archivo
  antes de cambiar su referencia; un rollback elimina solo el archivo nuevo. Se mantienen
  imágenes anteriores para auditoría y respaldos, sin limpieza automática en esta fase.
- El listado y las imágenes requieren sesión y canal local. El puente Electron expone
  operaciones de catálogo, no rutas o comandos arbitrarios del sistema de archivos.
- La migración V3 añade productos, presentaciones y auditoría idempotente. Se conserva
  el respaldo consistente previo a actualizar bases existentes implementado en Fase 2.

Interfaz: entrada «Productos» en navegación lateral; búsqueda y filtros de estado y
categoría, tarjetas con imagen/precio, formulario modal y confirmación de estado.
Los productos sin imagen muestran un marcador. El guardado conserva los datos del
formulario ante errores y permite reintentar sin crear duplicados.

Pendientes de inventario: volumen del shot, botellas selladas/abiertas, mermas, momento
de descuento y política de stock. No se muestran existencias inventadas.

La validación de imágenes utiliza [ImageReader](https://docs.oracle.com/en/java/javase/21/docs/api/java.desktop/javax/imageio/ImageReader.html)
y [ImageIO](https://docs.oracle.com/en/java/javase/21/docs/api/java.desktop/javax/imageio/ImageIO.html)
del JDK; el futuro runtime reducido deberá incluir java.desktop para este procesamiento.

## API y consistencia

Las rutas requieren token de canal y sesión administrativa:

| Ruta | Operación |
| --- | --- |
| GET /api/products | Lista productos, estados, precios e identificador de imagen |
| POST /api/products | Crea producto con clave UUID de operación |
| PUT /api/products/{id} | Actualiza con clave de operación y versión esperada |
| POST /api/products/{id}/status | Activa/desactiva con clave y versión |
| GET /api/products/{id}/image | Devuelve PNG administrado, con no-store y nosniff |

Los precios de entrada son cadenas decimales, sin separadores de miles, con punto o
coma decimal. La respuesta contiene centavos enteros. El límite técnico es el entero
máximo representable exactamente en JSON/JavaScript (9007199254740991 centavos).
El editor y la presentación monetaria usan BigInt para no perder centavos al convertir.

Los cambios de fila verifican versión en SQL, además del servicio transaccional.
La auditoría y el resultado de reintento se confirman junto con el producto y sus
presentaciones. Una clave repetida no vuelve a escribir imágenes ni cambios de catálogo.
Si falla la auditoría se revierte la edición. Se conserva una imagen si no se puede
determinar el resultado del commit, evitando borrar un archivo posiblemente referenciado.

Los archivos PNG anteriores se mantienen; la limpieza y retención se diseñarán antes
de eliminarlos. Las fotos no son datos remotos y no requieren conexión para mostrarse.

## Verificación y problemas encontrados

- Maven verify: 17 pruebas aprobadas, sin errores ni fallos; incluye pruebas anteriores
  y catálogo HTTP/servicio, así como conservación de administrador y medios de V2 a V3.
- Precios exactos, cero y presentación ausente diferenciados; rechazos de importes
  inválidos; idempotencia con resultado original y rechazo de versiones obsoletas.
- Alta, edición y estado con identidad estable, presentación retirada sin borrado,
  historial inmutable y rollback ante fallo de auditoría.
- PNG normalizado, imagen disponible tras eliminar el original, reemplazo inválido
  que conserva la imagen anterior, rollback que limpia solo el nuevo archivo y rechazo
  de contenido SVG, base64 inválido, dimensiones excesivas y rutas de archivo arbitrarias.
- API e imágenes inaccesibles sin sesión. PNG con Content-Type y nosniff correctos.
- npm test en frontend: 2 pruebas de edición y visualización monetaria exacta, incluidas
  cantidades próximas al máximo seguro. TypeScript/Vite compilan sin añadir bibliotecas.
- Recorrido de formularios y puente Electron: crear con imagen mediante File, editar,
  confirmar desactivación/reactivación y buscar; también se conserva el recorrido de
  acceso y la comprobación de ventana visible. Datos de prueba exclusivamente temporales.
- Reinicio real de Java sobre la base creada por el recorrido Electron: conserva
  identidad del producto, precios editados, estado e imagen. Después de logout la
  imagen vuelve a estar protegida. Resultado CATALOG_PROCESS_RESTART_OK.
- Resultado final del escritorio: APPBARPOS_CATALOG_SMOKE=create,image,edit,status,search:OK,
  APPBARPOS_AUTH_SMOKE=setup,credentials,relogin,logout:OK, visibilidad y render correctos.

Se detectó que el driver SQLite no devuelve Long nullable mediante getObject(Long.class)
de forma uniforme. Se sustituyó por getLong/wasNull y las pruebas comprueban ambas
presentaciones, sus ausencias y el importe cero.

La instancia anterior de la aplicación mantenía bloqueado el JAR en Windows. El artefacto
actual se genera como backend/target/appbarpos-backend-runtime.jar y Electron de desarrollo
ejecuta una copia temporal privada, liberada al terminar Java. El instalador conserva
su ruta interna resources/backend/appbarpos-backend.jar. No se cerró la ventana del
propietario ni se alteraron sus credenciales para compilar o ejecutar las pruebas.

Para cargar la nueva versión, cerrar la ventana anterior y volver a ejecutar npm start
desde desktop. La base existente se respalda y migra automáticamente antes de abrirse.

Sin cambios en las versiones de dependencias de Fase 2. La recuperación por correo,
la interfaz de restauración y el instalador distribuible siguen pendientes.
