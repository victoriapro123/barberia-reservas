import admin from "firebase-admin";
import { BRAND_CONFIG } from "../brand-config.mjs";

const EMAILJS_URL = "https://api.emailjs.com/api/v1.0/email/send";
const PUBLIC_SITE_URL = "https://jardinflordeloto.cl";

function isValidEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function assertHttpsUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error(`${label} no es una URL valida.`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`${label} debe comenzar con https://`);
  }

  return url.toString();
}

function getRequestBaseUrl(request) {
  const configured = String(process.env.PUBLIC_SITE_URL || PUBLIC_SITE_URL).trim().replace(/\/+$/, "");
  return assertHttpsUrl(configured, "PUBLIC_SITE_URL").replace(/\/+$/, "");
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

  throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON no tiene formato JSON valido.");
}

function normalizePrivateKey(rawValue) {
  return String(rawValue || "")
    .trim()
    .replace(/^"(.*)"$/s, "$1")
    .replace(/^'(.*)'$/s, "$1")
    .replace(/\\n/g, "\n");
}

function getFirebaseServiceAccount() {
  const rawJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();

  if (rawJson) {
    const parsed = parseServiceAccountJson(rawJson);
    return {
      projectId: parsed.project_id || process.env.FIREBASE_PROJECT_ID || "barberia-elite-d5912",
      clientEmail: parsed.client_email || "",
      privateKey: normalizePrivateKey(parsed.private_key || "")
    };
  }

  return {
    projectId: String(process.env.FIREBASE_PROJECT_ID || "barberia-elite-d5912").trim(),
    clientEmail: String(process.env.FIREBASE_CLIENT_EMAIL || "").trim(),
    privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY)
  };
}

function getFirebaseAuth() {
  if (!admin.apps.length) {
    const serviceAccount = getFirebaseServiceAccount();

    if (!serviceAccount.clientEmail || !serviceAccount.privateKey || !serviceAccount.projectId) {
      throw new Error("Faltan variables Firebase: FIREBASE_SERVICE_ACCOUNT_JSON o FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY/FIREBASE_PROJECT_ID.");
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: serviceAccount.projectId,
        clientEmail: serviceAccount.clientEmail,
        privateKey: serviceAccount.privateKey
      })
    });
  }

  return admin.auth();
}

async function generatePasswordResetLink(email, request) {
  const baseUrl = getRequestBaseUrl(request);
  const firebaseResetLink = await getFirebaseAuth().generatePasswordResetLink(email);

  const parsedFirebaseLink = new URL(assertHttpsUrl(firebaseResetLink, "firebase_reset_link"));
  const oobCode = parsedFirebaseLink.searchParams.get("oobCode");
  const mode = parsedFirebaseLink.searchParams.get("mode") || "resetPassword";

  if (!oobCode) {
    throw new Error("Firebase genero un link sin codigo de recuperacion.");
  }

  return assertHttpsUrl(`${baseUrl}/reset-password.html?mode=${encodeURIComponent(mode)}&oobCode=${encodeURIComponent(oobCode)}&email=${encodeURIComponent(email)}`, "reset_link");
}

async function sendResetEmail(email, resetLink) {
  const safeResetLink = assertHttpsUrl(resetLink, "reset_link");
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_PASSWORD_RESET_TEMPLATE_ID;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templateId || !publicKey || !privateKey) {
    throw new Error("Faltan variables EmailJS: EMAILJS_SERVICE_ID, EMAILJS_PASSWORD_RESET_TEMPLATE_ID, EMAILJS_PUBLIC_KEY o EMAILJS_PRIVATE_KEY.");
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
        to_email: email,
        brand_name: BRAND_CONFIG.name,
        business_name: BRAND_CONFIG.name,
        app_name: BRAND_CONFIG.name,
        email_title: `Recupera tu clave - ${BRAND_CONFIG.name}`,
        cliente_nombre: email.split("@")[0],
        cliente_correo: email,
        cliente_telefono: "-",
        servicio: `Recuperacion de acceso a ${BRAND_CONFIG.name}`,
        fecha: "-",
        hora: "-",
        estado: "Pendiente",
        mensaje: `Recibimos una solicitud para restablecer tu clave de ${BRAND_CONFIG.name}. Usa el boton de abajo para continuar.`,
        nota_interna: safeResetLink,
        notification_type: "password_reset",
        action_label: "Restablecer clave",
        action_url: safeResetLink,
        button_url: safeResetLink,
        link_visible: safeResetLink,
        reset_link: safeResetLink
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
    const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";

    if (!isValidEmail(email)) {
      response.status(400).json({ error: "Correo invalido." });
      return;
    }

    const resetLink = await generatePasswordResetLink(email, request);
    await sendResetEmail(email, resetLink);

    response.status(200).json({ ok: true, reset_link_sent: true });
  } catch (error) {
    console.error("Error sending password reset email:", error);

    const message = String(error.message || "");
    if (message.includes("auth/user-not-found") || message.includes("EMAIL_NOT_FOUND")) {
      response.status(400).json({ error: "EMAIL_NOT_FOUND", detail: "No existe una cuenta con ese correo." });
      return;
    }

    if (message.includes("auth/unauthorized-continue-uri")) {
      response.status(400).json({
        error: "UNAUTHORIZED_DOMAIN",
        detail: "El dominio del link no esta autorizado en Firebase Authentication > Settings > Authorized domains."
      });
      return;
    }

    response.status(500).json({
      error: "No se pudo enviar el correo de recuperacion.",
      detail: message
    });
  }
}
