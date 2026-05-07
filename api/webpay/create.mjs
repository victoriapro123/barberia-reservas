import { createFirestoreDocument, setFirestoreDocument } from "../_lib/firebase-rest.mjs";
import {
  WebpayConfigError,
  WebpayValidationError,
  buildWebpayTransactionFromConfig,
  createBuyOrder,
  createSessionId,
  getRequestBaseUrl,
  getWebpayConfig,
  getWebpayEnvDiagnostics,
  hasWebpayProductionConfig,
  normalizePaymentPayload
} from "../_lib/webpay.mjs";

function sendJson(response, statusCode, payload) {
  response.status(statusCode).json(payload);
}

function buildErrorPayload(error, extra = {}) {
  const mode = extra.webpayMode || "integration";
  const isConfig = error instanceof WebpayConfigError;
  const isValidation = error instanceof WebpayValidationError;
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
        help: "Revisa las variables del proyecto en Vercel > Settings > Environment Variables y vuelve a hacer Redeploy."
      }
    };
  }

  if (isValidation) {
    return {
      statusCode: 400,
      body: {
        ok: false,
        category: "validation",
        error: error.publicMessage,
        detail: error.message,
        diagnostics: getWebpayEnvDiagnostics(mode)
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
        error: "Transbank rechazo la creacion de la transaccion.",
        detail: error.message,
        transbank_status: transbankResponse?.status || null,
        transbank_response: transbankResponse?.data || null,
        diagnostics: getWebpayEnvDiagnostics(mode),
        help: "Si las variables estan presentes, revisa que commerce code y API key sean de ambiente de integracion y correspondan a Webpay Plus normal."
      }
    };
  }

  return {
    statusCode: extra.statusCode || 500,
    body: {
      ok: false,
      category: extra.category || "server",
      error: extra.error || "No se pudo crear la transaccion de Webpay.",
      detail: error.message,
      diagnostics: getWebpayEnvDiagnostics(mode),
      ...extra
    }
  };
}

function resolveWebpayMode(payload = {}) {
  const requestedMode = String(payload?.webpayMode || payload?.environment || "").trim().toLowerCase();
  if (requestedMode === "integration" || requestedMode === "production") {
    return requestedMode;
  }

  return hasWebpayProductionConfig() ? "production" : "integration";
}

async function savePaymentRecord({ buyOrder, sessionId, payment, returnUrl, createResponse, createdAt, webpayMode }) {
  const payload = {
    buyOrder,
    sessionId,
    amount: payment.amount,
    returnUrl,
    tokenWs: createResponse.token,
    webpayUrl: createResponse.url,
    status: "CREATED",
    environment: webpayMode,
    createdAt: { __timestamp: createdAt },
    order: {
      pack: payment.pack,
      planta: payment.planta,
      macetero: payment.macetero,
      globo: payment.globo,
      delivery: payment.delivery,
      deliveryExtra: payment.deliveryExtra,
      total: payment.total,
      direccion: payment.direccion,
      observaciones: payment.observaciones
    },
    customer: {
      nombre: payment.customerName,
      correo: payment.customerEmail,
      telefono: payment.customerPhone
    },
    createResponse
  };

  await setFirestoreDocument("webpay_pagos", buyOrder, payload, false).catch(async () => {
    await createFirestoreDocument("webpay_pagos", payload, buyOrder);
  });
}

export default async function handler(request, response) {
  console.info("[webpay/create] request", {
    method: request.method,
    diagnostics: getWebpayEnvDiagnostics()
  });

  if (request.method === "GET") {
    sendJson(response, 200, {
      ok: true,
      endpoint: "/api/webpay/create",
      diagnostics: getWebpayEnvDiagnostics()
    });
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  let payment;
  let buyOrder;
  let sessionId;
  let returnUrl;
  let createResponse;
  let webpayMode = "integration";

  try {
    webpayMode = resolveWebpayMode(request.body);
    const config = getWebpayConfig({ mode: webpayMode });
    payment = normalizePaymentPayload(request.body);
    buyOrder = createBuyOrder();
    sessionId = createSessionId();
    const baseUrl = getRequestBaseUrl(request, config);
    returnUrl = `${baseUrl}/api/webpay/commit?webpay_env=${encodeURIComponent(webpayMode)}`;
    const transaction = buildWebpayTransactionFromConfig(config);
    const createdAt = new Date().toISOString();

    console.info("[webpay/create] creating transaction", {
      buyOrder,
      sessionId,
      amount: payment.amount,
      returnUrl
    });

    createResponse = await transaction.create(
      buyOrder,
      sessionId,
      payment.amount,
      returnUrl
    );

    console.info("[webpay/create] transbank token created", {
      buyOrder,
      sessionId,
      hasToken: Boolean(createResponse?.token),
      hasUrl: Boolean(createResponse?.url)
    });

    await savePaymentRecord({
      buyOrder,
      sessionId,
      payment,
      returnUrl,
      createResponse,
      createdAt,
      webpayMode
    });

    console.info("[webpay/create] payment saved in firestore", {
      buyOrder,
      sessionId
    });

    sendJson(response, 200, {
      ok: true,
      token_ws: createResponse.token,
      url: createResponse.url,
      buy_order: buyOrder,
      session_id: sessionId,
      amount: payment.amount,
      environment: webpayMode,
      return_url: returnUrl
    });
  } catch (error) {
    const tokenCreatedBeforeError = Boolean(createResponse?.token);
    const extra = tokenCreatedBeforeError
      ? {
          statusCode: 500,
          category: "firebase",
          error: "Webpay genero token_ws, pero fallo el guardado en Firebase.",
          token_ws: createResponse.token,
          url: createResponse.url,
          buy_order: buyOrder,
          session_id: sessionId,
          amount: payment?.amount || 0,
          return_url: returnUrl,
          webpayMode,
          help: "Revisa FIREBASE_SERVICE_ACCOUNT_JSON o FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY/FIREBASE_PROJECT_ID en Vercel."
        }
      : { webpayMode };
    const payload = buildErrorPayload(error, extra);

    console.error("[webpay/create] error", {
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
