# Barberia Reservas

Sitio web estatico para gestionar reservas de una barberia. La app se sirve directamente desde `index.html` y usa Firebase Firestore y EmailJS desde el cliente.

## Estructura

- `index.html`: interfaz principal y logica de reservas
- `styles.css`: estilos antiguos del proyecto
- `script.js`: script antiguo del proyecto
- `barbero.jpg`: imagen local del proyecto

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

## Verificacion

Repositorio conectado a GitHub y preparado para despliegues automaticos en Vercel desde la rama `main`.
