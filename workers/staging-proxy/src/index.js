export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    const upstream = new URL(env.UPSTREAM_ORIGIN);
    const target = new URL(incoming.pathname + incoming.search, upstream.origin);

    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("cf-connecting-ip");
    headers.delete("cf-ipcountry");
    headers.delete("cf-visitor");
    headers.delete("cf-ray");
    headers.delete("x-forwarded-host");
    headers.delete("x-forwarded-proto");
    headers.set("x-forwarded-for", request.headers.get("cf-connecting-ip") || "");
    headers.set("x-forwarded-host", incoming.host);
    headers.set("x-forwarded-proto", incoming.protocol.replace(":", ""));

    const response = await fetch(target.toString(), {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    });

    const secured = new Response(response.body, response);
    secured.headers.set("X-Frame-Options", "DENY");
    secured.headers.set("X-Content-Type-Options", "nosniff");
    secured.headers.set(
      "Content-Security-Policy",
      "frame-ancestors 'none'; base-uri 'self'"
    );

    return secured;
  },
};
