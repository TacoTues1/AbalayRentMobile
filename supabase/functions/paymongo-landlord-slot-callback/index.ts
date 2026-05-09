import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve((req) => {
  const url = new URL(req.url);
  const target = url.searchParams.get("target");

  if (!target) {
    return new Response("Missing target URL", { status: 400 });
  }

  // Ensure PayMongo hits this HTTPS endpoint, then we redirect the user to the deep link
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Redirecting...</title>
        <meta http-equiv="refresh" content="0;url=${target}">
        <script>
          window.location.href = "${target}";
        </script>
      </head>
      <body>
        <p>Redirecting back to Abalay Rent Mobile...</p>
        <p>If not redirected automatically, <a href="${target}">click here</a>.</p>
      </body>
    </html>
  `;

  const headers = new Headers();
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Location", target);

  return new Response(html, {
    status: 302,
    headers: headers,
  });
});
