import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface IngestEvent {
  id: string;
  topic: string;
  filename: string;
  timestamp: string;
  contentType: string;
  size: number;
  ingestionParams: Record<string, string>;
}

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "application/json": ".json",
  "text/xml": ".xml",
  "application/xml": ".xml",
  "text/plain": ".txt",
  "text/html": ".html",
  "text/csv": ".csv",
  "application/pdf": ".pdf",
};

function extensionForContentType(contentType: string): string {
  const base = contentType.split(";")[0].trim().toLowerCase();
  return CONTENT_TYPE_EXTENSIONS[base] ?? ".bin";
}

const STORAGE_DIR = process.env.STORAGE_DIR ?? "./storage";

export function ensureStorageDir() {
  mkdirSync(STORAGE_DIR, { recursive: true });
}

function ensureTopicDir(topic: string) {
  mkdirSync(join(STORAGE_DIR, topic), { recursive: true });
}

export function storeDocument(
  topic: string,
  id: string,
  body: ArrayBuffer,
  contentType: string,
  ingestionParams: Record<string, string>,
): IngestEvent {
  ensureTopicDir(topic);

  const timestamp = new Date().toISOString();
  const ext = extensionForContentType(contentType);
  const filename = `${id}${ext}`;
  const topicDir = join(STORAGE_DIR, topic);
  const dataPath = join(topicDir, filename);
  const metaPath = join(topicDir, `${id}.meta.json`);

  const meta: IngestEvent = {
    id,
    topic,
    filename,
    timestamp,
    contentType,
    size: body.byteLength,
    ingestionParams,
  };

  writeFileSync(dataPath, Buffer.from(body));
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  return meta;
}

export function getRecentEvents(limit = 20, topicFilter?: string): IngestEvent[] {
  ensureStorageDir();

  const topics = topicFilter
    ? [topicFilter]
    : readdirSync(STORAGE_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

  const events: IngestEvent[] = [];

  for (const topic of topics) {
    const topicDir = join(STORAGE_DIR, topic);
    const files = readdirSync(topicDir).filter((f) => f.endsWith(".meta.json"));

    for (const f of files) {
      try {
        const content = readFileSync(join(topicDir, f), "utf-8");
        events.push(JSON.parse(content) as IngestEvent);
      } catch {
        // skip corrupted meta files
      }
    }
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return events.slice(0, limit);
}

export interface TopicSummary {
  topic: string;
  count: number;
  lastActivity: string;
}

export function getTopicSummaries(): TopicSummary[] {
  ensureStorageDir();

  const topics = readdirSync(STORAGE_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  return topics.map((topic) => {
    const topicDir = join(STORAGE_DIR, topic);
    const metaFiles = readdirSync(topicDir).filter((f) => f.endsWith(".meta.json"));

    let lastActivity = "";
    for (const f of metaFiles) {
      try {
        const meta = JSON.parse(readFileSync(join(topicDir, f), "utf-8")) as IngestEvent;
        if (meta.timestamp > lastActivity) lastActivity = meta.timestamp;
      } catch {
        // skip
      }
    }

    return { topic, count: metaFiles.length, lastActivity };
  }).sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
}

export function getDocument(topic: string, id: string): { data: Buffer; meta: IngestEvent } | null {
  try {
    const topicDir = join(STORAGE_DIR, topic);
    const meta = JSON.parse(
      readFileSync(join(topicDir, `${id}.meta.json`), "utf-8"),
    ) as IngestEvent;
    const data = readFileSync(join(topicDir, meta.filename));
    return { data: Buffer.from(data), meta };
  } catch {
    return null;
  }
}
