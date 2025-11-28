import { Elysia } from "elysia";
import chatRoute from "./routes/chat";
import healthRoute from "./routes/health";

export default new Elysia()
  .get("/", () => "I'm Good")
  .use(chatRoute)
  .use(healthRoute);
