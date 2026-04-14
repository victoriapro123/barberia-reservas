export const BRAND_CONFIG = {
  name: "Jardín Flor de Loto",
  heroLabel: "Día de la Madre",
  heroTitle: "Jardín Flor de Loto",
  heroSubtitle: "Packs naturales, delicados y listos para regalar en el Día de la Madre.",
  bookingTitle: "Promoción Día de la Madre",
  bookingSubtitle: "Elige un pack, personalízalo y envía tu pedido en pocos pasos.",
  contactEmail: "victoriap.rodriguezs@gmail.com",
  heroImageUrl: "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=1400&q=85",
  faviconPath: "/favicon.svg",
  mapAddressText: "Av. Miraflores 1702, Peñaflor, Región Metropolitana",
  mapAddressLines: ["Av. Miraflores 1702", "Peñaflor, Región Metropolitana"],
  locationTitle: "Dónde estamos",
  locationCopy: "Si quieres ubicar el vivero antes de comprar, aquí tienes la dirección y el acceso directo al mapa.",
  directionsLabel: "Cómo llegar",
  adminTitle: "Panel de pedidos",
  adminDescription: "Gestión privada de pedidos de Jardín Flor de Loto.",
  // Si cambias estos correos, recuerda reflejar lo mismo en firestore.rules y volver a desplegar reglas.
  adminEmails: ["victoriap.rodriguezs@gmail.com"]
};

export function buildGoogleMapsSearchUrl(addressText = BRAND_CONFIG.mapAddressText) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`;
}

export function buildGoogleMapsEmbedUrl(addressText = BRAND_CONFIG.mapAddressText) {
  return `https://www.google.com/maps?q=${encodeURIComponent(addressText)}&output=embed`;
}
