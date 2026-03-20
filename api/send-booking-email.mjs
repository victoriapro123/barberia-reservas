const EMAILJS_URL = "https://api.emailjs.com/api/v1.0/email/send";

function isSizedString(value, min, max) {
  return typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
}

function isValidEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value) {
  return typeof value === "string" && /^[+\d\s()-]{8,20}$/.test(value);
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Solicitud invalida.";
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

  return null;
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
      template_params: {
        to_email: barberEmail,
        cliente_nombre: payload.nombre,
        cliente_correo: payload.correo,
        cliente_telefono: payload.telefono,
        servicio: payload.servicio,
        fecha: payload.fecha,
        hora: payload.hora,
        estado: "Pendiente"
      }
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
    const payload = request.body;
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
