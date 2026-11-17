export function SecurityGuidelines() {
  return <aside className="security-guidelines" aria-labelledby="security-guidelines-title">
    <p className="eyebrow">CUIDA EL ACCESO A TU BAR</p>
    <h2 id="security-guidelines-title">Reglas de uso seguro</h2>
    <p>Buenas prácticas para el administrador de este equipo.</p>
    <ol>
      <li><strong>Un acceso personal.</strong><span>No compartas tu usuario ni tu PIN con otras personas.</span></li>
      <li><strong>Conserva acceso a tu correo.</strong><span>Comprueba que esté bien escrito, protege esa cuenta con verificación en dos pasos y actualízala aquí si cambia. Allí recibirás los códigos para restablecer tu PIN; nunca los compartas.</span></li>
      <li><strong>Elige bien tus 4 dígitos.</strong><span>Evita secuencias, números repetidos y fechas fáciles de adivinar.</span></li>
      <li><strong>Cierra tu sesión.</strong><span>Usa «Cerrar sesión» cuando termines o dejes el puesto sin supervisión.</span></li>
      <li><strong>Protege este equipo.</strong><span>Bloquea Windows al alejarte y conserva una copia de seguridad de tus datos en un lugar seguro.</span></li>
    </ol>
    <div className="security-notice"><strong>Conserva una copia fuera del equipo</strong><p>Crea un respaldo al terminar la jornada y usa «Guardar copia…» para llevarlo a una USB o a otra ubicación segura. Las copias automáticas previas a una actualización no sustituyen ese hábito.</p><p>Restaura solo archivos de confianza. Al restaurar vuelves al estado del respaldo, incluidos el usuario y el PIN de ese momento.</p></div>
    <div className="security-notice"><strong>Sobre tu acceso</strong><p>El PIN se almacena como un hash, no como texto visible. Los intentos fallidos repetidos activan un bloqueo temporal. Cambiar las credenciales cierra la sesión.</p><p>Si lo olvidas, usa «Recuperar acceso» en el login. El código del correo vence en 10 minutos y solo sirve una vez. Necesitas internet y el envío de correo configurado en este equipo. No existe un PIN maestro.</p></div>
  </aside>
}
