# map-relay

A session-state relay for remote-controlling a browser SPA over nothing but plain HTTP requests. No WebSockets, no MQTT, so it survives locked-down municipal LANs and TLS-inspecting proxies.

Its first consumer is the geoportal's `#/outlet` route, the projection-mapping source window: carmaPM screen-captures that window and projects it onto the printed Wuppertal model, so nobody is sitting at the machine that renders it and its content has to be steerable from somewhere else. See `curl-examples.md` for the two-command version.

```
remote device            relay                        display / geoportal
(curl, phone, MCP)       node :8099                   (#/outlet)
      |                          |                            |
      |  POST /s/CODE  -------> |  in-memory session state   |
      |                          | <-- GET /s/CODE?since=N&wait=25000
```

## Why this shape

- **Shared state, not commands.** The remote writes the whole state document; the display applies it idempotently. Reloads, reconnects and late joiners are then free, because there is no command log anyone has to replay. It is also what makes an MCP remote practical later: it can read the current state before writing a new one.
- **Version counter in the JSON body, not an ETag.** `If-None-Match` is not a CORS-safelisted header, so ETag polling would fire an `OPTIONS` preflight on every single poll. A plain `GET` with no custom headers is a "simple request" and goes out in one round trip.
- **POSTs are sent as `text/plain`.** Same reason: `application/json` triggers a preflight, `text/plain` does not. The server `JSON.parse`s the body regardless.
- **Long polling first, short polling as fallback.** The client opens a held request; if the network kills held requests three times in a row it silently drops to interval polling. Both look like ordinary HTTP traffic.

The relay knows nothing about maps. What a state document means is decided entirely by whoever applies it, which for the source window is `libraries/mapping/addons/src/addons/outlet/`.

## Run it

```bash
npx nx run map-relay:serve     # :8099, ALLOW_ORIGIN=*, AUTO_CREATE=1
npx nx run map-relay:test      # 15 checks against a real server on an ephemeral port
```

## Configuration

| Env var | Default | Notes |
|---|---|---|
| `PORT` | `8080` | The nx `serve` target uses `8099`. |
| `ALLOW_ORIGIN` | `*` | Set this in production to the exact display origin: scheme and host, no trailing slash, no path. |
| `AUTO_CREATE` | off | Lets a writer open the session it names instead of taking a code from `/new`. On for development, off in production. |
| `MAX_SESSIONS` | `1000` | Refuses new sessions beyond this, which is what keeps `AUTO_CREATE` bounded. |
| `FAST_POLL_MS` | `250` | Poll hint sent while a session is active. |
| `SLOW_POLL_MS` | `2000` | Poll hint sent once idle. |
| `HOT_MS` | `60000` | How long activity keeps a session "fast". |
| `MAX_WAIT_MS` | `25000` | Long-poll hold. Keep below nginx's `proxy_read_timeout`. |
| `SESSION_TTL_MS` | `21600000` | Idle sessions are dropped after 6 h. |

## Deploy

```bash
scp -r services/map-relay/ you@server:/opt/map-relay
ssh you@server
cd /opt/map-relay
# set ALLOW_ORIGIN to the display origin first, and leave AUTO_CREATE off
docker compose up -d --build
curl localhost:8099/healthz
```

Then paste `nginx-relay.conf` into the existing TLS vhost and reload. The three settings that matter are `proxy_read_timeout 75s` (must exceed the 25 s hold), `proxy_buffering off`, and `proxy_http_version 1.1` with `Connection ""` for upstream keep-alive.

## Limits worth knowing

- **State is in memory.** A container restart drops every session and displays get a `404`, at which point they stop rather than reconnect. Fine for ad-hoc use; add Redis if sessions need to survive a deploy.
- **The code is the only credential.** Eight characters from a 32-character alphabet is about 1.1e12 combinations, with guessing throttled to 30 misses per minute per IP. Proportionate for "someone could change which layers a screen shows", not for anything confidential. With `AUTO_CREATE` on it is not a credential at all, since any well-formed code an attacker invents becomes a live session; that is why it defaults to off.
- **Single process.** The waiter set is per-process, so two replicas behind a load balancer would need shared pub/sub between them.
