# Respaldos y restauración

En **Acceso y seguridad**, el formulario de usuario, PIN y correo se abre desde
**Cambiar datos de acceso**. La misma pantalla permite administrar los respaldos.

## Crear y guardar copias

- **Crear respaldo ahora** genera un ZIP consistente de la base y las imágenes:
  incluye inventario, ventas, cuentas, datos de acceso e historial.
- **Guardar copia…** permite elegir una USB u otra ubicación.
- **Abrir carpeta de respaldos** muestra la carpeta local en el explorador.
- La lista muestra fecha, hora local, tamaño y origen; inicialmente enseña los
  últimos cinco y permite desplegar el resto.

La ubicación predeterminada es `%LOCALAPPDATA%\BarSoftware\backups`; con
`APPBARPOS_DATA_DIR` se utiliza su subcarpeta `backups`. El footer se actualiza al
crear una copia, al enfocar la ventana y cada minuto.

Los nombres distinguen copias manuales (`manual-…zip`), previas a actualizar
(`pre-migration-…zip`) y previas a restaurar (`pre-restore-…zip`). Los `.part` no
se muestran como copias completas. No se eliminan respaldos anteriores.

Las copias automáticas se crean antes de migrar una base existente, no después de
cada venta ni diariamente. Crea una copia al terminar la jornada y conserva otra
fuera del computador. Los ZIP no están cifrados: restringe el acceso a estos
archivos, que contienen información del negocio y credenciales protegidas por hash.

## Restaurar

1. Pulsa **Restaurar desde un ZIP** y selecciona un respaldo propio de confianza.
2. Se comprueban formato, rutas, hashes SHA-256, integridad de SQLite, imágenes y
   compatibilidad de migraciones antes de reemplazar los datos.
3. Revisa la fecha, introduce el PIN actual y pulsa **Restaurar y reiniciar**.
4. Se crea una copia del estado actual. Si falla, no se activa la restauración.
5. Se detiene el servicio, se recuperan juntos base e imágenes y se vuelve al login.

Se usan el usuario y PIN que existían en el respaldo. Los movimientos posteriores
no aparecen en el estado restaurado; el estado anterior queda en `pre-restore`.
Se invalidan los códigos de recuperación del PIN incluidos y las sesiones anteriores.
La configuración de Gmail del entorno no forma parte del ZIP.

Las versiones anteriores compatibles se actualizan al reiniciar. Se rechazan
versiones futuras y migraciones alteradas. Se admiten ZIP de hasta 512 MB, con
hasta 2 GB descomprimidos y 20 000 entradas. La revisión vence en 15 minutos.

## Protección ante fallos

Se bloquean las operaciones del negocio al preparar la restauración y se impide
cerrar la ventana durante el reemplazo. Se conservan los directorios originales en
`backups/.previous-…` y se registra la operación antes de moverlos. Si el nuevo
servicio no inicia, se recupera el estado anterior. Una interrupción se comprueba
antes del siguiente arranque. Las carpetas técnicas `.previous-…` e `.interrupted-…`
se conservan; no deben borrarse durante una operación pendiente.

No se mezclan archivos WAL/SHM anteriores con la base restaurada. El ZIP utiliza
una instantánea consistente. Estas funciones requieren la aplicación de escritorio,
sesión válida y, para restaurar, el PIN actual.

## Verificación

Las pruebas cubren ZIP modificados, imágenes ausentes, rutas que intentan salir
del ZIP, versiones incompatibles, reversión e interrupciones. `npm run smoke`
utiliza datos temporales y diálogos simulados para comprobar creación, exportación,
cancelación, PIN y restauración con reinicio real del servicio. No modifica los
datos habituales del administrador.

Referencias: [VACUUM INTO](https://www.sqlite.org/lang_vacuum.html),
[WAL de SQLite](https://www.sqlite.org/wal.html) y
[diálogos de Electron](https://www.electronjs.org/docs/latest/api/dialog).
