# Recuperación de acceso por correo

Al crear el administrador se requiere un correo de recuperación. Los administradores
existentes pueden registrarlo en **Acceso y seguridad**, confirmando su PIN actual.
Cambiar ese correo también exige el PIN y cierra las sesiones abiertas.

Desde el login, **¿Olvidaste tu PIN? Recuperar acceso** permite solicitar un código
de 8 dígitos y elegir un nuevo PIN de 4 dígitos. El correo incluye el usuario por si
también se olvidó. El PIN anterior no se puede consultar: solo se almacena su hash.

Los códigos vencen en 10 minutos, permiten 5 intentos y se invalidan al usarlos,
generar otro o cambiar las credenciales. Se almacenan como hash. Hay un mínimo de
60 segundos entre solicitudes y un máximo de 5 solicitudes por hora; ambos límites
se conservan al reiniciar. La solicitud devuelve el mismo resultado para un correo
registrado o desconocido. El envío se procesa en segundo plano.

El correo de recuperación pertenece al administrador; la cuenta **emisora** es una
cuenta Gmail configurada por quien instala el programa. Pueden ser cuentas distintas.
Las ventas e inventario funcionan sin internet; el envío del correo requiere conexión.

## Configurar Gmail en el equipo

La configuración predeterminada usa `smtp.gmail.com`, puerto `587` y STARTTLS
obligatorio. Se utiliza Spring Boot Mail con tiempos de espera limitados.

1. Activa la verificación en dos pasos de la cuenta Gmail emisora.
2. Si la cuenta lo permite, crea una **contraseña de aplicación** para AppBarPOS.
   No uses la contraseña habitual de Gmail. Algunas cuentas de organizaciones o con
   políticas especiales no ofrecen esta opción; consulta con su administrador.
3. Configura las variables siguientes en el entorno del proceso que inicia AppBarPOS:

| Variable | Valor |
| --- | --- |
| `APPBARPOS_SMTP_USERNAME` | Correo completo de la cuenta emisora |
| `APPBARPOS_SMTP_PASSWORD` | Contraseña de aplicación de Gmail |
| `APPBARPOS_SMTP_FROM` | Opcional; por defecto, la cuenta emisora |
| `APPBARPOS_SMTP_HOST` | Opcional; por defecto, `smtp.gmail.com` |
| `APPBARPOS_SMTP_PORT` | Opcional; por defecto, `587` |

Ejemplo para una sesión de desarrollo de PowerShell, sin escribir la contraseña en
el historial ni mostrarla en consola, ejecutado desde la raíz del repositorio:

```powershell
$env:APPBARPOS_SMTP_USERNAME = Read-Host 'Correo Gmail emisor'
$mailSecret = Read-Host 'Contraseña de aplicación de Gmail' -AsSecureString
$mailCredential = [System.Net.NetworkCredential]::new('', $mailSecret)
try {
    $env:APPBARPOS_SMTP_PASSWORD = $mailCredential.Password
    Push-Location desktop
    try { npm start } finally { Pop-Location }
} finally {
    Remove-Item Env:APPBARPOS_SMTP_PASSWORD -ErrorAction SilentlyContinue
    $mailCredential = $null
    $mailSecret.Dispose()
}
```

En una instalación, el ejecutable debe heredar estas variables de su lanzador.
No guardes contraseñas en el repositorio, en capturas ni en el chat. Reinicia la
aplicación después de cambiar la configuración.

Si falta la configuración se muestra un mensaje claro en el formulario. Si un
servidor rechaza un envío en segundo plano, se invalida ese código y se registra un
aviso sin direcciones, códigos ni contraseñas en `logs/backend.log`. Revisa conexión,
configuración y spam antes de solicitar otro código. La aplicación no certifica que
el mensaje haya llegado a la bandeja del destinatario.

## Validación

Las pruebas utilizan cuentas ficticias y correo simulado. `npm run smoke` sustituye
la configuración externa por un servidor SMTP local que nunca reenvía mensajes y
comprueba el cambio de PIN completo desde la interfaz. Para probar Gmail realmente hay que configurar la
cuenta emisora en el equipo y usar una dirección de recuperación controlada por el
administrador.

Referencias: [Spring Boot Mail](https://docs.spring.io/spring-boot/reference/io/email.html),
[SMTP de Gmail](https://developers.google.com/workspace/gmail/imap/imap-smtp),
[contraseñas de aplicación de Google](https://support.google.com/mail/answer/185833?hl=es),
[recuperación de contraseñas según OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
