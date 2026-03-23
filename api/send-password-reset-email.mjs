import { createPrivateKey, createSign } from "node:crypto";

const EMAILJS_URL = "https://api.emailjs.com/api/v1.0/email/send";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIREBASE_OOB_URL = "https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode";

function isValidEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function toBase64Url(input) {
  const value = typeof input === "string" ? input : JSON.stringify(input);
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function getServiceAccountConfig() {
  const serviceAccount = getServiceAccountData();
  const clientEmail = serviceAccount.clientEmail;
  const privateKey = serviceAccount.privateKey;
  const projectId = serviceAccount.projectId || process.env.FIREBASE_PROJECT_ID || "barberia-elite-d5912";
  const authDomain = process.env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`;
  const continueUrl = process.env.PASSWORD_RESET_CONTINUE_URL || `https://${authDomain}`;

  if (!clientEmail || !privateKey) {
    throw new Error("Missing Firebase service account environment variables.");
  }

  return {
    clientEmail,
    privateKey,
    projectId,
    authDomain,
    continueUrl
  };
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

function createGoogleJwt(clientEmail, privateKey) {
  const issuedAt = Math.floor(Date.now() / 1000) - 60;
  const expiresAt = issuedAt + 3600;

  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  const claimSet = {
    iss: clientEmail,
    sub: clientEmail,
    aud: GOOGLE_TOKEN_URL,
    scope: "https://www.googleapis.com/auth/identitytoolkit",
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

async function fetchGoogleAccessToken(config) {
  const assertion = createGoogleJwt(config.clientEmail, config.privateKey);
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

  return payload.access_token;
}

async function generatePasswordResetLink(email) {
  const config = getServiceAccountConfig();
  const accessToken = await fetchGoogleAccessToken(config);

  const response = await fetch(FIREBASE_OOB_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      requestType: "PASSWORD_RESET",
      email,
      returnOobLink: true,
      continueUrl: config.continueUrl,
      canHandleCodeInApp: false,
      targetProjectId: config.projectId
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error?.status || "Could not generate password reset link.");
  }

  if (!payload.oobLink) {
    throw new Error("Firebase did not return a password reset link.");
  }

  return payload.oobLink;
}

async function sendResetEmail(email, resetLink) {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_PASSWORD_RESET_TEMPLATE_ID || process.env.EMAILJS_TEMPLATE_ID;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templateId || !publicKey || !privateKey) {
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
        to_email: email,
        email_title: "Recupera tu clave",
        cliente_nombre: email.split("@")[0],
        cliente_correo: email,
        cliente_telefono: "-",
        servicio: "Recuperación de acceso",
        fecha: "-",
        hora: "-",
        estado: "Pendiente",
        mensaje: `Haz clic en este enlace para restablecer tu clave: ${resetLink}`,
        nota_interna: resetLink,
        notification_type: "password_reset",
        action_label: "Restablecer clave",
        action_url: resetLink,
        reset_link: resetLink
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

    const resetLink = await generatePasswordResetLink(email);
    await sendResetEmail(email, resetLink);

    response.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error sending password reset email:", error);

    if (String(error.message || "").includes("EMAIL_NOT_FOUND")) {
      response.status(400).json({ error: "EMAIL_NOT_FOUND" });
      return;
    }

    response.status(500).json({
      error: "No se pudo enviar el correo de recuperacion.",
      details: String(error.message || "UNKNOWN_ERROR")
    });
  }
}
