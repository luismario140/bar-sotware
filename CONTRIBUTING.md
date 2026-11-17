# Ramas y cambios

- `main`: versión estable, con los cambios revisados y probados.
- `develop`: integración de las funciones en desarrollo.
- `feature/nombre-de-funcion`: una función nueva o un experimento concreto.
- `fix/nombre-del-problema`: una corrección concreta.

## Empezar una función

Con el árbol de trabajo limpio:

```powershell
git switch develop
git pull --ff-only origin develop
git switch -c feature/nombre-de-funcion
```

Guardar cada parte funcional en un commit con un mensaje claro. Incluir sus pruebas
y migraciones cuando correspondan. Evitar mezclar una función con cambios ajenos.

## Probar y compartir

Ejecutar las verificaciones correspondientes del [README](README.md): pruebas del
backend, pruebas y compilación del frontend, revisión de escritorio y prueba integrada
cuando el cambio afecte al flujo de la aplicación. Las pruebas integradas deben usar
los datos temporales que prepara `npm run smoke`.

```powershell
git push -u origin feature/nombre-de-funcion
```

Abrir un pull request hacia `develop`, explicando qué cambió y cómo se verificó.
Cuando las funciones integradas estén probadas, abrir un pull request de `develop`
hacia `main`. No integrar un experimento que falle sus comprobaciones.

Las ramas comparten la ubicación habitual de los datos si se inicia la aplicación
sin configuración adicional. Para probar cambios usar `APPBARPOS_DATA_DIR` con una
carpeta de desarrollo independiente, como explica
[INSTRUCCIONES_DESARROLLO.txt](INSTRUCCIONES_DESARROLLO.txt). No editar migraciones ya
aplicadas: crear una migración nueva.
