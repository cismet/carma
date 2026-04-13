import { Hono } from "hono";
import { storeDocument } from "../storage";

const ingest = new Hono();

ingest.post("/:topic/:id", async (c) => {
  const topic = c.req.param("topic");
  const id = c.req.param("id");
  const contentType = c.req.header("content-type") ?? "application/octet-stream";
  const body = await c.req.arrayBuffer();

  const ingestionParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(c.req.query())) {
    ingestionParams[key] = value;
  }

  const event = storeDocument(topic, id, body, contentType, ingestionParams);

  console.log(`[INGEST] ${topic}/${id} (${event.size} bytes, ${contentType})`);

  return c.json({ status: "ok", event }, 201);
});

export { ingest };
