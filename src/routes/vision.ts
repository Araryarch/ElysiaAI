import { Elysia } from "elysia";

const cache = new Map<string, { timestamp: number; data: any }>();
const CACHE_TTL = 20_000; // 20 detik

const API_URL = "https://chat.ragita.net/api/chat/completions";
const API_KEY = process.env.API_KEY ?? "";

function createCacheKey(payload: any) {
  return JSON.stringify(payload);
}

function bufferToBase64(buffer: ArrayBuffer, mimetype: string) {
  return `data:${mimetype};base64,${btoa(
    String.fromCharCode(...new Uint8Array(buffer))
  )}`;
}

async function normalizeMessages(
  messages: any, // accept string or array
  file?: File,
  prompt?: string,
  systemPrompt?: string
) {
  const result: any[] = [];

  // parse messages string → JSON jika perlu
  if (typeof messages === "string") {
    try {
      messages = JSON.parse(messages);
    } catch {
      messages = [];
    }
  }

  // system prompt
  if (systemPrompt) result.push({ role: "system", content: systemPrompt });

  // existing messages
  if (Array.isArray(messages)) {
    for (const msg of messages) {
      if (!Array.isArray(msg.content)) {
        result.push(msg);
        continue;
      }

      let normalized = "";
      for (const item of msg.content) {
        if (item.type === "text") normalized += item.text + "\n\n";
      }

      result.push({ role: msg.role, content: normalized.trim() });
    }
  }

  // uploaded image
  if (file) {
    const base64 = bufferToBase64(await file.arrayBuffer(), file.type);
    result.push({ role: "user", content: `<image:${base64}>` });
  }

  // prompt
  if (prompt) result.push({ role: "user", content: prompt });

  return result;
}

export default new Elysia({ prefix: "/api" }).post("/vision", async (ctx) => {
  try {
    // baca body langsung satu kali → aman Bun
    const form = await ctx.request.formData();

    const prompt = form.get("prompt")?.toString();
    const systemPrompt = form.get("systemPrompt")?.toString();
    const messages = form.get("messages")?.toString();
    const file = form.get("image") as File | undefined;

    // normalize & attach image
    const normalized = await normalizeMessages(
      messages || [],
      file,
      prompt,
      systemPrompt
    );

    const payload = { model: "qwen2.5vl:7b", messages: normalized };

    // --- caching ---
    const cacheKey = createCacheKey(payload);
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL)
      return { success: true, data: { ...cached.data, cached: true } };

    // --- fetch AI ---
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: API_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const details = await res.text();
      return {
        success: false,
        error: { message: "AI request failed", details },
      };
    }

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content || "";

    const responseData = {
      reply,
      messages: [...normalized, { role: "assistant", content: reply }],
    };

    cache.set(cacheKey, { timestamp: Date.now(), data: responseData });

    return { success: true, data: responseData };
  } catch (err: any) {
    return {
      success: false,
      error: {
        message: "Internal server error",
        details: err?.message || String(err),
      },
    };
  }
});
