# Seguridad

Esta version reduce el riesgo en la interfaz publica, pero no reemplaza una configuracion segura de Firebase.

## Cambios aplicados en la app publica

- La web ya no muestra nombres, correos ni telefonos de otras reservas.
- La web ya no permite cancelar reservas publicamente.
- Se agregaron validaciones basicas de nombre, correo, telefono y servicio.
- Se agrego una espera minima entre intentos de reserva desde el mismo navegador.

## Riesgos que siguen dependiendo del backend

- Si las reglas de Firestore permiten lecturas o escrituras abiertas, cualquier persona podria consultar o modificar datos fuera de la interfaz.
- EmailJS sigue ejecutandose desde el cliente. Si detectas abuso, conviene mover el envio de correos a una funcion serverless.

## Recomendaciones inmediatas

1. Revisa y endurece las reglas de Firestore antes de usar la app con clientes reales.
2. No expongas informacion personal en documentos que tambien necesiten lectura publica.
3. Separa disponibilidad publica y datos privados en colecciones distintas si quieres mantener consulta publica de horarios.
4. Activa App Check en Firebase para reducir abuso automatizado.
