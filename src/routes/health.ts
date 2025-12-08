import { Elysia } from "elysia";

const EXTERNAL_HEALTH_URL = "https://chat.ragita.net/api/health";

const API_KEY = process.env.API_KEY || "";

function timeout(ms: number) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Request timed out")), ms)
  );
}

async function checkExternalAPI() {
  try {
    const res = await Promise.race([
      fetch(EXTERNAL_HEALTH_URL, {
        method: "GET",
        credentials: "include",
        headers: {
          Authorization: API_KEY,
        },
      }),
      timeout(5000),
    ]);

    if (!(res instanceof Response)) return false;
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
