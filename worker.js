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
      const cachedResponse = await cache.match(request);

      if (cachedResponse) {
        return cachedResponse;
      }

      const response = await fetch(`https://t.me/${username}`);
      if (!response.ok) {
        return Response.json(
          { error: "Telegram public channel not found", username },
          { status: 404 }
        );
      }

      const html = await response.text();

      const extract = (regex) => {
        const match = html.match(regex);
        return match ? match[1].trim() : null;
      };

      const extractNumber = (text, regex) => {
        const match = text.match(regex);
        return match ? Number(match[1].replace(/\D/g, "")) : null;
      };

      const text = extract(/tgme_page_extra[^>]*>([^<]+)</i);
      if (!text) {
        return Response.json(
          { error: `Telegram group 't.me/${username}' not found, unavailable, or is private` },
          { status: 404 }
        );
      }

      const groupName = extract(/tgme_page_title[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i);
      const groupProfilePhotoLink = extract(/<img class="tgme_page_photo_image" src="([^"]+)"/i);
      const members = extractNumber(text, /([\d\s,.]+)\s+members/i);
      const onlineMembers = extractNumber(text, /([\d\s,.]+)\s+online/i);

      const fmtNumber = (num) => {
        if (num === null) return null;
        if (num >= 1e6) return (num / 1e6).toFixed(1) + 'm';
        if (num >= 1e3) return (num / 1e3).toFixed(1) + 'k';
        return num.toString();
      };

      const summary = (members, online) => {
        const parts = [];
        if (members !== null) parts.push(`${members} members`);
        if (online !== null) parts.push(`${online} online`);
        return parts.length ? parts.join(', ') : null;
      };

      const jsonResponse = Response.json(
        {
          group_name: groupName,
          group_profile_photo_link: groupProfilePhotoLink,
          members,
          online_members: onlineMembers,
          members_summary: summary(members, onlineMembers),
          members_summary_pretty: summary(fmtNumber(members), fmtNumber(onlineMembers))
        },
        { headers: { "Cache-Control": "public, max-age=300" } },
      );

      ctx.waitUntil(cache.put(request, jsonResponse.clone()));
      return jsonResponse;
    } catch {
      return Response.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
};
