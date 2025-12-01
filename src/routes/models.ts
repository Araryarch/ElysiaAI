import { Elysia } from "elysia";

const url = "https://chat.ragita.net/api/models";
const API_KEY = process.env.API_KEY || "";

let cache: any = null;
let cacheTime = 0;
const CACHE_TTL = 20_000;

export default new Elysia({ prefix: "/api" }).get("/models", async () => {
  const now = Date.now();

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

  const data = await res.json();

  cache = data;
  cacheTime = now;

  return {
    success: true,
    models: data,
    cached: false,
  };
});
