import { t, Elysia } from "elysia";

const url = "https://chat.ragita.net/api/chat/completions";

export default new Elysia({ prefix: "/api" }).post(
  "/chat",
  async ({ body }) => {
    try {
      const { prompt, messages = [], systemPrompt } = body;

      const API_KEY = process.env.API_KEY || "";

      const payload = {
        model: "qwen2.5:14b",
        messages: [
          { role: "system", content: systemPrompt || "" },
          ...messages,
          { role: "user", content: prompt },
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
        const errText = await res.text();
        return new Response(
          JSON.stringify({
            error: `Failed to fetch AI response: ${errText}`,
          }),
          { status: res.status }
        );
      }

      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content ?? "";

      return {
        reply,
        messages: [...payload.messages, { role: "assistant", content: reply }],
      };
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          error: "Internal server error",
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
