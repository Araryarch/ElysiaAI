import { t, Elysia } from "elysia";

const cache = new Map<string, { timestamp: number; data: any }>();
const CACHE_TTL = 20_000;

function createCacheKey(payload: any) {
  return JSON.stringify(payload);
}

const url = "https://chat.ragita.net/api/chat/completions";

export default new Elysia({ prefix: "/api" }).post(
  "/chat",
  async ({ body }) => {
    const { prompt, messages = [], systemPrompt } = body;

    try {
      const API_KEY = process.env.API_KEY ?? "";

      const msg: any[] = [];
      if (systemPrompt) msg.push({ role: "system", content: systemPrompt });
      if (messages.length) msg.push(...messages);
      if (prompt) msg.push({ role: "user", content: prompt });

      const payload = { model: "qwen2.5:14b", messages: msg };

      const cacheKey = createCacheKey(payload);
      const cached = cache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return {
          success: true,
          models: "senopati-7b",
          data: {
            reply: cached.data.reply,
            messages: cached.data.messages,
            cached: true,
          },
        };
      }

      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: API_KEY,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              message: "AI request failed",
              details: await res.text(),
            },
          }),
          { status: res.status }
        );
      }

      const data = await res.json();
      const reply = data?.choices?.[0]?.message?.content || "";

      const responseData = {
        reply,
        messages: [...msg, { role: "assistant", content: reply }],
      };

      cache.set(cacheKey, {
        timestamp: Date.now(),
        data: responseData,
      });

      return {
        success: true,
        models: "senopati-7b",
        data: responseData,
      };
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
      messages: t.Optional(
        t.Array(
          t.Object({
            role: t.Union([
              t.Literal("system"),
              t.Literal("user"),
              t.Literal("assistant"),
            ]),
            content: t.String(),
          })
        )
      ),
      systemPrompt: t.Optional(t.String()),
    }),
  }
);
