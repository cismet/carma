import { Hono } from "hono";
import { logger } from "hono/logger";
import { ingest } from "./routes/ingest";
import { dashboard, topicOverview } from "./routes/dashboard";
import { ensureStorageDir } from "./storage";

const app = new Hono();

app.use("*", logger());

app.route("/ingest", ingest);
app.route("/dashboard", topicOverview);
app.route("/events", dashboard);
app.get("/events/", (c) => c.redirect("/events"));
app.get("/", (c) => c.redirect("/dashboard"));

ensureStorageDir();

const port = Number(process.env.PORT ?? 3000);

console.log(`cidsDataBridge listening on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
