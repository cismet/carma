import { Hono } from "hono";
import { getRecentEvents, getDocument, getTopicSummaries } from "../storage";
import { DashboardPage, EventDetailPage, TopicOverviewPage } from "../ui/dashboard";

const dashboard = new Hono();

dashboard.get("/", (c) => {
  const events = getRecentEvents(20);
  return c.html(<DashboardPage events={events} />);
});

dashboard.get("/:topic", (c) => {
  const topic = c.req.param("topic");
  const events = getRecentEvents(20, topic);
  return c.html(<DashboardPage events={events} topic={topic} />);
});

dashboard.get("/:topic/:id", (c) => {
  const topic = c.req.param("topic");
  const id = c.req.param("id");
  const doc = getDocument(topic, id);

  if (!doc) {
    return c.text("Not found", 404);
  }

  let preview: string | null = null;
  if (
    doc.meta.contentType.includes("json") ||
    doc.meta.contentType.includes("xml") ||
    doc.meta.contentType.includes("text")
  ) {
    const raw = doc.data.toString("utf-8").slice(0, 10000);
    if (doc.meta.contentType.includes("json")) {
      try {
        preview = JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        preview = raw;
      }
    } else if (doc.meta.contentType.includes("xml")) {
      preview = raw
        .replace(/></g, ">\n<")
        .replace(/^/, "")
        .split("\n")
        .reduce((acc: string[], line: string) => {
          const indent = acc.length > 0
            ? (() => {
                const prev = acc[acc.length - 1];
                const prevIndent = prev.match(/^\s*/)?.[0].length ?? 0;
                if (line.match(/^<\//)) return Math.max(0, prevIndent - 2);
                if (prev.match(/^(\s*)<[^/!?][^>]*[^/]>$/)) return prevIndent + 2;
                return prevIndent;
              })()
            : 0;
          acc.push(" ".repeat(indent) + line.trim());
          return acc;
        }, [])
        .join("\n");
    } else {
      preview = raw;
    }
  }

  const embedPdf = doc.meta.contentType.includes("pdf");

  return c.html(<EventDetailPage event={doc.meta} preview={preview} embedPdf={embedPdf} />);
});

dashboard.get("/:topic/:id/raw", (c) => {
  const topic = c.req.param("topic");
  const id = c.req.param("id");
  const doc = getDocument(topic, id);

  if (!doc) {
    return c.text("Not found", 404);
  }

  return new Response(doc.data, {
    headers: {
      "Content-Type": doc.meta.contentType,
      "Content-Disposition": `inline; filename="${doc.meta.filename}"`,
    },
  });
});

const topicOverview = new Hono();

topicOverview.get("/", (c) => {
  const topics = getTopicSummaries();
  return c.html(<TopicOverviewPage topics={topics} />);
});

export { dashboard, topicOverview };
