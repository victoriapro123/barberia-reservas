# Barberia Reservas

Sitio web estatico para gestionar solicitudes de reserva de una barberia. La app se sirve directamente desde `index.html`, usa Firestore para registrar solicitudes privadas y EmailJS para avisar a la barberia.

## Estructura

- `index.html`: interfaz principal y logica de solicitudes
- `styles.css`: estilos antiguos del proyecto
- `script.js`: script antiguo del proyecto
- `barbero.jpg`: imagen local del proyecto
- `firestore.rules`: reglas de Firestore para aceptar solo solicitudes nuevas
- `firebase.json`: configuracion de despliegue de reglas
- `.firebaserc`: proyecto de Firebase por defecto

## Despliegue en Vercel

Este proyecto puede desplegarse como sitio estatico sin proceso de build.

### Opcion 1: desde GitHub

1. Sube este repositorio a GitHub.
2. En Vercel, usa `Add New -> Project`.
3. Importa el repositorio `barberia-reservas`.
4. Vercel detectara automaticamente que es un sitio estatico.
5. Publica con la configuracion por defecto.

### Opcion 2: con CLI

1. Instala la CLI: `npm install -g vercel`
2. Inicia sesion: `vercel login`
3. Desde la carpeta del proyecto ejecuta: `vercel`
4. Para produccion ejecuta: `vercel --prod`

## Nota tecnica

Las claves de Firebase y EmailJS estan embebidas en el cliente y quedaran visibles en el navegador. Eso puede ser aceptable para claves publicas de Firebase, pero conviene revisar permisos de Firestore y configuracion de EmailJS antes de publicar en produccion.

## Firebase

Esta version usa la coleccion `solicitudes_reserva` y ya no hace lecturas publicas de Firestore desde el navegador.

Para aplicar las reglas:

1. Instala la CLI: `npm install -g firebase-tools`
2. Inicia sesion: `firebase login`
3. Desde esta carpeta ejecuta: `firebase deploy --only firestore:rules`

## Panel admin

La gestion privada de solicitudes esta en `admin.html`.

Para usarla:

1. En Firebase Console activa `Authentication -> Sign-in method -> Email/Password`.
2. Crea el usuario administrador con el correo `victoriap.rodriguezs@gmail.com`.
3. Abre `/admin` en tu proyecto de Vercel.
4. Inicia sesion y cambia el estado de las solicitudes a `confirmada` o `cancelada`.

Incluye:

- buscador por nombre, correo, telefono, servicio u hora
- filtro por estado
- filtro por dia
- notas internas por solicitud
- correo automatico al cliente cuando confirmas o cancelas

Las reglas de Firestore solo permiten leer y actualizar solicitudes desde esa cuenta admin.

## Variables de entorno

Para que la funcion serverless de Vercel envie correos, configura estas variables en el proyecto:

- `EMAILJS_SERVICE_ID`
- `EMAILJS_TEMPLATE_ID`
- `EMAILJS_PASSWORD_RESET_TEMPLATE_ID` opcional, para usar una plantilla dedicada al reset
- `EMAILJS_PUBLIC_KEY`
- `EMAILJS_PRIVATE_KEY`
- `BARBER_EMAIL`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_AUTH_DOMAIN`
- `PASSWORD_RESET_CONTINUE_URL`

Puedes usar [.env.example](./.env.example) como referencia. En Vercel se cargan desde `Settings -> Environment Variables`.

## Verificacion

Repositorio conectado a GitHub y preparado para despliegues automaticos en Vercel desde la rama `main`.

## Seguridad

Antes de usar la app con clientes reales, revisa las notas de [SECURITY.md](./SECURITY.md).
