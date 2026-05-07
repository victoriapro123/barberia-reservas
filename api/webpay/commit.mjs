import { getFirestoreDocument, setFirestoreDocument } from "../_lib/firebase-rest.mjs";
import { BRAND_CONFIG } from "../../brand-config.mjs";
import {
  buildWebpayTransactionFromConfig,
  getPaymentStatusLabel,
  getRequestBaseUrl,
  getWebpayConfig
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

function getModeFromRequest(request) {
  const mode = String(request.query?.webpay_env || "").trim().toLowerCase();
  return mode === "production" ? "production" : "integration";
}

async function ensureOrderDocument(buyOrder, paymentRecord, commitResponse) {
  const order = paymentRecord.order || {};
  const customer = paymentRecord.customer || {};
  const createdAt = paymentRecord.createdAt || new Date().toISOString();

  await setFirestoreDocument("solicitudes_reserva", buyOrder, {
    barbero: BRAND_CONFIG.name,
    fecha: "Pagado por Webpay",
    fechaISO: "",
    hora: "A coordinar",
    nombre: customer.nombre || "Cliente webpay",
    correo: customer.correo || "",
    telefono: customer.telefono || "",
    servicio: `Pack ${order.pack || "Flor de Loto"}: ${order.planta || "Selección personalizada"}`,
    estado: "pendiente",
    creadoEn: { __timestamp: createdAt },
    notaInterna: [
      `Pedido Webpay aprobado`,
      `Planta: ${order.planta || "Sin dato"}`,
      `Macetero: ${order.macetero || "Sin dato"}`,
      `Globo: ${order.globo || "Sin dato"}`,
      `Delivery: ${order.delivery ? "Sí" : "No"}`,
      order.direccion ? `Dirección: ${order.direccion}` : "",
      order.observaciones ? `Observaciones: ${order.observaciones}` : "",
      `Total: ${order.total || paymentRecord.amount || 0}`,
      `Buy order: ${buyOrder}`,
      `Authorization: ${commitResponse.authorization_code || "Sin código"}`
    ].filter(Boolean).join("\n"),
    tipoSolicitud: "pedido_vivero",
    pedido: {
      tipo: "pedido_vivero",
      pack: order.pack || "",
      planta: order.planta || "",
      macetero: order.macetero || "",
      globo: order.globo || "",
      delivery: Boolean(order.delivery),
      deliveryExtra: Number(order.deliveryExtra || 0),
      total: Number(order.total || paymentRecord.amount || 0),
      direccion: order.direccion || "",
      observaciones: order.observaciones || ""
    },
    pago: {
      proveedor: "webpay_plus",
      estado: commitResponse.status || "UNKNOWN",
      estadoVisual: getPaymentStatusLabel(commitResponse),
      tokenWs: paymentRecord.tokenWs || "",
      authorizationCode: commitResponse.authorization_code || "",
      paymentTypeCode: commitResponse.payment_type_code || "",
      installmentsNumber: Number(commitResponse.installments_number || 0),
      amount: Number(commitResponse.amount || paymentRecord.amount || 0),
      transactionDate: commitResponse.transaction_date || "",
      responseCode: Number(commitResponse.response_code ?? -1)
    }
  });
}

async function handleCommitToken(tokenWs, response, webpayMode = "integration") {
  const config = getWebpayConfig({ mode: webpayMode });
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
      environment: webpayMode,
      tokenWs,
      authorizationCode: commitResponse.authorization_code || "",
      paymentTypeCode: commitResponse.payment_type_code || "",
      installmentsNumber: Number(commitResponse.installments_number || 0),
      amount: Number(commitResponse.amount || paymentRecord.amount || 0),
      transactionDate: commitResponse.transaction_date || "",
      responseCode: Number(commitResponse.response_code ?? -1),
      cardDetail: commitResponse.card_detail || {},
      commitResponse
    });

    if (approved) {
      await ensureOrderDocument(buyOrder, paymentRecord, commitResponse);
    }
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
    amount: Number(commitResponse.amount || paymentRecord.amount || 0),
    token_ws: tokenWs,
    environment: webpayMode
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
      const webpayMode = getModeFromRequest(request);
      const config = getWebpayConfig({ mode: webpayMode });
      const baseUrl = getRequestBaseUrl(request, config);

      if (tokenWs) {
        redirect(response, `${baseUrl}/pago/resultado?token_ws=${encodeURIComponent(tokenWs)}&webpay_env=${encodeURIComponent(webpayMode)}`);
        return;
      }

      if (tbkToken) {
        if (buyOrder) {
          await setFirestoreDocument("webpay_pagos", buyOrder, {
            status: "ABORTED",
            approved: false,
            committedAt: { __timestamp: new Date().toISOString() },
            environment: webpayMode,
            tbkToken,
            sessionId
          }).catch(() => {});
        }

        redirect(
          response,
          `${baseUrl}/pago/resultado?TBK_TOKEN=${encodeURIComponent(tbkToken)}&TBK_ORDEN_COMPRA=${encodeURIComponent(buyOrder)}&TBK_ID_SESION=${encodeURIComponent(sessionId)}&webpay_env=${encodeURIComponent(webpayMode)}`
        );
        return;
      }

      sendJson(response, 400, { error: "No se recibió token de Webpay." });
      return;
    }

    if (request.method === "GET") {
      const { token_ws: tokenWs = "", TBK_TOKEN: tbkToken = "", TBK_ORDEN_COMPRA: buyOrder = "", TBK_ID_SESION: sessionId = "", format = "" } = request.query || {};
      const webpayMode = getModeFromRequest(request);
      const config = getWebpayConfig({ mode: webpayMode });
      const baseUrl = getRequestBaseUrl(request, config);

      if (tokenWs) {
        if (String(format).toLowerCase() !== "json") {
          redirect(response, `${baseUrl}/pago/resultado?token_ws=${encodeURIComponent(String(tokenWs))}&webpay_env=${encodeURIComponent(webpayMode)}`);
          return;
        }

        await handleCommitToken(String(tokenWs), response, webpayMode);
        return;
      }

      if (tbkToken) {
        if (String(format).toLowerCase() !== "json") {
          redirect(
            response,
            `${baseUrl}/pago/resultado?TBK_TOKEN=${encodeURIComponent(String(tbkToken))}&TBK_ORDEN_COMPRA=${encodeURIComponent(String(buyOrder || ""))}&TBK_ID_SESION=${encodeURIComponent(String(sessionId || ""))}&webpay_env=${encodeURIComponent(webpayMode)}`
          );
          return;
        }

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
          environment: webpayMode
        });
        return;
      }

      sendJson(response, 400, { error: "No se recibió token_ws para confirmar la transacción." });
      return;
    }

    sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error("Error committing Webpay transaction:", error);
    sendJson(response, 500, {
      error: "No se pudo confirmar la transacción de Webpay.",
      detail: error.message
    });
  }
}
