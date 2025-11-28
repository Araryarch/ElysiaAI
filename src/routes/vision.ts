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

// fetch image from URL → convert to base64
async function imageUrlToBase64(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image from URL: ${url}`);
  const buffer = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") || "image/png";
  return bufferToBase64(buffer, contentType);
}

async function normalizeMessages(
  messages: any[],
  file?: File,
  imageUrl?: string,
  prompt?: string,
  systemPrompt?: string
) {
  const result: any[] = [];

  if (typeof messages === "string") {
    try {
      messages = JSON.parse(messages);
    } catch {
      messages = [];
    }
  }

  if (systemPrompt) result.push({ role: "system", content: systemPrompt });

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

  // uploaded file
  if (file) {
    const base64 = bufferToBase64(await file.arrayBuffer(), file.type);
    result.push({ role: "user", content: `<image:${base64}>` });
  }

  // image URL
  if (imageUrl) {
    const base64 = await imageUrlToBase64(imageUrl);
    result.push({ role: "user", content: `<image:${base64}>` });
  }

  if (prompt) result.push({ role: "user", content: prompt });

  return result;
}

export default new Elysia({ prefix: "/api" }).post("/vision", async (ctx) => {
  try {
    const form = await ctx.request.formData();

    const prompt = form.get("prompt")?.toString();
    const systemPrompt = form.get("systemPrompt")?.toString();
    const messages = form.get("messages")?.toString();
    const file = form.get("image") as File | undefined;
    const imageUrl = form.get("image_url")?.toString();

    const normalized = await normalizeMessages(
      messages ? JSON.parse(messages) : [],
      file,
      imageUrl,
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
