import { Elysia } from "elysia";
import { chatRoute } from "./routes/chat";

export const app = new Elysia().get("/", "I'm Good").use(chatRoute);
