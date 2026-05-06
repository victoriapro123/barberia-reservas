import { createPrivateKey, createSign } from "node:crypto";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIRESTORE_API_BASE = "https://firestore.googleapis.com/v1/projects";

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

export function getServiceAccountConfig() {
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

export async function fetchGoogleAccessToken(scope = "https://www.googleapis.com/auth/datastore") {
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

export function toFirestoreValue(value) {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }

  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
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
    if (value.__timestamp) {
      return { timestampValue: value.__timestamp };
    }

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

async function fireRequest(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Firestore error: ${response.status} ${text}`);
  }

  return text ? JSON.parse(text) : {};
}

function fromFirestoreValue(node) {
  if (!node || typeof node !== "object") {
    return null;
  }

  if ("stringValue" in node) return node.stringValue;
  if ("booleanValue" in node) return node.booleanValue;
  if ("integerValue" in node) return Number(node.integerValue);
  if ("doubleValue" in node) return Number(node.doubleValue);
  if ("timestampValue" in node) return node.timestampValue;
  if ("nullValue" in node) return null;

  if (node.arrayValue) {
    return (node.arrayValue.values || []).map((item) => fromFirestoreValue(item));
  }

  if (node.mapValue) {
    return Object.fromEntries(
      Object.entries(node.mapValue.fields || {}).map(([key, value]) => [key, fromFirestoreValue(value)])
    );
  }

  return null;
}

export async function setFirestoreDocument(collectionName, documentId, data, merge = true) {
  const { accessToken, projectId } = await fetchGoogleAccessToken();
  const params = merge ? "?updateMask.fieldPaths=" : "";
  const mask = merge
    ? Object.keys(data)
        .map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
        .join("&")
    : "";
  const query = merge && mask ? `?${mask}` : "";

  return fireRequest(
    `${FIRESTORE_API_BASE}/${projectId}/databases/(default)/documents/${collectionName}/${documentId}${query}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        fields: Object.fromEntries(
          Object.entries(data)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, toFirestoreValue(value)])
        )
      })
    }
  );
}

export async function createFirestoreDocument(collectionName, data, documentId = "") {
  const { accessToken, projectId } = await fetchGoogleAccessToken();
  const suffix = documentId ? `?documentId=${encodeURIComponent(documentId)}` : "";

  return fireRequest(
    `${FIRESTORE_API_BASE}/${projectId}/databases/(default)/documents/${collectionName}${suffix}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        fields: Object.fromEntries(
          Object.entries(data)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, toFirestoreValue(value)])
        )
      })
    }
  );
}

export async function getFirestoreDocument(collectionName, documentId) {
  const { accessToken, projectId } = await fetchGoogleAccessToken();
  const payload = await fireRequest(
    `${FIRESTORE_API_BASE}/${projectId}/databases/(default)/documents/${collectionName}/${documentId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  return Object.fromEntries(
    Object.entries(payload.fields || {}).map(([key, value]) => [key, fromFirestoreValue(value)])
  );
}
