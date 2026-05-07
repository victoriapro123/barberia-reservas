import { getFirestoreDocument, setFirestoreDocument } from "../_lib/firebase-rest.mjs";
import {
  buildWebpayTransactionFromConfig,
  getPaymentStatusLabel,
  getRequestBaseUrl,
  getWebpayConfig,
  getWebpayEnvDiagnostics
} from "../_lib/webpay.mjs";

function parseFormBody(rawBody = "") {
  return Object.fromEntries(new URLSearchParams(rawBody));
}

async function readRawBody(request) {
  return await new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

function sendJson(response, statusCode, payload) {
  response.status(statusCode).json(payload);
}

async function handleCommitToken(tokenWs, response) {
  const config = getWebpayConfig({ mode: "production" });
  const transaction = buildWebpayTransactionFromConfig(config);
  const commitResponse = await transaction.commit(tokenWs);
  const buyOrder = commitResponse.buy_order || "";
  const paymentRecord = buyOrder
    ? await getFirestoreDocument("webpay_pagos", buyOrder).catch(() => ({}))
    : {};
  const approved = commitResponse.status === "AUTHORIZED" && Number(commitResponse.response_code) === 0;
  const committedAt = new Date().toISOString();

  if (buyOrder) {
    await setFirestoreDocument("webpay_pagos", buyOrder, {
      status: commitResponse.status || "UNKNOWN",
      approved,
      committedAt: { __timestamp: committedAt },
      environment: "production",
      isProductionValidationTest: true,
      tokenWs,
      authorizationCode: commitResponse.authorization_code || "",
      paymentTypeCode: commitResponse.payment_type_code || "",
      installmentsNumber: Number(commitResponse.installments_number || 0),
      amount: Number(commitResponse.amount || paymentRecord.amount || 50),
      transactionDate: commitResponse.transaction_date || "",
      responseCode: Number(commitResponse.response_code ?? -1),
      cardDetail: commitResponse.card_detail || {},
      commitResponse
    });
  }

  sendJson(response, 200, {
    ok: true,
    approved,
    status: approved ? "aprobado" : "rechazado",
    raw_status: commitResponse.status || "UNKNOWN",
    buy_order: buyOrder,
    authorization_code: commitResponse.authorization_code || "",
    payment_type_code: commitResponse.payment_type_code || "",
    installments_number: Number(commitResponse.installments_number || 0),
    amount: Number(commitResponse.amount || paymentRecord.amount || 50),
    token_ws: tokenWs,
    environment: "production"
  });
}

export default async function handler(request, response) {
  try {
    if (request.method === "POST") {
      const rawBody = await readRawBody(request);
      const body = parseFormBody(rawBody);
      const tokenWs = body.token_ws || "";
      const tbkToken = body.TBK_TOKEN || body.tbk_token || "";
      const buyOrder = body.TBK_ORDEN_COMPRA || body.tbk_orden_compra || "";
      const sessionId = body.TBK_ID_SESION || body.tbk_id_sesion || "";
      const config = getWebpayConfig({ mode: "production" });
      const baseUrl = getRequestBaseUrl(request, config);

      if (tokenWs) {
        redirect(response, `${baseUrl}/pago/resultado?token_ws=${encodeURIComponent(tokenWs)}&webpay_env=production`);
        return;
      }

      if (tbkToken) {
        if (buyOrder) {
          await setFirestoreDocument("webpay_pagos", buyOrder, {
            status: "ABORTED",
            approved: false,
            committedAt: { __timestamp: new Date().toISOString() },
            environment: "production",
            isProductionValidationTest: true,
            tbkToken,
            sessionId
          }).catch(() => {});
        }

        redirect(
          response,
          `${baseUrl}/pago/resultado?TBK_TOKEN=${encodeURIComponent(tbkToken)}&TBK_ORDEN_COMPRA=${encodeURIComponent(buyOrder)}&TBK_ID_SESION=${encodeURIComponent(sessionId)}&webpay_env=production`
        );
        return;
      }

      sendJson(response, 400, { error: "No se recibio token de Webpay produccion." });
      return;
    }

    if (request.method === "GET") {
      const { token_ws: tokenWs = "", TBK_TOKEN: tbkToken = "", TBK_ORDEN_COMPRA: buyOrder = "", TBK_ID_SESION: sessionId = "" } = request.query || {};

      if (tokenWs) {
        await handleCommitToken(String(tokenWs), response);
        return;
      }

      if (tbkToken) {
        sendJson(response, 200, {
          ok: true,
          approved: false,
          status: "rechazado",
          raw_status: "ABORTED",
          buy_order: String(buyOrder || ""),
          authorization_code: "",
          payment_type_code: "",
          installments_number: 0,
          amount: 0,
          token_ws: String(tbkToken || ""),
          session_id: String(sessionId || ""),
          environment: "production"
        });
        return;
      }

      sendJson(response, 400, { error: "No se recibio token_ws para confirmar la transaccion real." });
      return;
    }

    sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error("[webpay/commit-production-test] error", {
      message: error.message,
      diagnostics: getWebpayEnvDiagnostics("production")
    });

    sendJson(response, 500, {
      error: "No se pudo confirmar la transaccion real de Webpay.",
      detail: error.message,
      diagnostics: getWebpayEnvDiagnostics("production")
    });
  }
}
