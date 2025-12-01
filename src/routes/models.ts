import { Elysia } from "elysia";

const url = "https://chat.ragita.net/api/models";
const API_KEY = process.env.API_KEY || "";

let cache: any = null;
let cacheTime = 0;
const CACHE_TTL = 20_000;

export default new Elysia({ prefix: "/api" }).get("/models", async () => {
  try {
    const now = Date.now();

    // Cache hit
    if (cache && now - cacheTime < CACHE_TTL) {
      return {
        success: true,
        models: cache,
        cached: true,
      };
    }

    // Fetch API eksternal
    const res = await fetch(url, {
      headers: { Authorization: API_KEY },
    });

    if (!res.ok) {
      // API error, jangan 404-in user
      return new Response(
        JSON.stringify({
          success: false,
          error: `External API error: ${res.status}`,
          details: await res.text(),
        }),
        { status: res.status }
      );
    }

    const data = await res.json();

    // Save cache
    cache = data;
    cacheTime = now;

    return {
      success: true,
      models: data,
      cached: false,
    };
  } catch (err: any) {
    // Tangani error selain fetch (timeout, network issue, dsb)
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal error",
        details: err?.message || String(err),
      }),
      { status: 500 }
    );
  }
});
