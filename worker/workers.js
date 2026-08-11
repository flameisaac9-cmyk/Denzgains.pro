// ============================================================
// DENZGAINS PRO - CLOUDFLARE WORKER
// PesaPal API 3.0 + Cloudflare D1
// Minimum payment: KES 10
// ============================================================

const MINIMUM_KES = 10;
const MAXIMUM_KES = 10_000_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    try {
      if (url.pathname === "/api/health") {
        return json({
          success: true,
          service: "DenzGains Pro API",
          status: "online",
          currency: "KES",
          minimum_payment: MINIMUM_KES,
          pesapal_environment: env.PESAPAL_ENV || "sandbox",
          database: Boolean(env.DB),
        });
      }

      if (
        url.pathname === "/api/services" &&
        request.method === "GET"
      ) {
        return json({
          success: true,
          currency: "KES",
          minimum_payment: MINIMUM_KES,
          services: PUBLIC_SERVICES,
        });
      }

      if (
        url.pathname === "/api/payment/create" &&
        request.method === "POST"
      ) {
        return await createPayment(request, env, url);
      }

      if (
        url.pathname === "/api/payment/callback" &&
        request.method === "GET"
      ) {
        return await paymentCallback(url, env);
      }

      if (
        url.pathname === "/api/payment/ipn" &&
        (request.method === "GET" || request.method === "POST")
      ) {
        return await paymentIPN(request, env, url);
      }

      if (
        url.pathname === "/api/payment/status" &&
        request.method === "GET"
      ) {
        return await paymentStatus(url, env);
      }

      if (
        url.pathname === "/api/order" &&
        request.method === "GET"
      ) {
        return await getOrder(url, env);
      }

      return json({
        success: false,
        error: "API endpoint not found",
      }, 404);

    } catch (error) {
      console.error("Worker error:", error);

      return json({
        success: false,
        error: "Internal server error",
      }, 500);
    }
  },
};


// ============================================================
// SERVER-SIDE SERVICE CATALOGUE
//
// IMPORTANT:
// Change these prices/services to your REAL services.
//
// pricePer1K is the KES price for 1,000 units.
// ============================================================

const SERVICES = [
  {
    id: "instagram-followers",
    platform: "instagram",
    name: "Instagram Followers",
    description: "Instagram followers",
    pricePer1K: 150,
    min: 100,
    max: 100000,
  },
  {
    id: "instagram-likes",
    platform: "instagram",
    name: "Instagram Likes",
    description: "Instagram likes",
    pricePer1K: 80,
    min: 100,
    max: 100000,
  },
  {
    id: "instagram-views",
    platform: "instagram",
    name: "Instagram Views",
    description: "Instagram views",
    pricePer1K: 40,
    min: 100,
    max: 500000,
  },
  {
    id: "tiktok-followers",
    platform: "tiktok",
    name: "TikTok Followers",
    description: "TikTok followers",
    pricePer1K: 180,
    min: 100,
    max: 100000,
  },
  {
    id: "tiktok-likes",
    platform: "tiktok",
    name: "TikTok Likes",
    description: "TikTok likes",
    pricePer1K: 70,
    min: 100,
    max: 100000,
  },
  {
    id: "tiktok-views",
    platform: "tiktok",
    name: "TikTok Views",
    description: "TikTok views",
    pricePer1K: 35,
    min: 100,
    max: 500000,
  },
  {
    id: "youtube-subscribers",
    platform: "youtube",
    name: "YouTube Subscribers",
    description: "YouTube subscribers",
    pricePer1K: 300,
    min: 100,
    max: 50000,
  },
  {
    id: "youtube-views",
    platform: "youtube",
    name: "YouTube Views",
    description: "YouTube views",
    pricePer1K: 100,
    min: 100,
    max: 500000,
  },
  {
    id: "facebook-followers",
    platform: "facebook",
    name: "Facebook Followers",
    description: "Facebook followers",
    pricePer1K: 150,
    min: 100,
    max: 100000,
  },
  {
    id: "facebook-likes",
    platform: "facebook",
    name: "Facebook Likes",
    description: "Facebook likes",
    pricePer1K: 80,
    min: 100,
    max: 100000,
  },
];

const PUBLIC_SERVICES = SERVICES.map((service) => ({
  id: service.id,
  platform: service.platform,
  name: service.name,
  description: service.description,
  pricePer1K: service.pricePer1K,
  min: service.min,
  max: service.max,
}));


// ============================================================
// CREATE PAYMENT
// ============================================================

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

  const serviceId = String(body.serviceId || "").trim();
  const quantity = Number(body.quantity);

  const link = String(body.link || "").trim();

  const email = String(
    body.email || "customer@example.com"
  ).trim();

  const phone = normalizeKenyanPhone(
    String(body.phone || "").trim()
  );

  const firstName = sanitizeName(
    body.firstName || "Customer"
  );

  const lastName = sanitizeName(
    body.lastName || ""
  );

  if (!serviceId) {
    return json({
      success: false,
      error: "Service is required",
    }, 400);
  }

  if (!Number.isInteger(quantity)) {
    return json({
      success: false,
      error: "Quantity must be a whole number",
    }, 400);
  }

  const service = SERVICES.find(
    (item) => item.id === serviceId
  );

  if (!service) {
    return json({
      success: false,
      error: "Invalid service",
    }, 400);
  }

  if (quantity < service.min) {
    return json({
      success: false,
      error: `Minimum quantity is ${service.min}`,
    }, 400);
  }

  if (quantity > service.max) {
    return json({
      success: false,
      error: `Maximum quantity is ${service.max}`,
    }, 400);
  }

  if (!link || link.length < 5 || link.length > 1000) {
    return json({
      success: false,
      error: "A valid service link is required",
    }, 400);
  }

  if (!isValidEmail(email)) {
    return json({
      success: false,
      error: "Invalid email address",
    }, 400);
  }

  if (!phone) {
    return json({
      success: false,
      error: "Valid Kenyan phone number is required",
    }, 400);
  }

  // ----------------------------------------------------------
  // SERVER-SIDE PRICE CALCULATION
  // ----------------------------------------------------------

  const amount = calculatePrice(
    service.pricePer1K,
    quantity
  );

  if (amount < MINIMUM_KES) {
    return json({
      success: false,
      error: `Minimum payment is KES ${MINIMUM_KES}`,
      minimum_payment: MINIMUM_KES,
    }, 400);
  }

  if (amount > MAXIMUM_KES) {
    return json({
      success: false,
      error: "Payment amount is too large",
    }, 400);
  }

  // ----------------------------------------------------------
  // PesaPal token
  // ----------------------------------------------------------

  const token = await getPesapalToken(env);

  // ----------------------------------------------------------
  // Unique merchant reference
  // ----------------------------------------------------------

  const merchantReference =
    "DG-" +
    Date.now().toString(36).toUpperCase() +
    "-" +
    crypto.randomUUID()
      .replaceAll("-", "")
      .slice(0, 8)
      .toUpperCase();

  const callbackUrl =
    env.PESAPAL_CALLBACK_URL ||
    `${url.origin}/api/payment/callback`;

  const ipnUrl =
    env.PESAPAL_IPN_URL ||
    `${url.origin}/api/payment/ipn`;

  if (!env.PESAPAL_IPN_ID) {
    return json({
      success: false,
      error: "PESAPAL_IPN_ID is not configured",
    }, 500);
  }

  // ----------------------------------------------------------
  // Submit order to PesaPal
  // ----------------------------------------------------------

  const pesapalResponse = await fetch(
    `${pesapalBase(env)}/api/Transactions/SubmitOrderRequest`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: merchantReference,
        currency: "KES",
        amount: Number(amount.toFixed(2)),
        description:
          `${service.name} - ${quantity.toLocaleString()} units`
            .slice(0, 100),

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

  const pesapalData =
    await safeJson(pesapalResponse);

  if (
    !pesapalResponse.ok ||
    !pesapalData.redirect_url
  ) {
    console.error(
      "PesaPal SubmitOrderRequest error:",
      pesapalData
    );

    return json({
      success: false,
      error: "Unable to create PesaPal payment",
    }, 502);
  }

  // ----------------------------------------------------------
  // Save order BEFORE returning checkout URL
  // ----------------------------------------------------------

  if (env.DB) {
    await env.DB.prepare(`
      INSERT INTO orders (
        merchant_reference,
        order_tracking_id,
        service_id,
        service_name,
        platform,
        quantity,
        target_link,
        amount,
        currency,
        email,
        phone,
        first_name,
        last_name,
        status,
        provider_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        merchantReference,
        pesapalData.order_tracking_id || null,
        service.id,
        service.name,
        service.platform,
        quantity,
        link,
        amount,
        "KES",
        email,
        phone,
        firstName,
        lastName,
        "PENDING_PAYMENT",
        null
      )
      .run();
  }

  return json({
    success: true,
    merchant_reference: merchantReference,
    order_tracking_id:
      pesapalData.order_tracking_id || null,
    redirect_url: pesapalData.redirect_url,
    amount,
    currency: "KES",
    service: service.name,
    quantity,
    message: "Payment created successfully",
  });
}


// ============================================================
// PRICE CALCULATOR
// ============================================================

function calculatePrice(pricePer1K, quantity) {
  const raw = (pricePer1K / 1000) * quantity;

  // Round UP to cents
  const rounded =
    Math.ceil(raw * 100) / 100;

  return Math.max(
    rounded,
    MINIMUM_KES
  );
}


// ============================================================
// PesaPal AUTHENTICATION
// ============================================================

async function getPesapalToken(env) {
  if (!env.PESAPAL_CONSUMER_KEY) {
    throw new Error(
      "PESAPAL_CONSUMER_KEY is missing"
    );
  }

  if (!env.PESAPAL_CONSUMER_SECRET) {
    throw new Error(
      "PESAPAL_CONSUMER_SECRET is missing"
    );
  }

  const response = await fetch(
    `${pesapalBase(env)}/api/Auth/RequestToken`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        consumer_key:
          env.PESAPAL_CONSUMER_KEY,

        consumer_secret:
          env.PESAPAL_CONSUMER_SECRET,
      }),
    }
  );

  const data =
    await safeJson(response);

  if (!response.ok || !data.token) {
    console.error(
      "PesaPal authentication error:",
      data
    );

    throw new Error(
      data.message ||
      "PesaPal authentication failed"
    );
  }

  return data.token;
}


// ============================================================
// CALLBACK
// ============================================================

async function paymentCallback(url, env) {
  const orderTrackingId =
    url.searchParams.get(
      "OrderTrackingId"
    );

  const merchantReference =
    url.searchParams.get(
      "OrderMerchantReference"
    );

  if (!orderTrackingId) {
    return new Response(
      "Missing OrderTrackingId",
      {
        status: 400,
        headers: {
          "Content-Type":
            "text/plain; charset=UTF-8",
        },
      }
    );
  }

  let payment = null;

  try {
    payment =
      await getTransactionStatus(
        orderTrackingId,
        env
      );
  } catch (error) {
    console.error(
      "Callback verification error:",
      error
    );
  }

  const reference =
    merchantReference ||
    await findMerchantReference(
      orderTrackingId,
      env
    );

  if (reference && payment) {
    await updateOrderFromPayment(
      reference,
      orderTrackingId,
      payment,
      env
    );
  }

  const frontend =
    env.FRONTEND_URL ||
    url.origin;

  const redirect =
    new URL(
      `${frontend.replace(/\/$/, "")}/payment-result.html`
    );

  if (reference) {
    redirect.searchParams.set(
      "reference",
      reference
    );
  }

  redirect.searchParams.set(
    "orderTrackingId",
    orderTrackingId
  );

  redirect.searchParams.set(
    "status",
    normalizePaymentStatus(
      payment?.payment_status_description ||
      payment?.payment_status ||
      "PENDING"
    )
  );

  return Response.redirect(
    redirect.toString(),
    302
  );
}


// ============================================================
// IPN
// ============================================================

async function paymentIPN(request, env, url) {
  let params =
    new URLSearchParams(
      url.searchParams
    );

  if (request.method === "POST") {
    const contentType =
      request.headers.get(
        "content-type"
      ) || "";

    if (
      contentType.includes(
        "application/json"
      )
    ) {
      try {
        const data =
          await request.json();

        for (
          const [key, value]
          of Object.entries(data)
        ) {
          params.set(
            key,
            String(value)
          );
        }
      } catch {
        // Continue with query params
      }
    }
  }

  const orderTrackingId =
    params.get(
      "OrderTrackingId"
    );

  let merchantReference =
    params.get(
      "OrderMerchantReference"
    );

  if (!orderTrackingId) {
    return json({
      success: false,
      error: "Missing OrderTrackingId",
    }, 400);
  }

  if (!merchantReference) {
    merchantReference =
      await findMerchantReference(
        orderTrackingId,
        env
      );
  }

  let payment;

  try {
    payment =
      await getTransactionStatus(
        orderTrackingId,
        env
      );
  } catch (error) {
    console.error(
      "IPN verification error:",
      error
    );

    return json({
      success: false,
      error: "Unable to verify payment",
    }, 500);
  }

  if (merchantReference) {
    await updateOrderFromPayment(
      merchantReference,
      orderTrackingId,
      payment,
      env
    );
  }

  return json({
    success: true,
    received: true,
    merchant_reference:
      merchantReference,
    order_tracking_id:
      orderTrackingId,
    payment_status:
      payment.payment_status_description ||
      payment.payment_status ||
      "PENDING",
  });
}


// ============================================================
// PAYMENT STATUS
// ============================================================

async function paymentStatus(url, env) {
  const trackingId =
    url.searchParams.get(
      "orderTrackingId"
    );

  const reference =
    url.searchParams.get(
      "reference"
    );

  if (!trackingId && !reference) {
    return json({
      success: false,
      error:
        "orderTrackingId or reference is required",
    }, 400);
  }

  let payment = null;
  let order = null;

  if (trackingId) {
    payment =
      await getTransactionStatus(
        trackingId,
        env
      );
  }

  if (env.DB) {
    if (reference) {
      order =
        await env.DB.prepare(`
          SELECT *
          FROM orders
          WHERE merchant_reference = ?
          LIMIT 1
        `)
          .bind(reference)
          .first();
    } else if (trackingId) {
      order =
        await env.DB.prepare(`
          SELECT *
          FROM orders
          WHERE order_tracking_id = ?
          LIMIT 1
        `)
          .bind(trackingId)
          .first();
    }
  }

  return json({
    success: true,
    payment,
    order,
  });
}


// ============================================================
// PUBLIC ORDER LOOKUP
// ============================================================

async function getOrder(url, env) {
  const reference =
    url.searchParams.get(
      "reference"
    );

  if (!reference) {
    return json({
      success: false,
      error: "reference is required",
    }, 400);
  }

  if (!env.DB) {
    return json({
      success: false,
      error: "Database is not configured",
    }, 500);
  }

  const order =
    await env.DB.prepare(`
      SELECT
        merchant_reference,
        order_tracking_id,
        service_name,
        platform,
        quantity,
        amount,
        currency,
        status,
        provider_status,
        created_at,
        updated_at
      FROM orders
      WHERE merchant_reference = ?
      LIMIT 1
    `)
      .bind(reference)
      .first();

  if (!order) {
    return json({
      success: false,
      error: "Order not found",
    }, 404);
  }

  return json({
    success: true,
    order,
  });
}


// ============================================================
// UPDATE D1 FROM VERIFIED PesaPal STATUS
// ============================================================

async function updateOrderFromPayment(
  merchantReference,
  orderTrackingId,
  payment,
  env
) {
  if (!env.DB) {
    return;
  }

  const paymentStatus =
    normalizePaymentStatus(
      payment?.payment_status_description ||
      payment?.payment_status ||
      "PENDING"
    );

  let orderStatus =
    "PENDING_PAYMENT";

  if (
    paymentStatus === "COMPLETED"
  ) {
    orderStatus = "PAID";
  } else if (
    paymentStatus === "FAILED"
  ) {
    orderStatus = "PAYMENT_FAILED";
  } else if (
    paymentStatus === "REVERSED"
  ) {
    orderStatus = "REVERSED";
  } else if (
    paymentStatus === "CANCELLED"
  ) {
    orderStatus = "CANCELLED";
  }

  await env.DB.prepare(`
    UPDATE orders
    SET
      order_tracking_id = ?,
      status = ?,
      provider_status = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE merchant_reference = ?
  `)
    .bind(
      orderTrackingId,
      orderStatus,
      paymentStatus,
      merchantReference
    )
    .run();
}


// ============================================================
// FIND MERCHANT REFERENCE
// ============================================================

async function findMerchantReference(
  orderTrackingId,
  env
) {
  if (!env.DB) {
    return null;
  }

  const result =
    await env.DB.prepare(`
      SELECT merchant_reference
      FROM orders
      WHERE order_tracking_id = ?
      LIMIT 1
    `)
      .bind(orderTrackingId)
      .first();

  return result?.merchant_reference ||
    null;
}


// ============================================================
// PesaPal TRANSACTION STATUS
// ============================================================

async function getTransactionStatus(
  orderTrackingId,
  env
) {
  const token =
    await getPesapalToken(env);

  const response =
    await fetch(
      `${pesapalBase(env)}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type":
            "application/json",
          Authorization:
            `Bearer ${token}`,
        },
      }
    );

  const data =
    await safeJson(response);

  if (!response.ok) {
    throw new Error(
      data.message ||
      "Unable to retrieve transaction status"
    );
  }

  return data;
}


// ============================================================
// NORMALIZE PesaPal STATUS
// ============================================================

function normalizePaymentStatus(status) {
  const value =
    String(status || "")
      .trim()
      .toUpperCase();

  if (
    value.includes("COMPLETED") ||
    value.includes("SUCCESS")
  ) {
    return "COMPLETED";
  }

  if (
    value.includes("FAILED") ||
    value.includes("INVALID")
  ) {
    return "FAILED";
  }

  if (
    value.includes("CANCEL")
  ) {
    return "CANCELLED";
  }

  if (
    value.includes("REVERSE")
  ) {
    return "REVERSED";
  }

  return "PENDING";
}


// ============================================================
// PesaPal ENVIRONMENT
// ============================================================

function pesapalBase(env) {
  const environment =
    String(
      env.PESAPAL_ENV ||
      "sandbox"
    ).toLowerCase();

  if (
    environment === "production" ||
    environment === "live"
  ) {
    return "https://pay.pesapal.com/v3";
  }

  return "https://cybqa.pesapal.com/pesapalv3";
}


// ============================================================
// HELPERS
// ============================================================

function normalizeKenyanPhone(phone) {
  let value =
    phone.replace(
      /[\s\-()]/g,
      ""
    );

  if (
    value.startsWith("07") &&
    value.length === 10
  ) {
    return "254" +
      value.slice(1);
  }

  if (
    value.startsWith("01") &&
    value.length === 10
  ) {
    return "254" +
      value.slice(1);
  }

  if (
    value.startsWith("+254") &&
    value.length === 13
  ) {
    return value.slice(1);
  }

  if (
    value.startsWith("254") &&
    value.length === 12
  ) {
    return value;
  }

  return null;
}


function sanitizeName(value) {
  return String(value || "")
    .replace(
      /[^a-zA-ZÀ-ÿ' -]/g,
      ""
    )
    .trim()
    .slice(0, 50);
}


function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    .test(email);
}


async function safeJson(response) {
  const text =
    await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text
    };
  }
}


function json(data, status = 200) {
  return new Response(
    JSON.stringify(
      data,
      null,
      2
    ),
    {
      status,
      headers: {
        "Content-Type":
          "application/json; charset=UTF-8",
        ...corsHeaders,
      },
    }
  );
}
