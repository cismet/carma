import type { FC } from "hono/jsx";
import type { IngestEvent, TopicSummary } from "../storage";
import versionInfo from "../version.json";

const Layout: FC<{ children: any }> = ({ children }) => (
  <html lang="de">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>cidsDataBridge</title>
      <meta http-equiv="refresh" content="5" />
      <style>{`
        body {
          display: flex;
          justify-content: center;
          align-items: flex-start;
          min-height: 100vh;
          margin: 0;
          font-family: Arial, sans-serif;
          background-color: #f4f4f4;
          padding-top: 1.5rem;
        }
        .container {
          max-width: 1100px;
          width: 100%;
          padding: 2rem;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1.5rem;
        }
        .header-left {
          text-align: left;
        }
        .logo {
          max-width: 200px;
        }
        .title {
          font-size: 28px;
          color: #333;
          margin-bottom: 0.25rem;
          font-weight: bold;
        }
        .version {
          font-size: 12px;
          color: #999;
          font-weight: normal;
          margin-left: 0.5rem;
        }
        .message {
          font-size: 16px;
          color: #666;
          line-height: 1.6;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 15px;
          text-align: left;
          background: #fff;
          border-radius: 0.5rem;
          overflow: hidden;
        }
        th, td {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #eee;
        }
        th {
          background: #fafafa;
          font-weight: 600;
          color: #333;
        }
        tr:hover td {
          background: #f9f9f9;
        }
        a {
          color: #0366d6;
          text-decoration: none;
        }
        a:hover {
          text-decoration: underline;
        }
        .badge {
          background: #e8e8e8;
          padding: 0.15rem 0.4rem;
          border-radius: 0.25rem;
          font-size: 12px;
          font-family: monospace;
        }
        .params {
          font-size: 12px;
          color: #666;
          font-family: monospace;
        }
        .empty {
          color: #999;
          padding: 2rem 0;
          font-size: 16px;
        }
        .info {
          margin-top: 1.5rem;
          padding: 1rem;
          background: #fff;
          border-radius: 0.5rem;
          font-size: 14px;
          color: #666;
        }
        .back-link {
          display: inline-block;
          margin-top: 1rem;
          padding: 0.5rem 1.5rem;
          background: #0366d6;
          color: white;
          border-radius: 0.5rem;
          font-weight: 600;
          transition: background 0.3s;
        }
        .back-link:hover {
          background: #0256c4;
          text-decoration: none;
          color: white;
        }
        .detail-table {
          text-align: left;
          margin: 0 auto;
        }
        .detail-table th {
          width: 160px;
          white-space: nowrap;
          vertical-align: top;
        }
        pre {
          background: #f4f4f4;
          padding: 1rem;
          border-radius: 0.5rem;
          overflow-x: auto;
          font-size: 13px;
          max-height: 400px;
          overflow-y: auto;
          text-align: left;
          margin: 0;
        }
      `}</style>
    </head>
    <body>
      <div class="container">{children}</div>
    </body>
  </html>
);

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const DashboardPage: FC<{ events: IngestEvent[]; topic?: string }> = ({ events, topic }) => (
  <Layout>
    <div class="header">
      <div class="header-left">
        <div class="title">cidsDataBridge <span class="version">v{versionInfo.version}</span></div>
        <div class="message">
          {topic ? <span>Topic: <span class="badge">{topic}</span></span> : "Ingest events, most recent first."}
        </div>
      </div>
      <img
        src="https://cismet.de/images/cismet_signet_rgb_buntesC.png"
        alt="cismet Logo"
        class="logo"
      />
    </div>

    {events.length === 0 ? (
      <div>
        <p class="empty">No events yet.</p>
        <div class="info">
          POST to <code class="badge">/ingest/:topic/:id</code> to get started.
        </div>
      </div>
    ) : (
      <table>
        <thead>
          <tr>
            <th>Topic</th>
            <th>ID</th>
            <th>Time</th>
            <th>Content-Type</th>
            <th>Size</th>
            <th>Params</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr>
              <td>
                <span class="badge">{e.topic}</span>
              </td>
              <td>
                <a href={`/events/${e.topic}/${e.id}`}>{e.id}</a>
              </td>
              <td>{formatTime(e.timestamp)}</td>
              <td>
                <span class="badge">{e.contentType}</span>
              </td>
              <td>{formatSize(e.size)}</td>
              <td class="params">
                {Object.keys(e.ingestionParams).length > 0
                  ? Object.entries(e.ingestionParams)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(", ")
                  : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </Layout>
);

export const EventDetailPage: FC<{ event: IngestEvent; preview: string | null; embedPdf?: boolean }> = ({
  event,
  preview,
  embedPdf,
}) => (
  <Layout>
    <div class="header">
      <div class="header-left">
        <div class="title">cidsDataBridge <span class="version">v{versionInfo.version}</span></div>
        <div class="message">{event.topic} / {event.id}</div>
      </div>
      <img
        src="https://cismet.de/images/cismet_signet_rgb_buntesC.png"
        alt="cismet Logo"
        class="logo"
      />
    </div>

    <table class="detail-table">
      <tbody>
        <tr>
          <th>Topic</th>
          <td><span class="badge">{event.topic}</span></td>
        </tr>
        <tr>
          <th>ID</th>
          <td>{event.id}</td>
        </tr>
        <tr>
          <th>Timestamp</th>
          <td>{formatTime(event.timestamp)}</td>
        </tr>
        <tr>
          <th>Content-Type</th>
          <td>
            <span class="badge">{event.contentType}</span>
          </td>
        </tr>
        <tr>
          <th>Size</th>
          <td>{formatSize(event.size)}</td>
        </tr>
        <tr>
          <th>Ingestion Params</th>
          <td class="params">
            {Object.keys(event.ingestionParams).length > 0
              ? Object.entries(event.ingestionParams)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(", ")
              : "-"}
          </td>
        </tr>
      </tbody>
    </table>

    {preview !== null && (
      <div style="margin-top: 1.5rem;">
        <pre>{preview}</pre>
      </div>
    )}

    {embedPdf && (
      <iframe
        src={`/events/${event.topic}/${event.id}/raw`}
        style="width: 100%; height: 600px; border: 1px solid #eee; border-radius: 0.5rem; margin-top: 1.5rem;"
      />
    )}

    <a href="/events" class="back-link">Back to events</a>
  </Layout>
);

export const TopicOverviewPage: FC<{ topics: TopicSummary[] }> = ({ topics }) => (
  <Layout>
    <div class="header">
      <div class="header-left">
        <div class="title">cidsDataBridge <span class="version">v{versionInfo.version}</span></div>
        <div class="message">Topics</div>
      </div>
      <img
        src="https://cismet.de/images/cismet_signet_rgb_buntesC.png"
        alt="cismet Logo"
        class="logo"
      />
    </div>

    {topics.length === 0 ? (
      <div>
        <p class="empty">No topics yet.</p>
        <div class="info">
          POST to <code class="badge">/ingest/:topic/:id</code> to get started.
        </div>
      </div>
    ) : (
      <table>
        <thead>
          <tr>
            <th>Topic</th>
            <th>Documents</th>
            <th>Last Activity</th>
          </tr>
        </thead>
        <tbody>
          {topics.map((t) => (
            <tr>
              <td>
                <a href={`/events/${t.topic}`}>{t.topic}</a>
              </td>
              <td>{t.count}</td>
              <td>{t.lastActivity ? formatTime(t.lastActivity) : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}

    <a href="/events" class="back-link" style="margin-top: 1.5rem;">All events</a>
  </Layout>
);
