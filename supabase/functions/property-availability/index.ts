import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { propertyIds } = await req.json();

    if (!Array.isArray(propertyIds) || propertyIds.length === 0) {
      return new Response(JSON.stringify({ availability: {} }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Initialize Supabase client with the Service Role key
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const ACTIVE_OCCUPANCY_STATUSES = ["active", "pending_end"];
    const SCHEDULED_END_REQUEST_STATUSES = ["approved", "pending", "cancel_pending"];

    const { data, error } = await supabaseClient
      .from("tenant_occupancies")
      .select("property_id, end_request_date, end_request_status, status")
      .in("property_id", propertyIds)
      .in("status", ACTIVE_OCCUPANCY_STATUSES);

    if (error) throw error;

    const parseOccupancyDate = (value: string | null) => {
      if (!value) return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      date.setHours(0, 0, 0, 0);
      return date;
    };

    const getOccupancyAvailabilityDate = (occupancy: Record<string, string | null>) => {
      if (!occupancy || !occupancy.status || !ACTIVE_OCCUPANCY_STATUSES.includes(occupancy.status)) return null;

      const dateCandidates: string[] = [];
      if (
        occupancy.end_request_date &&
        occupancy.end_request_status &&
        SCHEDULED_END_REQUEST_STATUSES.includes(occupancy.end_request_status)
      ) {
        dateCandidates.push(occupancy.end_request_date);
      }
      if (occupancy.contract_end_date) dateCandidates.push(occupancy.contract_end_date);
      if (occupancy.end_date) dateCandidates.push(occupancy.end_date);

      return dateCandidates
        .map((value) => ({ value, date: parseOccupancyDate(value) }))
        .filter((item) => item.date)
        .sort((a, b) => a.date!.getTime() - b.date!.getTime())[0]?.value || null;
    };

    const grouped = new Map();
    (data || []).forEach((occupancy) => {
      const upcomingDate = getOccupancyAvailabilityDate(occupancy);
      if (!upcomingDate) return;

      const propertyId = occupancy.property_id;
      const date = parseOccupancyDate(upcomingDate);
      if (!propertyId || !date) return;

      const current = grouped.get(propertyId);
      if (!current || date < current.date) {
        grouped.set(propertyId, { value: upcomingDate, date });
      }
    });

    const availability = Object.fromEntries(
      Array.from(grouped.entries()).map(([propertyId, item]) => [propertyId, item.value])
    );

    return new Response(JSON.stringify({ availability }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
