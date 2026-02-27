# unpckr

Minimal HTTP service that unpacks `.tar.gz` archives on demand. Designed to work alongside a WebDAV server: upload a tarball via WebDAV, then tell unpckr to unpack it. Both containers mount the same volume.

## Why

Uploading thousands of small tile files via WebDAV is extremely slow. Instead, tar the tileset into a single file, upload that one file via WebDAV, then call unpckr to extract it in place.

## API

### `POST /unpack`

Unpacks a `.tar.gz` file relative to the configured base directory. Deletes the archive after successful extraction.

**Headers:**
- `Authorization: Bearer <UNPCKR_TOKEN>`

**Body:**
```json
{ "file": "alkis.tar.gz" }
```

**Response (200):**
```json
{ "status": "ok", "file": "alkis.tar.gz", "target": "/data" }
```

**Errors:** 400 (bad request), 401 (unauthorized), 403 (path traversal), 404 (file not found), 500 (unpack failed)

### `GET /health`

Returns `{ "status": "ok" }`. No auth required.

## Security

- Bearer token auth (set via `UNPCKR_TOKEN` env var, required)
- Path traversal protection: rejects any path resolving outside `UNPCKR_BASE_DIR`
- Only `.tar.gz` / `.tgz` files accepted
- Should only be exposed on internal Docker network, never to the public internet

## Environment Variables

| Variable          | Required | Default  | Description                          |
|-------------------|----------|----------|--------------------------------------|
| `UNPCKR_TOKEN`   | yes      |          | Bearer token for authentication      |
| `UNPCKR_BASE_DIR`| no       | `/data`  | Root directory for file operations   |
| `PORT`            | no       | `3000`   | Port to listen on                    |

## Docker

### Build

```bash
docker build -t unpckr .
```

### Run

```bash
docker run -d \
  -e UNPCKR_TOKEN=my-secret-token \
  -e UNPCKR_BASE_DIR=/data \
  -v /path/to/tiles:/data \
  -p 3000:3000 \
  unpckr
```

### docker-compose example

```yaml
services:
  unpckr:
    build: .
    environment:
      UNPCKR_TOKEN: ${UNPCKR_TOKEN}
      UNPCKR_BASE_DIR: /data
    volumes:
      - tiles-data:/data
    # Only expose on internal network, not to the host
    expose:
      - "3000"
```

Mount the same volume as your WebDAV and nginx containers.

## Usage from the tiling pipeline

```bash
# 1. Create tarball
tar czf /tmp/alkis.tar.gz -C _out alkis

# 2. Upload single file via WebDAV
curl -T /tmp/alkis.tar.gz https://webdav.example.com/tiles/alkis.tar.gz

# 3. Tell unpckr to extract it
curl -X POST http://unpckr:3000/unpack \
  -H "Authorization: Bearer my-secret-token" \
  -H "Content-Type: application/json" \
  -d '{"file": "alkis.tar.gz"}'
```

## TODO (for integration into the tiling pipeline)

- Add tar + unpckr call to `webdavUploadAtomic.js` as an alternative upload mode
- Consider adding a `--tar-upload` flag to the pipeline
- The atomic rename strategy needs adaptation: upload tarball, unpack to temp dir, rename
