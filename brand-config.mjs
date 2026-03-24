export const BRAND_CONFIG = {
  name: "Barber Elite",
  heroLabel: "Reservas online",
  heroTitle: "Barber Elite",
  heroSubtitle: "Solicita tu hora con una fecha real, visualiza tu semana o tu mes y recibe la respuesta de la barbería.",
  bookingTitle: "Agenda tu visita",
  bookingSubtitle: "Crea tu perfil o inicia sesión, elige una fecha del calendario y solicita tu hora. La barbería revisa cada solicitud antes de gestionarla.",
  contactEmail: "victoriap.rodriguezs@gmail.com",
  heroImageUrl: "https://images.unsplash.com/photo-1622287162716-f311baa1a2b8?auto=format&fit=crop&w=1400&q=80",
  faviconPath: "/favicon.svg",
  mapAddressText: "Av. Miraflores 1702, Peñaflor, Región Metropolitana",
  mapAddressLines: ["Av. Miraflores 1702", "Peñaflor, Región Metropolitana"],
  locationTitle: "Dónde estamos",
  locationCopy: "Si quieres ubicar el local antes de reservar, aquí tienes la dirección y el acceso directo al mapa.",
  directionsLabel: "Cómo llegar",
  adminTitle: "Panel de reservas",
  adminDescription: "Gestión privada de reservas de Barber Elite.",
  // Si cambias estos correos, recuerda reflejar lo mismo en firestore.rules y volver a desplegar reglas.
  adminEmails: ["victoriap.rodriguezs@gmail.com"]
};

export function buildGoogleMapsSearchUrl(addressText = BRAND_CONFIG.mapAddressText) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`;
}

export function buildGoogleMapsEmbedUrl(addressText = BRAND_CONFIG.mapAddressText) {
  return `https://www.google.com/maps?q=${encodeURIComponent(addressText)}&output=embed`;
}
