import { createFirestoreDocument, setFirestoreDocument } from "../_lib/firebase-rest.mjs";
import {
  WebpayConfigError,
  buildWebpayTransactionFromConfig,
  createBuyOrder,
  createSessionId,
  getRequestBaseUrl,
  getWebpayConfig,
  getWebpayEnvDiagnostics
} from "../_lib/webpay.mjs";

const PRODUCTION_TEST_AMOUNT = 50;

function sendJson(response, statusCode, payload) {
  response.status(statusCode).json(payload);
}

function buildErrorPayload(error, extra = {}) {
  const isConfig = error instanceof WebpayConfigError;
  const isTransbank = error?.name === "TransbankError" || String(error?.message || "").includes("TransbankError");

  if (isConfig) {
    return {
      statusCode: 500,
      body: {
        ok: false,
        category: "config",
        error: error.publicMessage,
        detail: error.message,
        diagnostics: error.diagnostics,
        help: "Configura las variables de produccion en Vercel y vuelve a hacer Redeploy."
      }
    };
  }

  if (isTransbank) {
    const transbankResponse = error?.response || error?.cause?.response;
    return {
      statusCode: 502,
      body: {
        ok: false,
        category: "transbank",
        error: "Transbank rechazo la creacion de la transaccion de produccion.",
        detail: error.message,
        transbank_status: transbankResponse?.status || null,
        transbank_response: transbankResponse?.data || null,
        diagnostics: getWebpayEnvDiagnostics("production"),
        help: "Revisa que el commerce code y API key sean reales de produccion para Webpay Plus normal."
      }
    };
  }

  return {
    statusCode: extra.statusCode || 500,
    body: {
      ok: false,
      category: extra.category || "server",
      error: extra.error || "No se pudo crear la transaccion real de Webpay.",
      detail: error.message,
      diagnostics: getWebpayEnvDiagnostics("production"),
      ...extra
    }
  };
}

async function saveProductionTestPayment({ buyOrder, sessionId, returnUrl, createResponse, createdAt }) {
  const payload = {
    buyOrder,
    sessionId,
    amount: PRODUCTION_TEST_AMOUNT,
    returnUrl,
    tokenWs: createResponse.token,
    webpayUrl: createResponse.url,
    status: "CREATED",
    environment: "production",
    isProductionValidationTest: true,
    createdAt: { __timestamp: createdAt },
    order: {
      pack: "Producto prueba Webpay produccion",
      planta: "Validacion Transbank",
      macetero: "No aplica",
      globo: "No aplica",
      delivery: false,
      deliveryExtra: 0,
      total: PRODUCTION_TEST_AMOUNT,
      direccion: "",
      observaciones: "Producto de prueba solicitado por Transbank para validar produccion."
    },
    customer: {
      nombre: "Prueba Transbank",
      correo: "",
      telefono: ""
    },
    createResponse
  };

  await setFirestoreDocument("webpay_pagos", buyOrder, payload, false).catch(async () => {
    await createFirestoreDocument("webpay_pagos", payload, buyOrder);
  });
}

export default async function handler(request, response) {
  console.info("[webpay/create-production-test] request", {
    method: request.method,
    diagnostics: getWebpayEnvDiagnostics("production")
  });

  if (request.method === "GET") {
    sendJson(response, 200, {
      ok: true,
      endpoint: "/api/webpay/create-production-test",
      amount: PRODUCTION_TEST_AMOUNT,
      diagnostics: getWebpayEnvDiagnostics("production")
    });
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  let buyOrder;
  let sessionId;
  let returnUrl;
  let createResponse;

  try {
    const config = getWebpayConfig({ mode: "production" });
    buyOrder = createBuyOrder();
    sessionId = createSessionId();
    const baseUrl = getRequestBaseUrl(request, config);
    returnUrl = `${baseUrl}/api/webpay/commit-production-test`;
    const transaction = buildWebpayTransactionFromConfig(config);
    const createdAt = new Date().toISOString();

    console.info("[webpay/create-production-test] creating transaction", {
      buyOrder,
      sessionId,
      amount: PRODUCTION_TEST_AMOUNT,
      returnUrl
    });

    createResponse = await transaction.create(
      buyOrder,
      sessionId,
      PRODUCTION_TEST_AMOUNT,
      returnUrl
    );

    console.info("[webpay/create-production-test] production token created", {
      buyOrder,
      sessionId,
      hasToken: Boolean(createResponse?.token),
      hasUrl: Boolean(createResponse?.url)
    });

    await saveProductionTestPayment({
      buyOrder,
      sessionId,
      returnUrl,
      createResponse,
      createdAt
    });

    sendJson(response, 200, {
      ok: true,
      token_ws: createResponse.token,
      url: createResponse.url,
      buy_order: buyOrder,
      session_id: sessionId,
      amount: PRODUCTION_TEST_AMOUNT,
      environment: "production",
      return_url: returnUrl
    });
  } catch (error) {
    const tokenCreatedBeforeError = Boolean(createResponse?.token);
    const extra = tokenCreatedBeforeError
      ? {
          statusCode: 500,
          category: "firebase",
          error: "Webpay genero token_ws real, pero fallo el guardado en Firebase.",
          token_ws: createResponse.token,
          url: createResponse.url,
          buy_order: buyOrder,
          session_id: sessionId,
          amount: PRODUCTION_TEST_AMOUNT,
          return_url: returnUrl,
          help: "Revisa las variables de Firebase en Vercel. El token real ya fue creado."
        }
      : {};
    const payload = buildErrorPayload(error, extra);

    console.error("[webpay/create-production-test] error", {
      category: payload.body.category,
      message: error.message,
      diagnostics: payload.body.diagnostics,
      transbank_status: payload.body.transbank_status || null,
      transbank_response: payload.body.transbank_response || null,
      buyOrder,
      sessionId,
      tokenCreatedBeforeError
    });

    sendJson(response, payload.statusCode, payload.body);
  }
}
