import { createFirestoreDocument, setFirestoreDocument } from "../_lib/firebase-rest.mjs";
import {
  buildWebpayTransaction,
  createBuyOrder,
  createSessionId,
  getRequestBaseUrl,
  normalizePaymentPayload
} from "../_lib/webpay.mjs";

function sendJson(response, statusCode, payload) {
  response.status(statusCode).json(payload);
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const payment = normalizePaymentPayload(request.body);
    const buyOrder = createBuyOrder();
    const sessionId = createSessionId();
    const baseUrl = getRequestBaseUrl(request);
    const returnUrl = `${baseUrl}/api/webpay/commit`;
    const transaction = buildWebpayTransaction();
    const createdAt = new Date().toISOString();

    const createResponse = await transaction.create(
      buyOrder,
      sessionId,
      payment.amount,
      returnUrl
    );

    await setFirestoreDocument("webpay_pagos", buyOrder, {
      buyOrder,
      sessionId,
      amount: payment.amount,
      returnUrl,
      tokenWs: createResponse.token,
      webpayUrl: createResponse.url,
      status: "CREATED",
      environment: "integration",
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
    }, false).catch(async () => {
      await createFirestoreDocument("webpay_pagos", {
        buyOrder,
        sessionId,
        amount: payment.amount,
        returnUrl,
        tokenWs: createResponse.token,
        webpayUrl: createResponse.url,
        status: "CREATED",
        environment: "integration",
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
      }, buyOrder);
    });

    sendJson(response, 200, {
      ok: true,
      token_ws: createResponse.token,
      url: createResponse.url,
      buy_order: buyOrder,
      session_id: sessionId,
      amount: payment.amount,
      return_url: returnUrl
    });
  } catch (error) {
    console.error("Error creating Webpay transaction:", error);
    sendJson(response, 500, {
      error: "No se pudo crear la transacción de Webpay.",
      detail: error.message
    });
  }
}
