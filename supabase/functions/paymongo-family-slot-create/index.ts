  import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };

  const FREE_FAMILY_SLOT_COUNT = 1;
  const MAX_FAMILY_SLOT_COUNT = 4;

  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const firstString = (...values: unknown[]) => {
    for (const value of values) {
      const text = String(value ?? "").trim();
      if (text) return text;
    }
    return "";
  };

  const toNumber = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const maybeObject = (value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const replaceOwnerReference = (
    remarks: string,
    ownerUserId: string,
    ownerName: string,
  ) => {
    if (!remarks) return "";
    if (!ownerName) return remarks;

    let nextRemarks = remarks;
    if (ownerUserId) {
      nextRemarks = nextRemarks.replace(
        new RegExp(`Owner\\s+${escapeRegExp(ownerUserId)}`, "gi"),
        ownerName,
      );
      nextRemarks = nextRemarks.replace(
        new RegExp(escapeRegExp(ownerUserId), "g"),
        ownerName,
      );
    }

    return nextRemarks;
  };

  const getPaymongoSecretKey = () =>
    firstString(
      Deno.env.get("PAYMONGO_SECRET_KEY"),
      Deno.env.get("PAYMONGO_SECRET_API_KEY"),
      Deno.env.get("PAYMONGO_TEST_SECRET_KEY"),
      Deno.env.get("PAYMONGO_LIVE_SECRET_KEY"),
    );

  const buildBasicAuthHeader = (secretKey: string) =>
    `Basic ${btoa(`${secretKey}:`)}`;

  const normalizeMethod = (value: unknown) => {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (!normalized) return "";
    if (normalized === "maya") return "paymaya";
    return normalized;
  };

  const getAllowedMethods = (values: unknown) => {
    const supported = new Set([
      "card",
      "gcash",
      "paymaya",
      "grab_pay",
      "qrph",
    ]);
    const requested = Array.isArray(values) ? values : [];
    const normalized = requested
      .map(normalizeMethod)
      .filter((method) => supported.has(method));

    return normalized.length > 0 ? Array.from(new Set(normalized)) : ["qrph"];
  };

  serve(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const amountPhp = toNumber(body.amount);
    if (amountPhp <= 0) {
      return json({ error: "Amount must be greater than zero" }, 400);
    }

    const metadata = maybeObject(body.metadata);
    const currentTotalSlots = Math.max(
      FREE_FAMILY_SLOT_COUNT,
      Math.floor(
        toNumber(
          metadata.currentTotalSlots ??
            metadata.current_total_slots ??
            body.currentTotalSlots ??
            body.current_total_slots,
          FREE_FAMILY_SLOT_COUNT,
        ),
      ),
    );
    const ownerUserId = firstString(
      body.ownerUserId,
      body.ownerId,
      metadata.ownerUserId,
      metadata.ownerId,
      metadata.userId,
      metadata.tenantId,
    );
    const ownerName = firstString(
      body.ownerName,
      body.owner_name,
      metadata.ownerName,
      metadata.owner_name,
    );
    const slots = Math.max(1, Math.floor(toNumber(metadata.slots ?? body.slots, 1)));
    const remainingPurchasableSlots = Math.max(
      0,
      MAX_FAMILY_SLOT_COUNT - currentTotalSlots,
    );
    if (remainingPurchasableSlots <= 0) {
      return json(
        {
          error: `Maximum of ${MAX_FAMILY_SLOT_COUNT} family slots reached.`,
          maxTotalSlots: MAX_FAMILY_SLOT_COUNT,
        },
        400,
      );
    }

    if (slots > remainingPurchasableSlots) {
      return json(
        {
          error: `Only ${remainingPurchasableSlots} more family slot(s) can be purchased.`,
          maxTotalSlots: MAX_FAMILY_SLOT_COUNT,
          remainingPurchasableSlots,
        },
        400,
      );
    }
    const description =
      firstString(body.description) || "Family Slot Subscription";
    const defaultRemarks = ownerName
      ? `${ownerName} bought ${slots} family slot(s)`
      : description;
    const remarks =
      replaceOwnerReference(firstString(body.remarks), ownerUserId, ownerName) ||
      defaultRemarks;
    const successUrl = firstString(
      body.successUrl,
      body.success_url,
      body.returnUrl,
      body.return_url,
      body.redirectUrl,
      body.redirect_url,
    );
    const cancelUrl = firstString(body.cancelUrl, body.cancel_url, successUrl);
    const allowedMethods = getAllowedMethods(body.allowedMethods);
    const normalizedMetadata = {
      ...metadata,
      currentTotalSlots,
      maxTotalSlots: MAX_FAMILY_SLOT_COUNT,
      ...(ownerName
        ? {
            ownerName,
            owner_name: ownerName,
          }
        : {}),
    };

    if (!successUrl) {
      return json({ error: "Missing success URL" }, 400);
    }

    const secretKey = getPaymongoSecretKey();
    if (!secretKey) {
      return json({ error: "Missing PayMongo secret key env vars" }, 500);
    }

    const payload = {
      data: {
        attributes: {
          billing: null,
          send_email_receipt: false,
          show_description: true,
          show_line_items: true,
          description: remarks,
          success_url: successUrl,
          cancel_url: cancelUrl,
          payment_method_types: allowedMethods,
          line_items: [
            {
              currency: "PHP",
              amount: Math.round(amountPhp * 100),
              name: description,
              quantity: 1,
              description: remarks,
            },
          ],
          metadata: normalizedMetadata,
        },
      },
    };

    const response = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: buildBasicAuthHeader(secretKey),
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      const errorDetail =
        data?.errors?.[0]?.detail ||
        data?.errors?.[0]?.code ||
        text ||
        "Failed to create PayMongo checkout session.";

      return json(
        {
          error: errorDetail,
          status: response.status,
        },
        400,
      );
    }

    const checkoutData = maybeObject(data.data);
    const checkoutAttributes = maybeObject(checkoutData.attributes);
    const checkoutUrl = firstString(
      checkoutAttributes.checkout_url,
      checkoutAttributes.checkoutUrl,
    );
    const checkoutSessionId = firstString(checkoutData.id);

    if (!checkoutUrl || !checkoutSessionId) {
      return json(
        { error: "PayMongo response is missing checkout URL or session ID." },
        500,
      );
    }

    return json({
      success: true,
      checkoutUrl,
      checkoutSessionId,
      checkout_session_id: checkoutSessionId,
    });
  });
