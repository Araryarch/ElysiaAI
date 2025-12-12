import { Elysia } from "elysia";

const cache = new Map<string, { timestamp: number; data: any }>();
const CACHE_TTL = 20_000; // 20 detik

const API_URL = "https://chat.ragita.net/api/chat/completions";


function createCacheKey(payload: any) {
  return JSON.stringify(payload);
}

function bufferToBase64(buffer: ArrayBuffer, mimetype: string) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192; // Process in chunks to avoid stack overflow
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  
  return `data:${mimetype};base64,${btoa(binary)}`;
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
    result.push(...messages);
  }

  // Jika ada file atau imageUrl, gabungkan dengan prompt dalam satu message
  if (file || imageUrl) {
    const content: any[] = [];

    // Tambahkan gambar
    if (file) {
      const base64 = bufferToBase64(await file.arrayBuffer(), file.type);
      content.push({
        type: "image_url",
        image_url: { url: base64 },
      });
    }

    if (imageUrl) {
      const base64 = await imageUrlToBase64(imageUrl);
      content.push({
        type: "image_url",
        image_url: { url: base64 },
      });
    }

    // Tambahkan prompt jika ada
    if (prompt) {
      content.push({
        type: "text",
        text: prompt,
      });
    }

    result.push({
      role: "user",
      content: content,
    });
  } else if (prompt) {
    // Jika hanya prompt tanpa gambar
    result.push({ role: "user", content: prompt });
  }

  return result;
}

// Strip base64 data from messages for cleaner response
function sanitizeMessages(messages: any[]): any[] {
  return messages.map((msg) => {
    if (Array.isArray(msg.content)) {
      return {
        ...msg,
        content: msg.content.map((item: any) => {
          if (item.type === "image_url" && item.image_url?.url?.startsWith("data:")) {
            return {
              type: "image_url",
              image_url: { url: "[base64_image]" },
            };
          }
          return item;
        }),
      };
    }
    return msg;
  });
}

export default new Elysia({ prefix: "/api" }).post("/vision", async (ctx) => {
  try {
    const API_KEY = process.env.API_KEY ?? "";
    const contentType = ctx.request.headers.get("content-type") || "";

    let prompt: string | undefined;
    let systemPrompt: string | undefined;
    let messages: any[] = [];
    let file: File | undefined;
    let imageUrl: string | undefined;

    // Parse based on content-type
    if (contentType.includes("application/json")) {
      // JSON body
      const body = await ctx.request.json();
      prompt = body.prompt;
      systemPrompt = body.systemPrompt;
      messages = body.messages || [];
      imageUrl = body.image; // accepts URL or base64 string
    } else {
      // multipart/form-data
      const form = await ctx.request.formData();
      prompt = form.get("prompt")?.toString();
      systemPrompt = form.get("systemPrompt")?.toString();
      const messagesStr = form.get("messages")?.toString();
      messages = messagesStr ? JSON.parse(messagesStr) : [];
      
      // 'image' can be a File or a URL string
      const imageField = form.get("image");
      if (imageField instanceof File) {
        file = imageField;
      } else if (typeof imageField === "string") {
        imageUrl = imageField;
      }
    }

    const normalized = await normalizeMessages(
      messages,
      file,
      imageUrl,
      prompt,
      systemPrompt
    );

    const payload = {
      model: "qwen3-vl:8b",
      messages: normalized,
    };

    // --- caching ---
    const cacheKey = createCacheKey(payload);
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL)
      return {
        success: true,
        models: "senopati-7b",
        data: {
          reply: cached.data.reply,
          messages: sanitizeMessages(cached.data.messages),
          cached: true,
        },
      };

    // --- fetch AI ---
    const res = await fetch(API_URL, {
      method: "POST",
      credentials: "include",
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
        error: { message: "AI request failed", status: res.status, details },
      };
    }

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content || "";

    const fullMessages = [...normalized, { role: "assistant", content: reply }];
    
    // Keep full data in cache for potential reuse
    cache.set(cacheKey, {
      timestamp: Date.now(),
      data: { reply, messages: fullMessages },
    });

    // Return sanitized messages (without base64) to user
    return {
      success: true,
      models: "senopati-7b",
      data: {
        reply,
        messages: sanitizeMessages(fullMessages),
      },
    };
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
