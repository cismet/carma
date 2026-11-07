# map-relay

A session-state relay for remote-controlling a browser SPA over nothing but plain HTTP requests. No WebSockets, no MQTT, so it survives locked-down municipal LANs and TLS-inspecting proxies.

Its first consumer is the geoportal's `#/outlet` route, the projection-mapping source window: carmaPM screen-captures that window and projects it onto the printed Wuppertal model, so nobody is sitting at the machine that renders it and its content has to be steerable from somewhere else. The presenter steers it from a phone (`apps/pm-remote`), and a plain geoportal opened with `#/?relay=<CODE>` follows the same show and tells the outlet what it looks at. See `curl-examples.md` for the two-command version.

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

The relay knows nothing about maps. What a state document means is decided entirely by whoever applies it. The carma clients share one format, described below; in the geoportal the `mapRelay` addon (`libraries/mapping/addons/src/addons/MapRelay/`) follows the sessions, and the `outlet` and `relayFollower` addons apply what it hears.

## What a session holds

The format is defined in `libraries/mapping/show-remote/src/lib/relay-document.ts`. Every write replaces the whole document, so each writer of a show has a session of its own behind the show's code. The first three carry the show; the others are the outlet's answers to the phone (`display-info.ts`, `series-status.ts`, `snapshot.ts`, `pointer-link.ts`):

| Session            | Written by                                           | Read by                                   |
|--------------------|------------------------------------------------------|-------------------------------------------|
| `<CODE>`           | the presenter (pm-remote)                            | outlet, following geoportal, other phones |
| `<CODE>-G`         | the geoportal following the show (`#/?relay=<CODE>`) | outlet                                    |
| `<CODE>-P`         | the presenter's pointer, while it is open            | outlet                                    |
| `<CODE>-PO`, `-PA` | phone and outlet: the pointer's WebRTC handshake     | each other                                |
| `<CODE>-D`         | the outlet: what kind of display it is               | pm-remote                                 |
| `<CODE>-T`         | the outlet: where its time series stands             | pm-remote                                 |
| `<CODE>-S`         | the outlet: a small picture, when the phone asks     | pm-remote                                 |

A presenter document has a section every display applies, `"*"`, and one section per target tag for what only some displays get:

```
{
  "*":          { "config": <layers every display gets>, "scene": "<scene id>", "highlights": [...], ... },
  "outlet":     { "config": <all the outlet gets> },
  "geoportal":  { "config": <all the following geoportal gets> },
  "_presenter": { "name": "<typed on the phone>", "device": "<random per phone>" }
}
```

- A display applies `"*"` and then the section of each of its tags, left to right (`resolveTargets`). A section replaces whole top-level keys, so a target's `config` replaces the shared one, and `null` removes a key for that display. The outlet carries the tag `outlet`, the plain geoportal `geoportal`; the `mapRelay` addon takes the tag from the route unless its config names `targets`.
- pm-remote writes a target section only when pm-show marked a layer of the live scene for some displays (`layer-targets.ts`). Without marks the document has only `"*"`.
- Keys starting with `_` are the writer's metadata and reach no display. `_presenter` says who presents; pm-remote lets one phone present at a time, the relay enforces nothing.
- `scene` is the id of the live scene. The following geoportal flies whenever it changes: to the scene's `bounds` if it has them, else to the model.
- `pointer` names the pointer session the outlet subscribes to (`pointer.ts`).
- A document without `"*"` counts as entirely shared, so `{"config": ...}` from a script still works.

The geoportal's session holds where it looks and what was picked there, both under `"*"` (`geoportal-view.ts`):

```
{
  "*": {
    "frame": [<minX>, <minY>, <maxX>, <maxY>],
    "selection": {
      "spot": { "id": "<id>", "center": [<x>, <y>], "radiusMeters": <15 to 400>, "dim": <0 to 1> },
      "feature": { "layerId": "<geoportal layer>", "featureId": <id>, "properties": { "title": "<info box text>", ... } }
    }
  }
}
```

Coordinates are EPSG:3857. `frame` is the visible rectangle and `null` while the map still sits where the scene put it; `selection` is `null` without a pick. The outlet lights the frame and the selection on the model and drops a frame it has not heard for 90 s, so the geoportal repeats it every 30 s.

### Writes that name their version (`ifV`)

A write may carry the version it replaces: `{"state": {...}, "ifV": 7}`. The relay takes it only while the session is still at that version and otherwise answers `409` with `{"error":"version conflict","v":<current>,"state":<current>}`. pm-remote writes this way, so a phone whose show was taken over by another phone cannot overwrite it; it reads the answer and switches to watching.

### One wait for several sessions (`/w`)

`GET /w?s=T852B:12,T852B-G:4&wait=25000` waits on all named sessions at once (at most `MAX_WATCH`) and comes back as soon as one of them is past the version given, or after `wait` ms. The answer is `{"sessions": {"<CODE>": ...}}`: the full snapshot for a session that moved on, the same without `state` for one that did not, and `{"error":"unknown session"}` for one the relay does not know (counted as a miss, like a single read). A browser gives a plain HTTP/1.1 host six connections, shared by all its tabs, and every held wait takes one; an outlet, a remote and a geoportal on one machine used to hold more than that, so writes and reads queued for up to half a minute. The carma client (`subscribeRelay`) puts all waits of a page on one relay into this single request, and falls back to one request per session when the relay answers `404` for `/w`. Over HTTP/2 (the live relay behind nginx) the limit does not exist, but one request is still less than five.

## Run it

```bash
npx nx run map-relay:serve     # :8099, ALLOW_ORIGIN=*, AUTO_CREATE=1
npx nx run map-relay:test      # 23 checks against a real server on an ephemeral port
```

## Configuration

| Env var | Default | Notes |
|---|---|---|
| `PORT` | `8080` | The nx `serve` target uses `8099`. |
| `ALLOW_ORIGIN` | `*` | Set this in production to the exact display origin: scheme and host, no trailing slash, no path. |
| `AUTO_CREATE` | off | Lets a writer open the session it names instead of taking a code from `/new`. On in development and on the live relay: pm-remote's pointer session (`<code>-P`) and hand-picked display codes need it. |
| `MAX_SESSIONS` | `1000` | Refuses new sessions beyond this, which is what keeps `AUTO_CREATE` bounded. |
| `FAST_POLL_MS` | `250` | Poll hint sent while a session is active. |
| `SLOW_POLL_MS` | `2000` | Poll hint sent once idle. |
| `HOT_MS` | `60000` | How long activity keeps a session "fast". |
| `MAX_WAIT_MS` | `25000` | Long-poll hold. Keep below nginx's `proxy_read_timeout`. |
| `MAX_WATCH` | `16` | Sessions one `/w` request may name. |
| `SESSION_TTL_MS` | `21600000` | Idle sessions are dropped after 6 h. |

## Publish the image

The image is `cismet/carma-map-relay`, built from the workspace root, and registered in `deployment-config.json` like every other containerised project here. CI publishes it: the "Deployment" workflow with `project-name=map-relay` and `target=live` tags `<md5short>`, `latest` and the version from `src/version.json`; a push to `dev` tags `dev-latest`.

By hand, when you want to check something before it goes out:

```bash
docker login                          # needs push rights on the cismet org
npx nx run map-relay:container        # builds from the workspace root and pushes :latest
```

Add `INPUT_PUSH=false` to build without pushing. The Dockerfile expects the workspace root as its build context, so `docker build` inside this directory will not work; use `docker build -f services/map-relay/Dockerfile .` from the repository root if you want to bypass nx.

## Deploy

```bash
scp services/map-relay/docker-compose.yml you@server:/opt/map-relay/
ssh you@server
cd /opt/map-relay
# set ALLOW_ORIGIN to the display origin first; AUTO_CREATE stays on (see Configuration)
docker compose pull && docker compose up -d
curl localhost:8099/healthz
```

Then take `nginx-relay.conf`: variant A is a `location /relay/` for an existing TLS vhost, variant B a standalone vhost for a hostname of its own. The three settings that matter either way are `proxy_read_timeout 75s` (must exceed the 25 s hold), `proxy_buffering off`, and `proxy_http_version 1.1` with `Connection ""` for upstream keep-alive.

## Limits worth knowing

- **State is in memory.** A container restart drops every session and what it held. The carma clients get a `404` and open their session again (`POST /s/<CODE>/hello`, which needs `AUTO_CREATE`), so displays pick up with the next write. Fine for ad-hoc use; add Redis if sessions need to survive a deploy.
- **The code is the only credential.** Eight characters from a 32-character alphabet is about 1.1e12 combinations, with guessing throttled to 30 misses per minute per IP. Proportionate for "someone could change which layers a screen shows", not for anything confidential. With `AUTO_CREATE` on it is not a credential at all, since any well-formed code an attacker invents becomes a live session. The live relay runs with it on anyway, because the pm-remote pointer opens its own session; a hand-picked code like `ZEIGER1` is then as good as public, so pick one nobody would guess when it matters.
- **Single process.** The waiter set is per-process, so two replicas behind a load balancer would need shared pub/sub between them.
