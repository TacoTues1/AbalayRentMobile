import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SLOT_PRICE = 50;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { landlord_id, ownerName, successUrl, cancelUrl } = await req.json();

    if (!landlord_id) throw new Error("landlord_id required");

    // Initialize Supabase Client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase credentials missing");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get or create subscription
    let { data: subscription } = await supabase
      .from("landlord_subscriptions")
      .select("*")
      .eq("landlord_id", landlord_id)
      .maybeSingle();

    if (!subscription) {
      const { data: newSub, error } = await supabase
        .from("landlord_subscriptions")
        .insert({
          landlord_id,
          plan_type: "free",
          total_slots: 3,
          paid_slots: 0,
          status: "active"
        })
        .select()
        .single();
      if (error) throw error;
      subscription = newSub;
    }

    if (subscription.total_slots >= 10) {
      throw new Error("Maximum 10 property slots already reached");
    }

    // Create pending payment record
    const { data: payment, error: payErr } = await supabase
      .from("landlord_slot_payments")
      .insert({
        subscription_id: subscription.id,
        landlord_id,
        amount: SLOT_PRICE,
        currency: "PHP",
        payment_method: "paymongo",
        status: "pending"
      })
      .select()
      .single();

    if (payErr) throw payErr;

    // Call PayMongo
    const secretKey = Deno.env.get("PAYMONGO_SECRET_KEY") || Deno.env.get("PAYMONGO_TEST_SECRET_KEY");
    if (!secretKey) throw new Error("Missing PayMongo Secret Key");
    const encoded = btoa(`${secretKey}:`);

    // Wrap the deep links in the HTTPS callback endpoint to satisfy PayMongo
    const callbackBase = `${supabaseUrl}/functions/v1/paymongo-landlord-slot-callback?target=`;
    const finalSuccessUrl = successUrl ? `${callbackBase}${encodeURIComponent(successUrl)}` : "https://www.abalay-rent.me";
    const finalCancelUrl = cancelUrl ? `${callbackBase}${encodeURIComponent(cancelUrl)}` : "https://www.abalay-rent.me";

    const checkoutResponse = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
      method: "POST",
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
        authorization: `Basic ${encoded}`,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            send_email_receipt: false,
            show_description: true,
            show_line_items: true,
            description: `Property Slot (+1) for ${ownerName || "Landlord"}`,
            line_items: [
              {
                currency: "PHP",
                amount: SLOT_PRICE * 100,
                name: "Property Slot (+1)",
                description: "Additional property listing slot",
                quantity: 1,
              },
            ],
            payment_method_types: ["gcash", "paymaya", "card", "qrph", "grab_pay"],
            success_url: finalSuccessUrl,
            cancel_url: finalCancelUrl,
            metadata: {
              type: "landlord_property_slot",
              landlord_slot_payment_id: payment.id,
              landlord_subscription_id: subscription.id,
              landlord_id: landlord_id,
            },
          },
        },
      }),
    });

    const checkoutData = await checkoutResponse.json();
    if (checkoutData.errors) throw new Error(checkoutData.errors[0]?.detail || "PayMongo checkout failed");

    const checkoutUrl = checkoutData.data?.attributes?.checkout_url;
    const checkoutSessionId = checkoutData.data?.id;

    await supabase
      .from("landlord_slot_payments")
      .update({ payment_reference: checkoutSessionId })
      .eq("id", payment.id);

    return new Response(
      JSON.stringify({ checkoutUrl, checkoutSessionId, success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
