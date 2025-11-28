import { Elysia, t } from "elysia";

const url = "https://chat.ragita.net/api/chat/completions";

const app = new Elysia();

app.get("/", "I'm Good");

app.post(
  "/api/chat",
  async ({ body, set }) => {
    try {
      const { prompt, messages = [], systemPrompt } = body;

      const payload = {
        model: "qwen2.5:14b",
        messages: [
          {
            role: "system",
            content: systemPrompt || "",
          },
          ...messages,
          { role: "user", content: prompt },
        ],
      };

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: process.env.API_KEY ?? "",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        set.status = res.status;
        return { error: `Failed to fetch AI response: ${errorText}` };
      }

      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content ?? "";

      return {
        reply,
        messages: [...payload.messages, { role: "assistant", content: reply }],
      };
    } catch (err: any) {
      set.status = 500;
      return {
        error: "Internal server error",
        details: err?.message,
      };
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

app.listen(3000);

console.log("API running on http://localhost:3000");
