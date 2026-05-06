import { randomUUID } from "node:crypto";
import { WebpayPlus } from "transbank-sdk";

export function getWebpayConfig() {
  const commerceCode = String(process.env.TRANSBANK_COMMERCE_CODE || "").trim();
  const apiKey = String(process.env.TRANSBANK_API_KEY || "").trim();
  const environment = String(process.env.TRANSBANK_ENVIRONMENT || "integration").trim().toLowerCase();
  const baseUrl = String(process.env.WEBPAY_RETURN_BASE_URL || "").trim().replace(/\/+$/, "");

  if (!commerceCode || !apiKey) {
    throw new Error("Missing Transbank environment variables.");
  }

  if (environment !== "integration") {
    throw new Error("Only Transbank integration environment is enabled in this project.");
  }

  return {
    commerceCode,
    apiKey,
    environment,
    baseUrl
  };
}

export function getRequestBaseUrl(request) {
  const configuredBaseUrl = getWebpayConfig().baseUrl;
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
    throw new Error("Invalid transaction amount.");
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
