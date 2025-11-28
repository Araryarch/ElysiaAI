import { Elysia, t } from "elysia";

// Ganti ke server model kamu
const url = "https://chat.ragita.net/api/chat/completions";

// Cache system prompt (supaya tidak dikirim tiap request)
let cachedSystemPrompt: string | null = null;

// ---------- STREAMING HELPER ----------
function createSSEReadable(stream: ReadableStream) {
  const reader = stream.getReader();
  const encoder = new TextEncoder();

  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) {
        controller.close();
        return;
      }

      // Forward data sebagai SSE
      controller.enqueue(encoder.encode(value));
    },
    cancel() {
      reader.cancel();
    },
  });
}
// --------------------------------------

export default new Elysia({ prefix: "/api" }).post(
  "/chat",
  async ({ body }) => {
    try {
      const { prompt, messages = [], systemPrompt } = body;
      const API_KEY = process.env.API_KEY || "";

      // Cache system prompt supaya ga dikirim ulang setiap request
      if (systemPrompt && cachedSystemPrompt !== systemPrompt) {
        cachedSystemPrompt = systemPrompt;
      }

      // Trim messages agar LLM lebih cepat (5 terakhir cukup)
      const trimmed = messages.slice(-5);

      const payload = {
        model: "qwen2.5:14b",
        stream: true,
        messages: [
          ...(cachedSystemPrompt
            ? [{ role: "system", content: cachedSystemPrompt }]
            : []),
          ...trimmed,
          ...(prompt ? [{ role: "user", content: prompt }] : []),
        ],
      };

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: API_KEY,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.text();
        return new Response(
          JSON.stringify({ error: `AI server error: ${err}` }),
          { status: res.status }
        );
      }

      // Ambil streaming dari AI
      const readable = createSSEReadable(res.body!);

      // Kirim kembali ke client sebagai text/event-stream
      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          error: "Internal server error (stream failed)",
          details: err?.message,
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
