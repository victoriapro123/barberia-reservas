import { randomUUID } from "node:crypto";
import transbankSdk from "transbank-sdk";

const { WebpayPlus } = transbankSdk;

export class WebpayConfigError extends Error {
  constructor(message, diagnostics) {
    super(message);
    this.name = "WebpayConfigError";
    this.code = "WEBPAY_CONFIG_ERROR";
    this.publicMessage = message;
    this.diagnostics = diagnostics;
  }
}

export class WebpayValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "WebpayValidationError";
    this.code = "WEBPAY_VALIDATION_ERROR";
    this.publicMessage = message;
  }
}

function maskSecret(value, visibleStart = 4, visibleEnd = 4) {
  const raw = String(value || "");
  if (!raw) return "";
  if (raw.length <= visibleStart + visibleEnd) return "*".repeat(raw.length);
  return `${raw.slice(0, visibleStart)}...${raw.slice(-visibleEnd)}`;
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch (error) {
    return false;
  }
}

export function getWebpayEnvDiagnostics() {
  const commerceCode = String(process.env.TRANSBANK_COMMERCE_CODE || "").trim();
  const apiKey = String(process.env.TRANSBANK_API_KEY || "").trim();
  const environment = String(process.env.TRANSBANK_ENVIRONMENT || "").trim();
  const baseUrl = String(process.env.WEBPAY_RETURN_BASE_URL || "").trim().replace(/\/+$/, "");

  return {
    TRANSBANK_COMMERCE_CODE: {
      present: Boolean(commerceCode),
      length: commerceCode.length,
      masked: maskSecret(commerceCode, 3, 3),
      numeric: /^\d+$/.test(commerceCode)
    },
    TRANSBANK_API_KEY: {
      present: Boolean(apiKey),
      length: apiKey.length,
      masked: maskSecret(apiKey, 6, 6)
    },
    TRANSBANK_ENVIRONMENT: {
      present: Boolean(environment),
      value: environment || "(missing)",
      normalized: environment.toLowerCase()
    },
    WEBPAY_RETURN_BASE_URL: {
      present: Boolean(baseUrl),
      value: baseUrl || "(missing)",
      validHttpsUrl: Boolean(baseUrl) && isHttpsUrl(baseUrl)
    },
    VERCEL_ENV: process.env.VERCEL_ENV || "",
    VERCEL_URL: process.env.VERCEL_URL || ""
  };
}

export function getWebpayConfig() {
  const commerceCode = String(process.env.TRANSBANK_COMMERCE_CODE || "").trim();
  const apiKey = String(process.env.TRANSBANK_API_KEY || "").trim();
  const rawEnvironment = String(process.env.TRANSBANK_ENVIRONMENT || "").trim();
  const environment = rawEnvironment.toLowerCase();
  const baseUrl = String(process.env.WEBPAY_RETURN_BASE_URL || "").trim().replace(/\/+$/, "");
  const diagnostics = getWebpayEnvDiagnostics();
  const missing = [];

  if (!commerceCode) missing.push("TRANSBANK_COMMERCE_CODE");
  if (!apiKey) missing.push("TRANSBANK_API_KEY");
  if (!rawEnvironment) missing.push("TRANSBANK_ENVIRONMENT");
  if (!baseUrl) missing.push("WEBPAY_RETURN_BASE_URL");

  if (missing.length) {
    throw new WebpayConfigError(`Faltan variables de entorno en Vercel: ${missing.join(", ")}.`, diagnostics);
  }

  if (environment !== "integration") {
    throw new WebpayConfigError("TRANSBANK_ENVIRONMENT debe ser integration para esta prueba.", diagnostics);
  }

  if (!/^\d+$/.test(commerceCode)) {
    throw new WebpayConfigError("TRANSBANK_COMMERCE_CODE debe ser numerico.", diagnostics);
  }

  if (apiKey.length < 20) {
    throw new WebpayConfigError("TRANSBANK_API_KEY parece incompleta.", diagnostics);
  }

  if (!isHttpsUrl(baseUrl)) {
    throw new WebpayConfigError("WEBPAY_RETURN_BASE_URL debe ser una URL HTTPS publica de Vercel.", diagnostics);
  }

  return {
    commerceCode,
    apiKey,
    environment,
    baseUrl
  };
}

export function getRequestBaseUrl(request, config = getWebpayConfig()) {
  const configuredBaseUrl = config.baseUrl;
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  const protocol = String(request.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = String(request.headers["x-forwarded-host"] || request.headers.host || "").split(",")[0].trim();

  if (!host) {
    throw new Error("Could not resolve base URL for Webpay return.");
  }

  return `${protocol}://${host}`;
}

export function buildWebpayTransaction() {
  const { commerceCode, apiKey } = getWebpayConfig();
  return WebpayPlus.Transaction.buildForIntegration(commerceCode, apiKey);
}

export function buildWebpayTransactionFromConfig(config) {
  return WebpayPlus.Transaction.buildForIntegration(config.commerceCode, config.apiKey);
}

export function createBuyOrder() {
  const seed = randomUUID().replace(/-/g, "").toUpperCase();
  return `OC${seed.slice(0, 24)}`;
}

export function createSessionId() {
  const seed = randomUUID().replace(/-/g, "");
  return `SES${seed.slice(0, 22)}`;
}

export function normalizeAmount(rawAmount) {
  const amount = Number(rawAmount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new WebpayValidationError("El monto de la transaccion no es valido.");
  }

  return Math.round(amount);
}

export function normalizePaymentPayload(payload) {
  const order = payload?.order && typeof payload.order === "object" ? payload.order : {};
  const customer = payload?.customer && typeof payload.customer === "object" ? payload.customer : {};

  return {
    amount: normalizeAmount(payload?.amount ?? order?.total ?? 1000),
    pack: String(order.pack || "").trim(),
    planta: String(order.planta || "").trim(),
    macetero: String(order.macetero || "").trim(),
    globo: String(order.globo || "").trim(),
    delivery: Boolean(order.delivery),
    deliveryExtra: Number.isFinite(Number(order.deliveryExtra)) ? Number(order.deliveryExtra) : 0,
    total: normalizeAmount(order.total ?? payload?.amount ?? 1000),
    direccion: String(order.direccion || "").trim(),
    observaciones: String(order.observaciones || "").trim(),
    customerName: String(customer.nombre || "").trim(),
    customerEmail: String(customer.correo || "").trim().toLowerCase(),
    customerPhone: String(customer.telefono || "").trim()
  };
}

export function getPaymentStatusLabel(commitResponse = {}) {
  return commitResponse?.status === "AUTHORIZED" && Number(commitResponse?.response_code) === 0
    ? "aprobado"
    : "rechazado";
}
