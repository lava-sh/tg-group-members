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

      const extract = (pattern) => {
        const match = html.match(pattern);
        return match ? match[1].trim() : null;
      };

      const extractNumber = (text, pattern) => {
        const match = text.match(pattern);
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
      
      const membersMatch = text.match(/([\d\s,.]+)\s+members?/i);
      const members = membersMatch ? Number(membersMatch[1].replace(/\D/g, "")) : null;

      const onlineMatch = text.match(/([\d\s,.]+)\s+online/i);
      const onlineMembers = onlineMatch ? Number(onlineMatch[1].replace(/\D/g, "")) : null;

      const fmtNumber = (num) => {
        if (num === null) return null;
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'm';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
        return num.toString();
      };

      let pretty = text;
      pretty = pretty.replace(/(\d[\d\s,.]+)\s+(members?)/i, (_, num, word) => {
        return `${fmtNumber(Number(num.replace(/\D/g, "")))} ${word}`;
      });
      pretty = pretty.replace(/(\d[\d\s,.]+)\s+online/i, (_, num) => {
        return `${fmtNumber(Number(num.replace(/\D/g, "")))} online`;
      });

      const jsonResponse = Response.json(
        {
          group_name: groupName,
          group_profile_photo_link: groupProfilePhotoLink,
          members,
          online_members: onlineMembers,
          members_summary: text,
          members_summary_pretty: pretty
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
