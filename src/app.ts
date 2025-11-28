import { Elysia } from "elysia";
import chatRoute from "./routes/chat";

export default new Elysia().get("/", () => "I'm Good").use(chatRoute);
