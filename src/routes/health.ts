import { Elysia } from "elysia";

const url = "https://chat.ragita.net/api/chat/completions";

async function checkExternalAPI() {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen2.5:14b",
        messages: [{ role: "user", content: "ping" }],
      }),
    });

    if (!res.ok) return false;
    return true;
  } catch {
    return false;
  }
}

export default new Elysia({ prefix: "/api" }).get("/health", async () => {
  const externalAlive = await checkExternalAPI();

  return {
    success: true,
    timestamp: Date.now(),
    services: {
      self: "healthy",
      externalAI: externalAlive ? "healthy" : "unreachable",
    },
  };
});
