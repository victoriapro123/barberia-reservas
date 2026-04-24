import { createPrivateKey, createSign } from "node:crypto";
import { BRAND_CONFIG } from "../brand-config.mjs";

const EMAILJS_URL = "https://api.emailjs.com/api/v1.0/email/send";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIRESTORE_API_BASE = "https://firestore.googleapis.com/v1/projects";

const VALID_NOTIFICATION_TYPES = ["new_request", "customer_received", "customer_status"];
const VALID_STATUS_VALUES = ["Pendiente", "Confirmada", "Cancelada", "Completada"];

function normalizeStatusValue(value) {
  if (typeof value !== "string") return "Pendiente";

  const normalized = value.trim().toLowerCase();

  if (normalized === "pendiente") return "Pendiente";
  if (normalized === "confirmada") return "Confirmada";
  if (normalized === "cancelada") return "Cancelada";
  if (normalized === "completada") return "Completada";
  if (normalized === "cliente listo") return "Completada";

  return value.trim();
}

function isSizedString(value, min, max) {
  return typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
}

function isValidEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value) {
  return typeof value === "string" && /^[+\d\s()-]{8,20}$/.test(value);
}

function normalizeOrderDetails(order) {
  if (!order || typeof order !== "object") return null;

  return {
    tipo: "pedido_vivero",
    pack: typeof order.pack === "string" ? order.pack.trim() : "",
    planta: typeof order.planta === "string" ? order.planta.trim() : "",
    macetero: typeof order.macetero === "string" ? order.macetero.trim() : "",
    globo: typeof order.globo === "string" ? order.globo.trim() : "",
    delivery: Boolean(order.delivery),
    deliveryExtra: Number.isFinite(Number(order.deliveryExtra)) ? Number(order.deliveryExtra) : 0,
    total: Number.isFinite(Number(order.total)) ? Number(order.total) : 0,
    direccion: typeof order.direccion === "string" ? order.direccion.trim() : "",
    observaciones: typeof order.observaciones === "string" ? order.observaciones.trim() : ""
  };
}

function normalizePayload(payload) {
  return {
    ...payload,
    notificationType: payload?.notificationType || "new_request",
    estado: normalizeStatusValue(payload?.estado),
    notaInterna: typeof payload?.notaInterna === "string" ? payload.notaInterna.trim() : "",
    pedido: normalizeOrderDetails(payload?.pedido)
  };
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Solicitud invalida.";
  }

  if (!VALID_NOTIFICATION_TYPES.includes(payload.notificationType)) {
    return "Tipo de notificacion invalido.";
  }

  if (payload.barbero !== BRAND_CONFIG.name) {
    return "Barbero invalido.";
  }

  if (!isSizedString(payload.nombre, 3, 60)) {
    return "Nombre invalido.";
  }

  if (!isValidEmail(payload.correo)) {
    return "Correo invalido.";
  }

  if (!isValidPhone(payload.telefono)) {
    return "Telefono invalido.";
  }

  if (!isSizedString(payload.servicio, 3, 80)) {
    return "Servicio invalido.";
  }

  if (!isSizedString(payload.fecha, 3, 20) || !isSizedString(payload.hora, 3, 20)) {
    return "Fecha u hora invalida.";
  }

  if (!VALID_STATUS_VALUES.includes(payload.estado)) {
    return "Estado invalido.";
  }

  if (payload.notificationType === "customer_received" && payload.estado !== "Pendiente") {
    return "Estado invalido para solicitud recibida.";
  }

  if (payload.notificationType === "customer_status" && !["Confirmada", "Cancelada", "Completada"].includes(payload.estado)) {
    return "Estado invalido para cliente.";
  }

  if (payload.notaInterna && !isSizedString(payload.notaInterna, 1, 500)) {
    return "Nota interna invalida.";
  }

  if (payload.pedido) {
    if (!isSizedString(payload.pedido.pack, 3, 60)) {
      return "Pack invalido.";
    }

    if (!isSizedString(payload.pedido.planta, 2, 80)) {
      return "Planta invalida.";
    }

    if (!isSizedString(payload.pedido.macetero, 2, 80)) {
      return "Macetero invalido.";
    }

    if (!isSizedString(payload.pedido.globo, 2, 80)) {
      return "Globo invalido.";
    }
  }

  return null;
}

function toBase64Url(input) {
  const value = typeof input === "string" ? input : JSON.stringify(input);
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function parseServiceAccountJson(rawJson) {
  const candidates = [
    rawJson,
    rawJson.replace(/^"(.*)"$/s, "$1"),
    rawJson.replace(/\\n/g, "\n")
  ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      continue;
    }
  }

  throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_JSON format.");
}

function getNormalizedPrivateKey(rawValue) {
  const raw = String(rawValue || "").trim();

  if (raw.startsWith("{") && raw.includes("private_key")) {
    const parsed = parseServiceAccountJson(raw);
    return getNormalizedPrivateKey(parsed.private_key || "");
  }

  const candidates = [
    raw,
    raw.replace(/\\n/g, "\n"),
    raw.replace(/^"(.*)"$/s, "$1"),
    raw.replace(/^'(.*)'$/s, "$1"),
    raw.replace(/^"(.*)"$/s, "$1").replace(/\\n/g, "\n"),
    raw.replace(/^'(.*)'$/s, "$1").replace(/\\n/g, "\n")
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const keyObject = createPrivateKey({ key: candidate, format: "pem" });
      return keyObject.export({ format: "pem", type: "pkcs8" }).toString();
    } catch (error) {
      continue;
    }
  }

  throw new Error("Invalid FIREBASE_PRIVATE_KEY format.");
}

function getServiceAccountData() {
  const rawJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();

  if (rawJson) {
    const parsed = parseServiceAccountJson(rawJson);
    return {
      clientEmail: parsed.client_email || "",
      privateKey: getNormalizedPrivateKey(parsed.private_key || ""),
      projectId: parsed.project_id || ""
    };
  }

  return {
    clientEmail: String(process.env.FIREBASE_CLIENT_EMAIL || "").trim(),
    privateKey: getNormalizedPrivateKey(process.env.FIREBASE_PRIVATE_KEY),
    projectId: String(process.env.FIREBASE_PROJECT_ID || "").trim()
  };
}

function getServiceAccountConfig() {
  const serviceAccount = getServiceAccountData();

  if (!serviceAccount.clientEmail || !serviceAccount.privateKey) {
    throw new Error("Missing Firebase service account environment variables.");
  }

  return {
    clientEmail: serviceAccount.clientEmail,
    privateKey: serviceAccount.privateKey,
    projectId: serviceAccount.projectId || "barberia-elite-d5912"
  };
}

function createGoogleJwt(clientEmail, privateKey, scope) {
  const issuedAt = Math.floor(Date.now() / 1000) - 60;
  const expiresAt = issuedAt + 3600;

  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: clientEmail,
    sub: clientEmail,
    aud: GOOGLE_TOKEN_URL,
    scope,
    iat: issuedAt,
    exp: expiresAt
  };

  const unsignedToken = `${toBase64Url(header)}.${toBase64Url(claimSet)}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();

  const signature = signer.sign(privateKey, "base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return `${unsignedToken}.${signature}`;
}

async function fetchGoogleAccessToken(scope) {
  const config = getServiceAccountConfig();
  const assertion = createGoogleJwt(config.clientEmail, config.privateKey, scope);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "Could not get Google access token.");
  }

  return {
    accessToken: payload.access_token,
    projectId: config.projectId
  };
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }

  if (typeof value === "string") {
    return { stringValue: value };
  }

  if (typeof value === "boolean") {
    return { booleanValue: value };
  }

  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }

    return { doubleValue: value };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => toFirestoreValue(item))
      }
    };
  }

  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value)
            .filter(([, item]) => item !== undefined)
            .map(([key, item]) => [key, toFirestoreValue(item)])
        )
      }
    };
  }

  return { stringValue: String(value) };
}

async function saveOrderRecord(payload) {
  if (payload.notificationType !== "new_request" || !payload.pedido) {
    return;
  }

  const { accessToken, projectId } = await fetchGoogleAccessToken("https://www.googleapis.com/auth/datastore");
  const createdAt = new Date().toISOString();
  const response = await fetch(`${FIRESTORE_API_BASE}/${projectId}/databases/(default)/documents/solicitudes_reserva`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      fields: {
        barbero: toFirestoreValue(payload.barbero),
        fecha: toFirestoreValue(payload.fecha),
        hora: toFirestoreValue(payload.hora),
        nombre: toFirestoreValue(payload.nombre),
        correo: toFirestoreValue(payload.correo),
        telefono: toFirestoreValue(payload.telefono),
        servicio: toFirestoreValue(payload.servicio),
        estado: toFirestoreValue("pendiente"),
        creadoEn: { timestampValue: createdAt },
        notaInterna: toFirestoreValue(payload.notaInterna || ""),
        tipoSolicitud: toFirestoreValue(payload.pedido.tipo || "pedido_vivero"),
        pedido: toFirestoreValue(payload.pedido)
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firestore error: ${response.status} ${errorText}`);
  }
}

function getTemplateParams(payload, toEmail) {
  const mensaje =
    payload.notificationType === "new_request"
      ? "Nueva solicitud registrada desde la web."
      : payload.notificationType === "customer_received"
        ? "Recibimos tu solicitud y pronto la revisaremos."
        : payload.estado === "Confirmada"
          ? "Tu solicitud fue confirmada por la barberia."
          : payload.estado === "Cancelada"
            ? "Tu solicitud fue cancelada por la barberia."
            : `Gracias por su visita. Esperamos verle nuevamente en ${BRAND_CONFIG.name}.`;

  const titulo =
    payload.notificationType === "new_request"
      ? "Nueva solicitud de reserva"
      : payload.notificationType === "customer_received"
        ? "Solicitud recibida"
        : payload.estado === "Confirmada"
          ? "Reserva confirmada"
          : payload.estado === "Cancelada"
            ? "Reserva cancelada"
            : "Gracias por su visita";

  return {
    to_email: toEmail,
    email_title: titulo,
    cliente_nombre: payload.nombre,
    cliente_correo: payload.correo,
    cliente_telefono: payload.telefono,
    servicio: payload.servicio,
    fecha: payload.fecha,
    hora: payload.hora,
    estado: payload.estado,
    mensaje,
    nota_interna: payload.notaInterna || "",
    notification_type: payload.notificationType
  };
}

function isCustomerNotificationForBarber(payload, barberEmail) {
  if (payload.notificationType === "new_request") {
    return false;
  }

  return payload.correo.trim().toLowerCase() === barberEmail.trim().toLowerCase();
}

function getNotificationRecipients(barberEmail) {
  const configuredRecipients = Array.isArray(BRAND_CONFIG.orderNotificationEmails)
    ? BRAND_CONFIG.orderNotificationEmails
    : [];

  return [...new Set([barberEmail, ...configuredRecipients].filter(isValidEmail))];
}

async function sendEmailRequest(templateParams, serviceId, templateId, publicKey, privateKey) {
  const response = await fetch(EMAILJS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      accessToken: privateKey,
      template_params: templateParams
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`EmailJS error: ${response.status} ${errorText}`);
  }
}

async function sendEmail(payload) {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId =
    payload.notificationType === "new_request"
      ? process.env.EMAILJS_TEMPLATE_ID
      : process.env.EMAILJS_CUSTOMER_TEMPLATE_ID || process.env.EMAILJS_TEMPLATE_ID;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;
  const barberEmail = process.env.BARBER_EMAIL;

  if (!serviceId || !templateId || !publicKey || !privateKey || !barberEmail) {
    throw new Error("Missing email environment variables.");
  }

  // Avoid duplicate emails when the customer uses the barber's own address.
  if (isCustomerNotificationForBarber(payload, barberEmail)) {
    return;
  }

  if (payload.notificationType === "new_request") {
    const recipients = getNotificationRecipients(barberEmail);

    for (const recipient of recipients) {
      await sendEmailRequest(
        getTemplateParams(payload, recipient),
        serviceId,
        templateId,
        publicKey,
        privateKey
      );
    }

    return;
  }

  await sendEmailRequest(
    getTemplateParams(payload, payload.correo),
    serviceId,
    templateId,
    publicKey,
    privateKey
  );
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  try {
    const payload = normalizePayload(request.body);
    const validationError = validatePayload(payload);

    if (validationError) {
      response.status(400).json({ error: validationError });
      return;
    }

    if (payload.notificationType === "new_request") {
      await saveOrderRecord(payload);
    }

    await sendEmail(payload);
    response.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error sending booking email:", error);
    response.status(500).json({ error: "No se pudo enviar el correo." });
  }
}
