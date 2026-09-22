# ceepr

**Configuration Entry & Exchange Persistence Relay**

A lightweight service for storing and retrieving configuration objects with unique identifiers. Part of the CARMA project ecosystem.

## Overview

ceepr provides a simple API for storing JSON configuration objects and retrieving them later using a unique random key. This is useful for sharing configuration states between applications or storing temporary configurations without requiring a full database.

## Features

- Store arbitrary JSON configuration objects
- Generate unique random keys for each configuration
- Organize configurations in hierarchical folder structures
- Retrieve configurations using their unique keys
- Input validation to ensure valid configurations
- Error handling with consistent JSON responses
- Graceful shutdown handling

## API Endpoints

### GET /

Returns basic service information.

**Response:**
```json
{
  "message": "ceepr - Configuration Entry & Exchange Persistence Relay"
}
```

### POST /store[/structure/path]

Stores a configuration and returns a unique key. Optionally, you can specify a structure path to organize configurations hierarchically.

**Request Body:**
Any valid non-empty JSON object.

**Example Request with structure path:**
```bash
curl -X POST http://localhost:3000/store/wuppertal/geoportal \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Map Configuration",
    "layers": [
      {
        "id": "base",
        "type": "tile",
        "url": "https://example.com/tiles/{z}/{x}/{y}.png",
        "visible": true
      }
    ],
    "view": {
      "center": [7.6261, 51.9607],
      "zoom": 12
    }
  }'
```

**Response:**
```json
{
  "key": "a1b2c3d4e5f6g7h8",
  "path": "wuppertal/geoportal"
}
```

**Optional header `X-Ceepr-Edit-Token`:** 16 to 256 characters of `A-Z a-z 0-9 _ -`, chosen by the client. A configuration stored with one can later be replaced under the same key (see PUT below), so a link handed out once keeps working after the content changes. Only the token's sha256 is kept, in a `<key>.edit` file next to the configuration; the read routes never serve it. Without the header a configuration can never change, which is what every share link relies on.

### PUT /store/structure/path/:key

Replaces a configuration that was stored with an edit token. Needs the same token in `X-Ceepr-Edit-Token`.

```bash
curl -X PUT http://localhost:3000/store/wuppertal/_dev_geoportal_pmshows/a1b2c3d4e5f6a7b8 \
  -H "Content-Type: application/json" \
  -H "X-Ceepr-Edit-Token: <the token used on store>" \
  -d '{"title": "changed"}'
```

| Status | Meaning                                                  |
| ------ | -------------------------------------------------------- |
| 200    | replaced, body `{ "key": ..., "path": ... }`              |
| 401    | no usable token in the header                             |
| 403    | wrong token, or the configuration was stored without one |
| 404    | no configuration under this key                           |

### GET /config/:key

Retrieves a configuration by its key from the root storage directory.

**Parameters:**
- `key`: The unique key for the configuration (hexadecimal string)

**Response:**
The stored configuration object.

### GET /config/structure/path/:key

Retrieves a configuration by its key from a specific structure path.

**Parameters:**
- `structure/path`: The hierarchical path where the configuration is stored
- `key`: The unique key for the configuration (hexadecimal string)

**Example:**
```bash
curl http://localhost:3000/config/wuppertal/geoportal/a1b2c3d4e5f6g7h8
```

**Response:**
The stored configuration object.

## Error Handling

The service returns appropriate HTTP status codes and JSON error messages:

- `400 Bad Request`: Invalid input (empty object, invalid JSON, invalid key format)
- `404 Not Found`: Configuration not found
- `500 Internal Server Error`: Server-side errors

## Development

### Prerequisites

- Node.js (LTS version)
- NX build system

### Local Development

```bash
# Build the service
npx nx run ceepr:build

# Run the service in development mode
npx nx run ceepr:serve
```

### Environment Variables

- `HOST`: Host to bind the server to (default: "localhost")
- `PORT`: Port to listen on (default: 3000)
- `STORAGE_DIR`: Directory to store configuration files (default: "<app_dir>/storage")
- `ALLOWED_ORIGINS`: Comma-separated list of origins allowed to access the API via CORS (e.g., "http://localhost:4200,https://example.com"). Use `*` to allow all origins during development.

### Docker

The service can be built and run as a Docker container:

```bash
# Build the Docker image
npx nx run ceepr:container

# Run the Docker container
docker run -p 3000:3000 ceepr
```

## Testing

A test script is provided to verify the service functionality:

```bash
chmod +x test-commands.sh
./test-commands.sh
```

Alternatively, you can use the curl examples in `curl-examples.md` to test individual endpoints manually.

## Integration

To integrate with the service from your application:

1. Store a configuration:
```javascript
const response = await fetch('http://localhost:3000/store/my/structure/path', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(yourConfig)
});
const { key, path } = await response.json();
```

2. Retrieve a configuration:
```javascript
const response = await fetch(`http://localhost:3000/config/${path}/${key}`);
const config = await response.json();
```

## License

Part of the CARMA project. See the project license for details.
