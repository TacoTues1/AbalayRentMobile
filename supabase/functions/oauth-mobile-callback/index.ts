import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const isAllowedRedirect = (target: string) => {
  const configured =
    Deno.env.get("OAUTH_MOBILE_ALLOWED_REDIRECT_PREFIXES") ||
    "abalay://,exp://,exps://,http://localhost,https://localhost";

  const prefixes = configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return prefixes.some((prefix) => target.startsWith(prefix));
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const requestUrl = new URL(req.url);
    const fallbackRedirect =
      Deno.env.get("OAUTH_MOBILE_DEFAULT_REDIRECT") ||
      "abalay://auth/callback";
    const redirectTo =
      requestUrl.searchParams.get("redirect_to") ||
      requestUrl.searchParams.get("redirectTo") ||
      fallbackRedirect;

    if (!redirectTo) {
      return new Response(JSON.stringify({ error: "Missing redirect_to" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isAllowedRedirect(redirectTo)) {
      return new Response(JSON.stringify({ error: "Redirect not allowed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetUrl = new URL(redirectTo);

    requestUrl.searchParams.forEach((value, key) => {
      if (key === "redirect_to" || key === "redirectTo") return;
      targetUrl.searchParams.set(key, value);
    });

    return Response.redirect(targetUrl.toString(), 302);
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || "OAuth callback failed" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
