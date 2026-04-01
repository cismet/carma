# cidsDataBridge

Generic REST service for receiving and storing structured data from external systems into the cids ecosystem.

## Context

The service acts as an ingestion endpoint for structured documents (JSON, XML, PDF, etc.) sent by external systems. Documents are organized by topic and stored locally with metadata. A built-in web dashboard provides immediate visibility into received data.

The service runs on the intranet. Authentication is omitted during development.

## Endpoints

| Method | Path                        | Description                     |
|--------|-----------------------------|---------------------------------|
| GET    | `/dashboard`                | Topic overview with navigation  |
| POST   | `/ingest/:topic/:id`        | Store a document                |
| GET    | `/events`                   | All events (last 20)            |
| GET    | `/events/:topic`            | Events filtered by topic        |
| GET    | `/events/:topic/:id`        | Event detail view               |
| GET    | `/events/:topic/:id/raw`    | Download original file          |

- `:topic` groups documents into subdirectories (e.g. `baulast-verpf-erkl`, `verdis-feb-com`)
- `:id` is used as the filename
- Query parameters are stored as `ingestionParams` in a `.meta.json` file
- The `Content-Type` header determines the file extension:

| Content-Type       | Extension |
|--------------------|-----------|
| `application/json` | `.json`   |
| `text/xml`         | `.xml`    |
| `application/xml`  | `.xml`    |
| `text/plain`       | `.txt`    |
| `text/csv`         | `.csv`    |
| `application/pdf`  | `.pdf`    |
| other              | `.bin`    |

## Usage

### Send JSON

```bash
curl -X POST "http://localhost:3000/ingest/baulast-verpf-erkl/VE-2026-0001?abteilung=402" \
  -H "Content-Type: application/json" \
  -d '{"dokumenttyp":"Verpflichtungserklaerung","name":"Max Mustermann","personalnummer":"P-40215-0042"}'
```

### Send XML

```bash
curl -X POST "http://localhost:3000/ingest/baulast-verpf-erkl/VE-2026-0002?abteilung=301" \
  -H "Content-Type: text/xml" \
  -d '<verpflichtungserklaerung><name>Max Mustermann</name><personalnummer>P-30100-0118</personalnummer></verpflichtungserklaerung>'
```

### Send PDF

```bash
curl -X POST "http://localhost:3000/ingest/verdis-feb-com/DOC-2026-0001?quelle=d3" \
  -H "Content-Type: application/pdf" \
  --data-binary @dokument.pdf
```

### Response

HTTP 201 with JSON:

```json
{
  "status": "ok",
  "event": {
    "id": "VE-2026-0001",
    "topic": "baulast-verpf-erkl",
    "filename": "VE-2026-0001.json",
    "timestamp": "2026-03-31T15:30:33.653Z",
    "contentType": "application/json",
    "size": 98,
    "ingestionParams": {
      "abteilung": "402"
    }
  }
}
```

## File storage

```
storage/
  baulast-verpf-erkl/
    VE-2026-0001.json          # Document content
    VE-2026-0001.meta.json     # Metadata + ingestionParams
    VE-2026-0002.xml
    VE-2026-0002.meta.json
  verdis-feb-com/
    DOC-2026-0001.pdf
    DOC-2026-0001.meta.json
```

## Development

Prerequisite: [Bun](https://bun.sh/) (globally installed).

```bash
cd services/cidsDataBridge
bun install
bun run src/index.tsx
```

Or via Nx (with auto-restart on file changes):

```bash
npx nx run cids-data-bridge:serve
```

Dashboard: `http://localhost:3000/dashboard`

## Docker

Docker Hub: [`cismet/cids-data-bridge`](https://hub.docker.com/r/cismet/cids-data-bridge)

Build container (via Nx):

```bash
npx nx run cids-data-bridge:container --push=false
```

Run manually:

```bash
docker run -p 3000:3000 -v /path/to/storage:/data cismet/cids-data-bridge:latest
```

## Environment variables

| Variable      | Default     | Description                                  |
|---------------|-------------|----------------------------------------------|
| `PORT`        | `3000`      | Server port                                  |
| `STORAGE_DIR` | `./storage` | Storage directory (in container: `/data`)     |

## Tech stack

- Runtime: [Bun](https://bun.sh/)
- Framework: [Hono](https://hono.dev/)
- UI: Hono JSX (server-side rendered, auto-refresh)
- Parent container: `oven/bun:alpine`
