import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import chatRoute from "./routes/chat";
import healthRoute from "./routes/health";
import visionRoute from "./routes/vision";
import modelsRoute from "./routes/models";

export default new Elysia()
  .use(cors())
  .get("/", () => "I'm Good")
  .use(chatRoute)
  .use(healthRoute)
  .use(visionRoute)
  .use(modelsRoute);
