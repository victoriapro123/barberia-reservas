export const BRAND_CONFIG = {
  name: "Jardin Flor de Loto",
  heroLabel: "Dia de la Madre",
  heroTitle: "Jardin Flor de Loto",
  heroSubtitle: "Packs naturales, delicados y listos para regalar en el Dia de la Madre.",
  bookingTitle: "Promocion Dia de la Madre",
  bookingSubtitle: "Elige un pack, personalizalo y envia tu pedido en pocos pasos.",
  contactEmail: "victoriap.rodriguezs@gmail.com",
  heroImageUrl: "/assets/flor-de-loto-portada.png",
  faviconPath: "/assets/flor-de-loto-portada.png",
  mapAddressText: "Av. Miraflores 1702, Penaflor, Region Metropolitana",
  mapAddressLines: ["Av. Miraflores 1702", "Penaflor, Region Metropolitana"],
  locationTitle: "Donde estamos",
  locationCopy: "Si quieres ubicar el vivero antes de comprar, aqui tienes la direccion y el acceso directo al mapa.",
  directionsLabel: "Como llegar",
  adminTitle: "Panel de pedidos",
  adminDescription: "Gestion privada de pedidos de Jardin Flor de Loto.",
  orderNotificationEmails: ["victoriap.rodriguezs@gmail.com", "veronicae.silvap@gmail.com"],
  // Si cambias estos correos, recuerda reflejar lo mismo en firestore.rules y volver a desplegar reglas.
  adminEmails: ["victoriap.rodriguezs@gmail.com"]
};

export function buildGoogleMapsSearchUrl(addressText = BRAND_CONFIG.mapAddressText) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`;
}

export function buildGoogleMapsEmbedUrl(addressText = BRAND_CONFIG.mapAddressText) {
  return `https://www.google.com/maps?q=${encodeURIComponent(addressText)}&output=embed`;
}
