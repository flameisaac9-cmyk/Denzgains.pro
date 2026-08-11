// DenzGains Pro - Cloudflare Worker
// PesaPal API 3.0 + D1
// Minimum payment: KES 10

const MINIMUM_KES = 10;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    try {
      // --------------------------------------------------
      // HEALTH CHECK
      // --------------------------------------------------
      if (url.pathname === "/api/health") {
        return json({
          success: true,
          service: "DenzGains Pro API",
          status: "online",
          currency: env.CURRENCY_DEFAULT || "KES",
          minimum_payment: MINIMUM_KES,
          pesapal_environment: env.PESAPAL_ENV || "sandbox",
        });
      }

      // --------------------------------------------------
      // CREATE PAYMENT
      // POST /api/payment/create
      // --------------------------------------------------
      if (
        url.pathname === "/api/payment/create" &&
        request.method === "POST"
      ) {
        return await createPayment(request, env, url);
      }

      // --------------------------------------------------
      // PAYMENT CALLBACK
      // PesaPal redirects customer here after payment
      // --------------------------------------------------
      if (url.pathname === "/api/payment/callback") {
        return await paymentCallback(url, env);
      }

      // --------------------------------------------------
      // PesaPal IPN
      // --------------------------------------------------
      if (url.pathname === "/api/payment/ipn") {
        return await paymentIPN(request, env, url);
      }

      // --------------------------------------------------
      // CHECK PAYMENT STATUS
      // GET /api/payment/status?orderTrackingId=...
      // --------------------------------------------------
      if (
        url.pathname === "/api/payment/status" &&
        request.method === "GET"
      ) {
        return await paymentStatus(url, env);
      }

      // --------------------------------------------------
      // DEFAULT
      // --------------------------------------------------
      return json({
        success: false,
        error: "API endpoint not found",
        available_endpoints: [
          "/api/health",
          "/api/payment/create",
          "/api/payment/callback",
          "/api/payment/ipn",
          "/api/payment/status",
        ],
      }, 404);

    } catch (error) {
      console.error("Worker error:", error);

      return json({
        success: false,
        error: "Internal server error",
        message: error.message,
      }, 500);
    }
  },
};


// ======================================================
// CREATE PESA PAL PAYMENT
// ======================================================

async function createPayment(request, env, url) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json({
      success: false,
      error: "Invalid JSON request",
    }, 400);
  }

  const amount = Number(body.amount);
  const description = String(
    body.description || "DenzGains Pro Service"
  ).slice(0, 100);

  const email = String(
    body.email || "customer@example.com"
  ).trim();

  const phone = String(
    body.phone || ""
  ).trim();

  const firstName = String(
    body.firstName || body.first_name || "Customer"
  ).trim();

  const lastName = String(
    body.lastName || body.last_name || ""
  ).trim();

  // --------------------------------------------------
  // Validate amount
  // --------------------------------------------------

  if (!Number.isFinite(amount)) {
    return json({
      success: false,
      error: "Invalid payment amount",
    }, 400);
  }

  if (amount < MINIMUM_KES) {
    return json({
      success: false,
      error: `Minimum payment is KES ${MINIMUM_KES}`,
      minimum_payment: MINIMUM_KES,
    }, 400);
  }

  if (amount > 10000000) {
    return json({
      success: false,
      error: "Payment amount is too large",
    }, 400);
  }

  // --------------------------------------------------
  // Get PesaPal token
  // --------------------------------------------------

  const token = await getPesapalToken(env);

  // --------------------------------------------------
  // Generate unique merchant reference
  // --------------------------------------------------

  const merchantReference =
    "DG-" +
    Date.now().toString(36).toUpperCase() +
    "-" +
    crypto.randomUUID().slice(0, 8).toUpperCase();

  // --------------------------------------------------
  // Callback + IPN URLs
  // --------------------------------------------------

  const callbackUrl =
    env.PESAPAL_CALLBACK_URL ||
    `${url.origin}/api/payment/callback`;

  const ipnUrl =
    env.PESAPAL_IPN_URL ||
    `${url.origin}/api/payment/ipn`;

  if (!env.PESAPAL_IPN_ID) {
    return json({
      success: false,
      error:
        "PESAPAL_IPN_ID is not configured. Register your IPN URL with PesaPal first.",
    }, 500);
  }

  // --------------------------------------------------
  // Submit order to PesaPal
  // --------------------------------------------------

  const response = await fetch(
    `${pesapalBase(env)}/api/Transactions/SubmitOrderRequest`,
    {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },

      body: JSON.stringify({
        id: merchantReference,
        currency: env.CURRENCY_DEFAULT || "KES",
        amount: Number(amount.toFixed(2)),
        description,

        callback_url: callbackUrl,

        cancellation_url:
          env.PESAPAL_CANCEL_URL ||
          `${url.origin}/payment-cancelled`,

        notification_id: env.PESAPAL_IPN_ID,

        redirect_mode: "TOP_WINDOW",

        billing_address: {
          email_address: email,
          phone_number: phone,
          country_code: "KE",
          first_name: firstName,
          middle_name: "",
          last_name: lastName,
          line_1: "",
          line_2: "",
          city: "",
          state: "",
          postal_code: "",
          zip_code: "",
        },
      }),
    }
  );

  const result = await response.json();

  if (!response.ok || !result.redirect_url) {
    console.error("PesaPal SubmitOrderRequest error:", result);

    return json({
      success: false,
      error: "Unable to create PesaPal payment",
      pesapal_response: result,
    }, 502);
  }

  // --------------------------------------------------
  // Save order to D1 if DB is available
  // --------------------------------------------------

  if (env.DB) {
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          merchant_reference TEXT UNIQUE,
          order_tracking_id TEXT,
          amount REAL,
          currency TEXT,
          description TEXT,
          email TEXT,
          phone TEXT,
          first_name TEXT,
          last_name TEXT,
          status TEXT DEFAULT 'PENDING',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      await env.DB.prepare(`
        INSERT INTO payments (
          merchant_reference,
          order_tracking_id,
          amount,
          currency,
          description,
          email,
          phone,
          first_name,
          last_name,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        merchantReference,
        result.order_tracking_id || null,
        amount,
        env.CURRENCY_DEFAULT || "KES",
        description,
        email,
        phone,
        firstName,
        lastName,
        "PENDING"
      ).run();

    } catch (dbError) {
      console.error("D1 save error:", dbError);
      // Payment was still created, so don't fail the customer request.
    }
  }

  // --------------------------------------------------
  // Return payment URL to frontend
  // --------------------------------------------------

  return json({
    success: true,

    merchant_reference: merchantReference,

    order_tracking_id:
      result.order_tracking_id || null,

    redirect_url: result.redirect_url,

    amount: Number(amount.toFixed(2)),

    currency: env.CURRENCY_DEFAULT || "KES",

    message: "Payment created successfully",
  });
}


// ======================================================
// GET PESA PAL TOKEN
// ======================================================

async function getPesapalToken(env) {
  if (!env.PESAPAL_CONSUMER_KEY) {
    throw new Error("PESAPAL_CONSUMER_KEY is missing");
  }

  if (!env.PESAPAL_CONSUMER_SECRET) {
    throw new Error("PESAPAL_CONSUMER_SECRET is missing");
  }

  const response = await fetch(
    `${pesapalBase(env)}/api/Auth/RequestToken`,
    {
      method: "POST",

      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        consumer_key: env.PESAPAL_CONSUMER_KEY,
        consumer_secret: env.PESAPAL_CONSUMER_SECRET,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.token) {
    console.error("PesaPal authentication error:", data);

    throw new Error(
      data.message ||
      "PesaPal authentication failed"
    );
  }

  return data.token;
}


// ======================================================
// PAYMENT CALLBACK
// ======================================================

async function paymentCallback(url, env) {
  const orderTrackingId =
    url.searchParams.get("OrderTrackingId");

  const merchantReference =
    url.searchParams.get("OrderMerchantReference");

  if (!orderTrackingId) {
    return new Response(
      "Missing OrderTrackingId",
      {
        status: 400,
        headers: {
          "Content-Type": "text/plain",
        },
      }
    );
  }

  // Check actual payment status with PesaPal
  let payment;

  try {
    payment = await getTransactionStatus(
      orderTrackingId,
      env
    );
  } catch (error) {
    console.error("Callback status error:", error);
  }

  if (env.DB && merchantReference) {
    try {
      await env.DB.prepare(`
        UPDATE payments
        SET
          status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE merchant_reference = ?
      `).bind(
        payment?.payment_status || "PENDING",
        merchantReference
      ).run();
    } catch (error) {
      console.error("Callback DB update error:", error);
    }
  }

  // Redirect customer back to your website
  const frontend =
    env.FRONTEND_URL ||
    `${url.origin}`;

  const redirect = new URL(
    `${frontend.replace(/\/$/, "")}/payment-result`
  );

  if (merchantReference) {
    redirect.searchParams.set(
      "reference",
      merchantReference
    );
  }

  if (orderTrackingId) {
    redirect.searchParams.set(
      "orderTrackingId",
      orderTrackingId
    );
  }

  redirect.searchParams.set(
    "status",
    payment?.payment_status || "PENDING"
  );

  return Response.redirect(
    redirect.toString(),
    302
  );
}


// ======================================================
// PESA PAL IPN
// ======================================================

async function paymentIPN(request, env, url) {
  let params = url.searchParams;

  // PesaPal can send GET or POST depending on registration.
  if (request.method === "POST") {
    const contentType =
      request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      try {
        const data = await request.json();

        if (data.OrderTrackingId) {
          params = new URLSearchParams();

          for (const [key, value] of Object.entries(data)) {
            params.set(key, String(value));
          }
        }
      } catch {
        // Keep query parameters if JSON parsing fails.
      }
    }
  }

  const orderTrackingId =
    params.get("OrderTrackingId");

  const merchantReference =
    params.get("OrderMerchantReference");

  if (!orderTrackingId) {
    return json({
      success: false,
      error: "Missing OrderTrackingId",
    }, 400);
  }

  let payment;

  try {
    payment = await getTransactionStatus(
      orderTrackingId,
      env
    );
  } catch (error) {
    console.error("IPN status error:", error);

    return json({
      success: false,
      error: "Unable to verify payment",
    }, 500);
  }

  if (env.DB && merchantReference) {
    try {
      await env.DB.prepare(`
        UPDATE payments
        SET
          status = ?,
          order_tracking_id = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE merchant_reference = ?
      `).bind(
        payment.payment_status || "PENDING",
        orderTrackingId,
        merchantReference
      ).run();

    } catch (error) {
      console.error("IPN database update error:", error);
    }
  }

  // PesaPal IPN is now processed.
  return json({
    success: true,
    received: true,
    merchant_reference: merchantReference,
    order_tracking_id: orderTrackingId,
    payment_status:
      payment.payment_status || "PENDING",
  });
}


// ======================================================
// CHECK PESA PAL TRANSACTION STATUS
// ======================================================

async function paymentStatus(url, env) {
  const orderTrackingId =
    url.searchParams.get("orderTrackingId");

  if (!orderTrackingId) {
    return json({
      success: false,
      error: "orderTrackingId is required",
    }, 400);
  }

  const payment = await getTransactionStatus(
    orderTrackingId,
    env
  );

  return json({
    success: true,
    payment,
  });
}


// ======================================================
// PESA PAL TRANSACTION STATUS API
// ======================================================

async function getTransactionStatus(
  orderTrackingId,
  env
) {
  const token = await getPesapalToken(env);

  const response = await fetch(
    `${pesapalBase(env)}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
    {
      method: "GET",

      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message ||
      "Unable to retrieve PesaPal transaction status"
    );
  }

  return data;
}


// ======================================================
// PESA PAL BASE URL
// ======================================================

function pesapalBase(env) {
  const environment =
    String(env.PESAPAL_ENV || "sandbox")
      .toLowerCase();

  if (
    environment === "production" ||
    environment === "live"
  ) {
    return "https://pay.pesapal.com/v3";
  }

  return "https://cybqa.pesapal.com/pesapalv3";
}


// ======================================================
// JSON RESPONSE HELPER
// ======================================================

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,

      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        ...corsHeaders,
      },
    }
  );
    }
