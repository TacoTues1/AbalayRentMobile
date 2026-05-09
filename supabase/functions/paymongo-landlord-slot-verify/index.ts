import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendBrevoEmail(to: string, subject: string, htmlContent: string) {
  const brevoApiKey = Deno.env.get("BREVO_API_KEY");
  if (!brevoApiKey) {
    console.error("BREVO_API_KEY not set, skipping email");
    return;
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": brevoApiKey,
      },
      body: JSON.stringify({
        sender: { name: "Abalay", email: "alfnzperez@gmail.com" },
        to: [{ email: to }],
        subject,
        htmlContent,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Brevo email failed:", errText);
    } else {
      console.log(`✅ Email receipt sent to ${to}`);
    }
  } catch (err) {
    console.error("Email send error:", err);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { checkoutSessionId, landlord_id } = await req.json();

    if (!checkoutSessionId || !landlord_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const secretKey = Deno.env.get("PAYMONGO_SECRET_KEY") || Deno.env.get("PAYMONGO_TEST_SECRET_KEY");
    if (!secretKey) throw new Error("Missing PayMongo Secret Key");
    const encoded = btoa(`${secretKey}:`);

    const checkoutResponse = await fetch(
      `https://api.paymongo.com/v1/checkout_sessions/${checkoutSessionId}`,
      {
        headers: {
          accept: "application/json",
          authorization: `Basic ${encoded}`,
        },
      }
    );

    const checkoutData = await checkoutResponse.json();
    if (!checkoutResponse.ok) {
      throw new Error("Failed to retrieve PayMongo session");
    }

    const payments = checkoutData.data?.attributes?.payments || [];
    const successfulPayment = payments.find((p: Record<string, unknown>) => (p.attributes as Record<string, unknown>)?.status === "paid" || ((p.data as Record<string, unknown>)?.attributes as Record<string, unknown>)?.status === "paid") || payments[0];
    
    const isPaid =
      checkoutData.data?.attributes?.payment_intent?.attributes?.status === "succeeded" ||
      successfulPayment?.attributes?.status === "paid" ||
      successfulPayment?.data?.attributes?.status === "paid";

    if (!isPaid) {
      return new Response(JSON.stringify({ success: true, paid: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Get the payment record
    const { data: paymentRecord } = await supabaseAdmin
      .from("landlord_slot_payments")
      .select("id, status, subscription_id")
      .eq("payment_reference", checkoutSessionId)
      .single();

    if (!paymentRecord) {
      return new Response(JSON.stringify({ error: "Payment record not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (paymentRecord.status !== "paid") {
      await supabaseAdmin
        .from("landlord_slot_payments")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          payment_method: "paymongo",
        })
        .eq("id", paymentRecord.id);
    }

    // Update the subscription slots
    const { data: subscription } = await supabaseAdmin
      .from("landlord_subscriptions")
      .select("id, total_slots, paid_slots")
      .eq("id", paymentRecord.subscription_id)
      .single();

    let newTotalSlots = subscription?.total_slots || 3;

    if (subscription) {
      const { count: landlordPaidCount } = await supabaseAdmin
        .from("landlord_slot_payments")
        .select("id", { count: "exact", head: true })
        .eq("subscription_id", subscription.id)
        .eq("status", "paid");

      const maxPaidSlots = 7;
      const newPaidSlots = Math.min(landlordPaidCount || 0, maxPaidSlots);
      newTotalSlots = Math.min(10, 3 + newPaidSlots);

      await supabaseAdmin
        .from("landlord_subscriptions")
        .update({
          paid_slots: newPaidSlots,
          total_slots: newTotalSlots,
          plan_type: newPaidSlots > 0 ? "paid" : "free",
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscription.id);
    }

    // Send email receipt
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(landlord_id);
      const landlordEmail = userData?.user?.email;

      if (landlordEmail) {
        const { data: landlordProfile } = await supabaseAdmin
          .from("profiles")
          .select("first_name")
          .eq("id", landlord_id)
          .single();

        const userName = landlordProfile?.first_name || "Landlord";

        await sendBrevoEmail(
          landlordEmail,
          "Payment Successful - Property Slot Unlocked",
          `<div style="font-family: sans-serif; color: #333;">
            <h2 style="color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px;">Payment Confirmed!</h2>
            <p>Dear ${userName},</p>
            <p>We confirm that your payment has been successfully processed via PayMongo.</p>
            <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #059669;">
              <p style="margin: 5px 0;"><strong>Item:</strong> Extra Property Slot</p>
              <p style="margin: 5px 0;"><strong>Amount:</strong> ₱50.00</p>
              <p style="margin: 5px 0;"><strong>Total Slots:</strong> ${newTotalSlots}</p>
            </div>
            <p>Thank you for using Abalay!</p>
          </div>`
        );
      }
    } catch (emailErr) {
      console.error("Email receipt error:", emailErr);
    }

    return new Response(
      JSON.stringify({ success: true, paid: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
