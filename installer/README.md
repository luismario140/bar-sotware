# Preparación del instalador

Electron Builder está configurado para NSIS Windows x64. La configuración vive en
electron-builder.yml. deleteAppDataOnUninstall=false y la ruta externa de datos
preservan el directorio del negocio; esto debe verificarse en Windows limpio en la
fase de instalador. No hay hooks que borren o muevan la base.

Desde desktop/:

```powershell
npm run pack:win
npm run dist:win
```

El primero prepara una carpeta de aplicación; el segundo genera NSIS. Ambos requieren
frontend/dist y backend/target/appbarpos-backend-runtime.jar, más un runtime Java completo
Windows x64 en installer/runtime (excluido de Git). El paquete utilizará
resources/runtime/bin/java.exe y no el Java del sistema.

desktop/scripts/verify-resources.cjs impide empaquetar si faltan componentes. El hook
reside dentro de desktop porque Electron Builder exige que esté en su raíz de trabajo.
En Fase 1 no se incorpora
el runtime y no se entrega un instalador distribuible.

Pendientes antes de distribuir:

- Elegir distribución y versión de Java, revisar redistribución, licencia y avisos.
- Automatizar preparación del runtime y verificar hash y arquitectura.
- Si se reduce con jlink, comprobar módulos de Java y compatibilidad de SQLite.
  El procesamiento de imágenes del catálogo requiere java.desktop, además de las
  dependencias del backend. El JAR se instala como resources/backend/appbarpos-backend.jar.
- Probar en Windows 10/11 x64 sin Java, Node ni internet, instalando desde USB.
- Verificar actualización, reinstalación, desinstalación y conservación de datos.
- Decidir firma, iconos y política de versiones; implementar respaldos previos.

La construcción puede descargar herramientas; la instalación y ejecución final serán
offline. No se configura un actualizador online en esta fase.
