# Seguridad

Esta version cambia el flujo publico a solicitudes de reserva y reduce el riesgo de exponer datos personales en Firestore.

## Cambios aplicados en la app publica

- La web ya no muestra ni descarga reservas de otros clientes.
- La web ya no permite cancelar reservas publicamente.
- La web registra solicitudes en `solicitudes_reserva` en lugar de leer `reservas` desde el navegador.
- Se agregaron validaciones basicas de nombre, correo, telefono y servicio.
- Se agrego una espera minima entre intentos de reserva desde el mismo navegador.
- Se prepararon reglas `create-only` en [firestore.rules](./firestore.rules).

## Riesgos que siguen dependiendo del backend

- Si no despliegas [firestore.rules](./firestore.rules), Firestore seguira con la configuracion anterior.
- EmailJS sigue ejecutandose desde el cliente. Si detectas abuso, conviene mover el envio de correos a una funcion serverless.

## Recomendaciones inmediatas

1. Despliega [firestore.rules](./firestore.rules) con `firebase deploy --only firestore:rules`.
2. No vuelvas a permitir lecturas publicas sobre documentos que contengan nombre, correo o telefono.
3. Si mas adelante quieres disponibilidad en tiempo real, separa datos publicos y privados en colecciones distintas con logica server-side.
4. Activa App Check en Firebase para reducir abuso automatizado.
