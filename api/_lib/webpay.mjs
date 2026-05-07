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

function readEnv(name) {
  return String(process.env[name] || "").trim();
}

function getWebpayEnvNames(mode = "integration") {
  if (mode === "production") {
    return {
      commerceCode: "TRANSBANK_PRODUCTION_COMMERCE_CODE",
      apiKey: "TRANSBANK_PRODUCTION_API_KEY",
      environment: "TRANSBANK_PRODUCTION_ENVIRONMENT",
      baseUrl: "WEBPAY_PRODUCTION_RETURN_BASE_URL",
      expectedEnvironment: "production"
    };
  }

  return {
    commerceCode: "TRANSBANK_COMMERCE_CODE",
    apiKey: "TRANSBANK_API_KEY",
    environment: "TRANSBANK_ENVIRONMENT",
    baseUrl: "WEBPAY_RETURN_BASE_URL",
    expectedEnvironment: "integration"
  };
}

function getWebpayRawValues(mode = "integration") {
  const names = getWebpayEnvNames(mode);
  const fallbackToGeneric = mode === "production";

  return {
    names,
    commerceCode: readEnv(names.commerceCode) || (fallbackToGeneric ? readEnv("TRANSBANK_COMMERCE_CODE") : ""),
    apiKey: readEnv(names.apiKey) || (fallbackToGeneric ? readEnv("TRANSBANK_API_KEY") : ""),
    environment: readEnv(names.environment) || (fallbackToGeneric ? readEnv("TRANSBANK_ENVIRONMENT") : ""),
    baseUrl: (readEnv(names.baseUrl) || (fallbackToGeneric ? readEnv("WEBPAY_RETURN_BASE_URL") : "")).replace(/\/+$/, "")
  };
}

export function getWebpayEnvDiagnostics(mode = "integration") {
  const { names, commerceCode, apiKey, environment, baseUrl } = getWebpayRawValues(mode);

  return {
    mode,
    expectedEnvironment: names.expectedEnvironment,
    commerceCodeEnv: names.commerceCode,
    apiKeyEnv: names.apiKey,
    environmentEnv: names.environment,
    baseUrlEnv: names.baseUrl,
    commerceCode: {
      present: Boolean(commerceCode),
      length: commerceCode.length,
      masked: maskSecret(commerceCode, 3, 3),
      numeric: /^\d+$/.test(commerceCode)
    },
    apiKey: {
      present: Boolean(apiKey),
      length: apiKey.length,
      masked: maskSecret(apiKey, 6, 6)
    },
    environment: {
      present: Boolean(environment),
      value: environment || "(missing)",
      normalized: environment.toLowerCase()
    },
    baseUrl: {
      present: Boolean(baseUrl),
      value: baseUrl || "(missing)",
      validHttpsUrl: Boolean(baseUrl) && isHttpsUrl(baseUrl)
    },
    VERCEL_ENV: process.env.VERCEL_ENV || "",
    VERCEL_URL: process.env.VERCEL_URL || ""
  };
}

export function hasWebpayProductionConfig() {
  const diagnostics = getWebpayEnvDiagnostics("production");
  return Boolean(
    diagnostics.commerceCode.present &&
    diagnostics.apiKey.present &&
    diagnostics.environment.normalized === "production" &&
    diagnostics.baseUrl.validHttpsUrl
  );
}

export function getWebpayConfig(options = {}) {
  const mode = options.mode || "integration";
  const { names, commerceCode, apiKey, environment: rawEnvironment, baseUrl } = getWebpayRawValues(mode);
  const environment = rawEnvironment.toLowerCase();
  const diagnostics = getWebpayEnvDiagnostics(mode);
  const missing = [];

  if (!commerceCode) missing.push(names.commerceCode);
  if (!apiKey) missing.push(names.apiKey);
  if (!rawEnvironment) missing.push(names.environment);
  if (!baseUrl) missing.push(names.baseUrl);

  if (missing.length) {
    throw new WebpayConfigError(`Faltan variables de entorno en Vercel: ${missing.join(", ")}.`, diagnostics);
  }

  if (environment !== names.expectedEnvironment) {
    throw new WebpayConfigError(`${names.environment} debe ser ${names.expectedEnvironment} para esta prueba.`, diagnostics);
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
  if (config.environment === "production") {
    return WebpayPlus.Transaction.buildForProduction(config.commerceCode, config.apiKey);
  }

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
