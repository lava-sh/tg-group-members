export default {
  async fetch(request, env, ctx) {
    // https://developers.cloudflare.com/workers/runtime-apis/cache/#accessing-cache
    const cache = caches.default;

    try {
      const url = new URL(request.url);

      // *.workers.dev/@chat_name -> chat_name
      // *.workers.dev/chat_name -> chat_name
      const username = url.pathname.slice(1).replace(/^@/, "").trim();

      if (!username) {
        return Response.json(
          { error: "Missing username. Use /{username}" },
          { status: 400 }
        );
      }

      // https://developers.cloudflare.com/workers/runtime-apis/cache/#accessing-cache
      const cached = await cache.match(request);

      if (cached) {
        return cached;
      }

      const tg_url = `https://t.me/${username}`;

      const res = await fetch(tg_url);

      if (!res.ok) {
        return Response.json(
          {
            error: "Telegram public channel not found",
            username,
          },
          { status: 404 }
        );
      }

      const html = await res.text();

      const text_match = html.match(/tgme_page_extra[^>]*>([^<]+)</i);

      if (!text_match) {
        return Response.json(
          { error: `Telegram group 't.me/${username}' not found, unavailable, or is private` },
          { status: 404 }
        );
      }

      const text = text_match[1].trim();

      const members = Number(
        text.match(/([\d\s,.]+)\s+members/i)?.[1]?.replace(/\D/g, "") || 0
      );

      const online_members = Number(
        text.match(/([\d\s,.]+)\s+online/i)?.[1]?.replace(/\D/g, "") || 0
      );

      const response = Response.json(
        { members, online_members },
        { headers: { "Cache-Control": "public, max-age=300" } },
      );

      ctx.waitUntil(cache.put(request, response.clone()));

      return response;
    } catch {
      return Response.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
};
