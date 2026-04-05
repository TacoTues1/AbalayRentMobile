import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, paymongo-signature",
};

const FREE_FAMILY_SLOT_COUNT = 1;
const MAX_FAMILY_SLOT_COUNT = 4;
const MAX_PAID_FAMILY_SLOT_COUNT = Math.max(
  0,
  MAX_FAMILY_SLOT_COUNT - FREE_FAMILY_SLOT_COUNT,
);
const FAMILY_SLOT_PLAN_TYPE = "family_slot_plan";
const SUBSCRIPTION_TABLE_CANDIDATES = [
  "subscribtion",
  "subscriptions",
  "subscription",
];
const SUBSCRIPTION_PAYMENT_TABLE_CANDIDATES = [
  "subscribtion_payments",
  "subscription_payments",
  "subscribtion_payment",
  "subscription_payment",
];
const USER_COLUMN_CANDIDATES = [
  "user_id",
  "tenant_id",
  "landlord_id",
  "owner_id",
  "payer_id",
  "mother_id",
  "profile_id",
];
const PAYMENT_REFERENCE_COLUMN_CANDIDATES = [
  "payment_id",
  "paymongo_payment_id",
  "reference_id",
  "transaction_id",
  "payment_reference",
];

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

const toIsoDate = (value: unknown) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Date(numeric * 1000).toISOString();
  }

  const text = String(value ?? "").trim();
  if (!text) return new Date().toISOString();

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
};

const maybeObject = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const isMissingSchemaError = (error: any) => {
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();
  return (
    code === "PGRST204" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("could not find") ||
    message.includes("schema cache") ||
    details.includes("failed to parse")
  );
};

const mergeMetadata = (...sources: unknown[]) =>
  sources.reduce<Record<string, unknown>>(
    (acc, source) => ({ ...acc, ...maybeObject(source) }),
    {},
  );

const normalizeAmountPhp = (value: unknown, metadataAmount: unknown) => {
  const explicitAmount = toNumber(metadataAmount);
  if (explicitAmount > 0) return explicitAmount;

  const rawAmount = toNumber(value);
  if (rawAmount <= 0) return 0;

  // Checkout/payment payloads are commonly sent in centavos.
  return rawAmount >= 1000 ? rawAmount / 100 : rawAmount;
};

const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
};

const parseSignatureHeader = (header: string) => {
  const entries = header
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const parsed: Record<string, string> = {};
  for (const entry of entries) {
    const [key, ...rest] = entry.split("=");
    if (!key || rest.length === 0) continue;
    parsed[key.trim()] = rest.join("=").trim();
  }

  return parsed;
};

const signPayload = async (secret: string, message: string) => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );

  return hex(signature);
};

const verifyPayMongoSignature = async (
  bodyText: string,
  headerValue: string,
  secret: string,
) => {
  if (!secret) return true;
  if (!headerValue) return false;

  const parts = parseSignatureHeader(headerValue);
  const timestamp = firstString(parts.t);
  const liveSignature = firstString(parts.li);
  const testSignature = firstString(parts.te);
  if (!timestamp || (!liveSignature && !testSignature)) {
    return false;
  }

  const signedPayload = `${timestamp}.${bodyText}`;
  const expected = await signPayload(secret, signedPayload);

  return (
    (!!liveSignature && timingSafeEqual(expected, liveSignature)) ||
    (!!testSignature && timingSafeEqual(expected, testSignature))
  );
};

const getCheckoutPayment = (eventBody: Record<string, unknown>) => {
  const eventAttributes = maybeObject(
    maybeObject(maybeObject(eventBody.data).attributes).data,
  );
  const checkoutAttributes = maybeObject(eventAttributes.attributes);
  const payments = Array.isArray(checkoutAttributes.payments)
    ? checkoutAttributes.payments
    : [];
  const firstPayment = maybeObject(payments[0]);
  const firstPaymentAttributes = maybeObject(firstPayment.attributes);
  const paymentIntent = maybeObject(checkoutAttributes.payment_intent);
  const paymentIntentAttributes = maybeObject(paymentIntent.attributes);
  const intentPayments = Array.isArray(paymentIntentAttributes.payments)
    ? paymentIntentAttributes.payments
    : [];
  const firstIntentPayment = maybeObject(intentPayments[0]);
  const firstIntentPaymentAttributes = maybeObject(firstIntentPayment.attributes);

  return {
    checkoutId: firstString(eventAttributes.id),
    checkoutAttributes,
    paymentId: firstString(firstPayment.id, firstIntentPayment.id),
    paymentAttributes:
      Object.keys(firstPaymentAttributes).length > 0
        ? firstPaymentAttributes
        : firstIntentPaymentAttributes,
    metadata: mergeMetadata(
      checkoutAttributes.metadata,
      paymentIntentAttributes.metadata,
      firstPaymentAttributes.metadata,
      firstIntentPaymentAttributes.metadata,
    ),
  };
};

const processPaidFamilySlot = async ({
  supabaseAdmin,
  ownerUserId,
  slots,
  amount,
  currency,
  occupancyId,
  paymentReference,
  paidAt,
}: {
  supabaseAdmin: ReturnType<typeof createClient>;
  ownerUserId: string;
  slots: number;
  amount: number;
  currency: string;
  occupancyId: string | null;
  paymentReference: string;
  paidAt: string;
}) => {
  let paymentStored = false;
  let planStored = false;
  let canonicalSubscriptionId: string | null = null;
  let existingPaidSlots = 0;
  const requestedSlots = Math.max(1, Math.floor(slots));
  let appliedSlots = Math.max(
    0,
    Math.min(requestedSlots, MAX_PAID_FAMILY_SLOT_COUNT),
  );
  const now = new Date().toISOString();
  const nextPaidSlotsBase = () =>
    Math.max(
      0,
      Math.min(MAX_PAID_FAMILY_SLOT_COUNT, existingPaidSlots + appliedSlots),
    );
  const nextTotalSlotsBase = () =>
    Math.min(MAX_FAMILY_SLOT_COUNT, FREE_FAMILY_SLOT_COUNT + nextPaidSlotsBase());

  try {
    const { data: existingPayment, error: existingPaymentError } =
      await supabaseAdmin
        .from("subscription_payments")
        .select("id, subscription_id")
        .eq("payment_reference", paymentReference)
        .limit(1)
        .maybeSingle();

    if (!existingPaymentError && existingPayment?.id) {
      paymentStored = true;
    }
  } catch {
    // Fall through to compatibility checks.
  }

  if (!paymentStored) {
    const matchTargets = [
      { columns: ["checkout_session_id", "session_id"], value: paymentReference },
      { columns: PAYMENT_REFERENCE_COLUMN_CANDIDATES, value: paymentReference },
    ];

    for (const tableName of SUBSCRIPTION_PAYMENT_TABLE_CANDIDATES) {
      let found = false;
      for (const target of matchTargets) {
        for (const column of target.columns) {
          try {
            const { data, error } = await supabaseAdmin
              .from(tableName)
              .select("id")
              .eq(column, target.value)
              .limit(1);

            if (!error && Array.isArray(data) && data.length > 0) {
              paymentStored = true;
              found = true;
              break;
            }
          } catch {
            // Keep trying compatibility lookups.
          }
        }
        if (found) break;
      }
      if (found) break;
    }
  }

  try {
    const { data: existingSubscription, error: existingSubscriptionError } =
      await supabaseAdmin
        .from("subscriptions")
        .select("id, total_slots, paid_slots")
        .eq("tenant_id", ownerUserId)
        .eq("plan_type", FAMILY_SLOT_PLAN_TYPE)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!existingSubscriptionError) {
      existingPaidSlots = Math.min(
        MAX_PAID_FAMILY_SLOT_COUNT,
        Math.max(
          toNumber(existingSubscription?.paid_slots),
          Math.max(
            0,
            toNumber(existingSubscription?.total_slots) -
              FREE_FAMILY_SLOT_COUNT,
          ),
        ),
      );
      appliedSlots = Math.max(
        0,
        Math.min(requestedSlots, MAX_PAID_FAMILY_SLOT_COUNT - existingPaidSlots),
      );

      if (existingSubscription?.id) {
        const { error: updateSubscriptionError } = await supabaseAdmin
          .from("subscriptions")
          .update({
            total_slots: nextTotalSlotsBase(),
            paid_slots: nextPaidSlotsBase(),
            status: "active",
            updated_at: now,
          })
          .eq("id", existingSubscription.id);

        if (!updateSubscriptionError) {
          planStored = true;
          canonicalSubscriptionId = firstString(existingSubscription.id);
        }
      } else {
        const { data: insertedSubscription, error: insertSubscriptionError } =
          await supabaseAdmin
            .from("subscriptions")
            .insert({
              tenant_id: ownerUserId,
              plan_type: FAMILY_SLOT_PLAN_TYPE,
              total_slots: nextTotalSlotsBase(),
              paid_slots: nextPaidSlotsBase(),
              status: "active",
              created_at: now,
              updated_at: now,
            })
            .select("id")
            .single();

        if (!insertSubscriptionError) {
          planStored = true;
          canonicalSubscriptionId = firstString(insertedSubscription?.id);
        }
      }
    }
  } catch {
    // Fall through to compatibility path.
  }

  if (appliedSlots <= 0) {
    return {
      ok: true,
      alreadyProcessed: paymentStored,
      limitReached: true,
      subscriptionId: canonicalSubscriptionId,
    };
  }

  const basePaymentPayloadVariants = [
    {
      subscription_id: canonicalSubscriptionId || null,
      tenant_id: ownerUserId,
      occupancy_id: occupancyId,
      amount,
      currency,
      payment_method: "paymongo",
      payment_reference: paymentReference,
      status: "paid",
      paid_at: paidAt,
      created_at: now,
    },
    {
      slots: appliedSlots,
      amount,
      status: "paid",
      payment_method: "paymongo",
      provider: "paymongo",
      checkout_session_id: paymentReference,
      payment_reference: paymentReference,
      created_at: now,
      paid_at: paidAt,
    },
    {
      slot_count: appliedSlots,
      amount_paid: amount,
      payment_status: "paid",
      payment_method: "paymongo",
      provider: "paymongo",
      session_id: paymentReference,
      reference_id: paymentReference,
      created_at: now,
      paid_at: paidAt,
    },
  ];

  if (!paymentStored) {
    for (const tableName of SUBSCRIPTION_PAYMENT_TABLE_CANDIDATES) {
      let storedInTable = false;
      for (const payload of basePaymentPayloadVariants) {
        const payloadVariants = USER_COLUMN_CANDIDATES.map((userColumn) => ({
          ...payload,
          [userColumn]: ownerUserId,
        }));

        for (const paymentPayload of payloadVariants) {
          try {
            const { error } = await supabaseAdmin
              .from(tableName)
              .insert(paymentPayload);
            if (!error) {
              paymentStored = true;
              storedInTable = true;
              break;
            }

            if (!isMissingSchemaError(error)) {
              // Preserve non-schema failures only if every shape fails.
            }
          } catch {
            // Try the next payload shape.
          }
        }
        if (storedInTable) break;
      }
      if (storedInTable) break;
    }
  }

  const baseSubscriptionPayloadVariants = [
    {
      plan_name: FAMILY_SLOT_PLAN_TYPE,
      total_slots: nextTotalSlotsBase(),
      additional_slots: nextPaidSlotsBase(),
      paid_slots: nextPaidSlotsBase(),
      status: "active",
      created_at: now,
      updated_at: now,
    },
    {
      plan_type: FAMILY_SLOT_PLAN_TYPE,
      total_slots: nextTotalSlotsBase(),
      slot_count: nextPaidSlotsBase(),
      _paid_slots: nextPaidSlotsBase(),
      status: "active",
      created_at: now,
      updated_at: now,
    },
  ];

  if (!planStored) {
    for (const tableName of SUBSCRIPTION_TABLE_CANDIDATES) {
      let storedInTable = false;
      for (const payload of baseSubscriptionPayloadVariants) {
        const payloadVariants = USER_COLUMN_CANDIDATES.map((userColumn) => ({
          ...payload,
          [userColumn]: ownerUserId,
        }));

        for (const subscriptionPayload of payloadVariants) {
          try {
            const { error: upsertError } = await supabaseAdmin
              .from(tableName)
              .upsert(subscriptionPayload);
            if (!upsertError) {
              planStored = true;
              storedInTable = true;
              break;
            }

            const { error: insertError } = await supabaseAdmin
              .from(tableName)
              .insert(subscriptionPayload);
            if (!insertError) {
              planStored = true;
              storedInTable = true;
              break;
            }
          } catch {
            // Try the next payload shape.
          }
        }
        if (storedInTable) break;
      }
      if (storedInTable) break;
    }
  }

  if (!paymentStored && !planStored) {
    return {
      ok: false,
      alreadyProcessed: false,
      error:
        "Could not save the paid family slot to the available subscription/payment table shape.",
    };
  }

  return {
    ok: true,
    alreadyProcessed: false,
    subscriptionId: canonicalSubscriptionId,
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const bodyText = await req.text();
  const webhookSecret = Deno.env.get("PAYMONGO_WEBHOOK_SECRET") ?? "";
  const signatureHeader =
    req.headers.get("paymongo-signature") ||
    req.headers.get("Paymongo-Signature") ||
    "";

  const signatureValid = await verifyPayMongoSignature(
    bodyText,
    signatureHeader,
    webhookSecret,
  );
  if (!signatureValid) {
    return json({ error: "Invalid PayMongo webhook signature" }, 401);
  }

  let eventBody: Record<string, unknown>;
  try {
    eventBody = JSON.parse(bodyText);
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const eventAttributes = maybeObject(maybeObject(eventBody.data).attributes);
  const eventType = firstString(eventAttributes.type);
  if (
    eventType !== "checkout_session.payment.paid" &&
    eventType !== "payment.paid"
  ) {
    return json({ success: true, ignored: true, eventType });
  }

  const {
    checkoutId,
    checkoutAttributes,
    paymentId,
    paymentAttributes,
    metadata,
  } = getCheckoutPayment(eventBody);

  const metadataType = firstString(
    metadata.type,
    checkoutAttributes.description,
  ).toLowerCase();
  const isFamilySlotPayment =
    metadataType.includes("family_slot") ||
    metadataType.includes("family slot");
  if (!isFamilySlotPayment) {
    return json({ success: true, ignored: true, reason: "not_family_slot" });
  }

  const ownerUserId = firstString(
    metadata.ownerUserId,
    metadata.ownerId,
    metadata.tenantId,
    metadata.userId,
  );
  if (!ownerUserId) {
    return json({ error: "Missing owner user id in metadata" }, 400);
  }

  const slots = Math.max(1, Math.floor(toNumber(metadata.slots, 1)));
  const amount = normalizeAmountPhp(
    paymentAttributes.amount,
    metadata.amount,
  );
  const occupancyId = firstString(metadata.occupancyId) || null;
  const currency = firstString(paymentAttributes.currency, "PHP");
  const paidAt = toIsoDate(
    paymentAttributes.paid_at || checkoutAttributes.paid_at || Date.now(),
  );
  const paymentReference = firstString(paymentId, checkoutId);
  if (!paymentReference) {
    return json({ error: "Missing PayMongo payment reference" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return json({ error: "Missing Supabase admin credentials" }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
  const processed = await processPaidFamilySlot({
    supabaseAdmin,
    ownerUserId,
    slots,
    amount,
    currency,
    occupancyId,
    paymentReference,
    paidAt,
  });

  if (!processed.ok) {
    return json(
      {
        error: processed.error || "Failed to process paid family slot",
      },
      500,
    );
  }

  return json({
    success: true,
    processed: true,
    alreadyProcessed: !!processed.alreadyProcessed,
    ownerUserId,
    slots,
    paymentReference,
    subscriptionId: processed.subscriptionId || null,
  });
});
