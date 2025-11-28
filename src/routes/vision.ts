import { t, Elysia } from "elysia";

const cache = new Map<string, { timestamp: number; data: any }>();
const CACHE_TTL = 20_000;

const url = "https://chat.ragita.net/api/chat/completions";
const API_KEY = process.env.API_KEY ?? "";

function createCacheKey(payload: any) {
  return JSON.stringify(payload);
}

// Convert image URL to Base64 (Bun fetch)
async function ensureBase64Image(url: string) {
  if (url.startsWith("data:image/")) return url;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url}`);
  const buffer = new Uint8Array(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/png";
  const base64 = btoa(String.fromCharCode(...buffer));
  return `data:${contentType};base64,${base64}`;
}

// Normalize vision messages
async function normalizeVisionMessages(messages: any[] = []) {
  const result = [];
  for (const msg of messages) {
    if (!Array.isArray(msg.content)) {
      result.push(msg);
      continue;
    }

    let normalized = "";
    for (const item of msg.content) {
      if (item.type === "text") {
        normalized += item.text + "\n\n";
      } else if (item.type === "image_url" && item.image_url?.url) {
        const base64Url = await ensureBase64Image(item.image_url.url);
        normalized += `<image:${base64Url}>`;
      }
    }

    result.push({
      role: msg.role,
      content: normalized.trim(),
    });
  }

  return result;
}

export default new Elysia({ prefix: "/api" }).post(
  "/vision",
  async ({ body }) => {
    try {
      const { messages = [], prompt, systemPrompt } = body;

      const normalized = await normalizeVisionMessages(messages);

      if (systemPrompt)
        normalized.unshift({ role: "system", content: systemPrompt });
      if (prompt) normalized.push({ role: "user", content: prompt });
      const payload = { model: "qwen2.5vl:7b", messages: normalized };

      const cacheKey = createCacheKey(payload);
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL)
        return { success: true, data: { ...cached.data, cached: true } };

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: API_KEY,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok)
        return new Response(
          JSON.stringify({
            success: false,
            error: { message: "AI request failed", details: await res.text() },
          }),
          { status: res.status }
        );

      const data = await res.json();
      const reply = data?.choices?.[0]?.message?.content || "";

      const responseData = {
        reply,
        messages: [...normalized, { role: "assistant", content: reply }],
      };

      cache.set(cacheKey, { timestamp: Date.now(), data: responseData });

      return { success: true, data: responseData };
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            message: "Internal server error",
            details: err?.message || String(err),
          },
        }),
        { status: 500 }
      );
    }
  },
  {
    body: t.Object({
      prompt: t.Optional(t.String()),
      messages: t.Optional(t.Array(t.Any())),
      systemPrompt: t.Optional(t.String()),
    }),
  }
);
