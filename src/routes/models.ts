import { Elysia } from "elysia";

const url = "https://chat.ragita.net/api/models";
const API_KEY = process.env.API_KEY || "";

let cache: any = null;
let cacheTime = 0;
const CACHE_TTL = 20_000;

export default new Elysia({ prefix: "/api" }).get("/models", async () => {
  try {
    const now = Date.now();

    // Cache
    if (cache && now - cacheTime < CACHE_TTL) {
      return {
        success: true,
        models: cache,
        cached: true,
      };
    }

    const res = await fetch(url, {
      headers: { Authorization: API_KEY },
    });

    if (!res.ok) {
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

    // ⚡ Extract hanya bagian id + name
    const models = (data?.data ?? []).map((m: any) => ({
      id: m.id,
      name: m.name,
    }));

    cache = models;
    cacheTime = now;

    return {
      success: true,
      models,
      cached: false,
    };
  } catch (err: any) {
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
