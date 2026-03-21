const EMAILJS_URL = "https://api.emailjs.com/api/v1.0/email/send";

const VALID_NOTIFICATION_TYPES = ["new_request", "customer_status"];
const VALID_STATUS_VALUES = ["Pendiente", "Confirmada", "Cancelada"];

function normalizeStatusValue(value) {
  if (typeof value !== "string") return "Pendiente";

  const normalized = value.trim().toLowerCase();

  if (normalized === "pendiente") return "Pendiente";
  if (normalized === "confirmada") return "Confirmada";
  if (normalized === "cancelada") return "Cancelada";

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

function normalizePayload(payload) {
  return {
    ...payload,
    notificationType: payload?.notificationType || "new_request",
    estado: normalizeStatusValue(payload?.estado),
    notaInterna: typeof payload?.notaInterna === "string" ? payload.notaInterna.trim() : ""
  };
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Solicitud invalida.";
  }

  if (!VALID_NOTIFICATION_TYPES.includes(payload.notificationType)) {
    return "Tipo de notificacion invalido.";
  }

  if (payload.barbero !== "Barber Elite") {
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

  if (!isSizedString(payload.fecha, 3, 20) || !isSizedString(payload.hora, 4, 5)) {
    return "Fecha u hora invalida.";
  }

  if (!VALID_STATUS_VALUES.includes(payload.estado)) {
    return "Estado invalido.";
  }

  if (payload.notificationType === "customer_status" && !["Confirmada", "Cancelada"].includes(payload.estado)) {
    return "Estado invalido para cliente.";
  }

  if (payload.notaInterna && !isSizedString(payload.notaInterna, 1, 500)) {
    return "Nota interna invalida.";
  }

  return null;
}

function getTemplateParams(payload, barberEmail) {
  const toEmail = payload.notificationType === "new_request" ? barberEmail : payload.correo;
  const mensaje =
    payload.notificationType === "new_request"
      ? "Nueva solicitud registrada desde la web."
      : payload.estado === "Confirmada"
        ? "Tu solicitud fue confirmada por la barberia."
        : "Tu solicitud fue cancelada por la barberia.";

  return {
    to_email: toEmail,
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

async function sendEmail(payload) {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_ID;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;
  const barberEmail = process.env.BARBER_EMAIL;

  if (!serviceId || !templateId || !publicKey || !privateKey || !barberEmail) {
    throw new Error("Missing email environment variables.");
  }

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
      template_params: getTemplateParams(payload, barberEmail)
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`EmailJS error: ${response.status} ${errorText}`);
  }
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

    await sendEmail(payload);
    response.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error sending booking email:", error);
    response.status(500).json({ error: "No se pudo enviar el correo." });
  }
}
