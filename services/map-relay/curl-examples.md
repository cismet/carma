# map-relay, by hand

Start the relay with the development defaults (`PORT=8099`, `ALLOW_ORIGIN=*`, `AUTO_CREATE=1`):

```bash
npx nx run map-relay:serve
```

Session codes are case-insensitive: the relay upper-cases them, so `ooc0eeQu` and `OOC0EEQU` are the same session.

## Drive the projection-mapping source window

Open the source window, where `relay` carries the session code and `bounds` the georeference of the printed model:

```
http://localhost:4200/#/outlet?ff=ng&bounds=799889.651999282,6669297.559285149,802976.986756942,6671027.711313527&relay=ooc0eeQu
```

Switch it to the default PM setup:

```bash
curl -sS -X POST http://localhost:8099/s/ooc0eeQu \
  -H 'Content-Type: text/plain' \
  -d '{"state":{"config":"6633182cc028a4a5"}}'
```

Switch it to the black ALKIS variant:

```bash
curl -sS -X POST http://localhost:8099/s/ooc0eeQu \
  -H 'Content-Type: text/plain' \
  -d '{"state":{"config":"f8060f5f7fed5ac0"}}'
```

Both answer `{"v":<n>,"ts":<epoch ms>}`. The version counter increments per write; the display uses it to notice changes.

### Send the configuration instead of its id

`config` also takes the configuration itself. Nothing has to be stored for it and the display does not fetch anything, so a remote that composes what to project can just say it:

```bash
curl -sS -X POST http://localhost:8099/s/ooc0eeQu \
  -H 'Content-Type: text/plain' \
  -d '{"state":{"config":{
        "backgroundLayer":{"id":"karte","selectedLayerId":"stadtplan","visible":false,"opacity":1,"title":"","layers":"","layerType":"wmts"},
        "layers":[
          {"id":"custom:https://tiles.cismet.de/alkis/style.json","title":"","layerType":"vector","visible":true,"opacity":1,
           "props":{"style":"https://tiles.cismet.de/alkis/style.json"}},
          {"id":"custom:https://tiles.cismet.de/pm_trees/style.json","title":"","layerType":"vector","visible":true,"opacity":1,
           "props":{"style":"https://tiles.cismet.de/pm_trees/style.json"}}
        ]}}}'
```

A whole stored configuration works unchanged as well: keys the map does not need (`view`, `gazetteerSelection`, `selectedFeature`, and everything descriptive inside a layer) may be present and are ignored. The example above is what is left after dropping them, 526 bytes against the ~6 KB the same setup takes as stored.

What the display actually reads:

- **layers** (required, array): per entry `id`, `layerType`, `visible`, `props.style` for vector layers, `opacity` (defaults to 1). `id` becomes the map's source name, so keep it stable across writes: a changed id rebuilds the layer instead of updating it, which is visible on the projection. Array order is the draw order.
- **backgroundLayer** (optional): only `selectedLayerId`, `visible`, `opacity` and `id` are read. `selectedLayerId` names an entry of the app's own base-map table, which is where the title and the description texts come from. Leave the whole block out for layers over nothing, or send `visible: false` to keep a base map selected but dark.

Re-sending an identical configuration changes nothing on screen; the display compares content, not just ids.

`Content-Type: text/plain` is not cosmetic. The browser client sends its writes the same way, because `application/json` would make the request non-simple and fire a CORS preflight on every single one. The relay `JSON.parse`s the body regardless of the header.

## Inspect

```bash
curl -sS http://localhost:8099/healthz
curl -sS 'http://localhost:8099/s/ooc0eeQu?since=-1'
```

The read returns the current document plus the metadata the display needs:

```json
{"v":2,"state":{"config":"f8060f5f7fed5ac0"},"ts":1753980000000,"now":1753980000123,"hot":true,"pollAfterMs":250}
```

`ts` is when the state last changed and `now` is the server clock at the time of the response, so a client can correct for its own clock skew before judging how stale the state is.

## Watch a change arrive

Park a long poll on the current version, then write from a second shell. The parked request returns within milliseconds of the write instead of waiting out its hold:

```bash
# shell 1: hangs until something changes, at most 25 s
curl -sS 'http://localhost:8099/s/ooc0eeQu?since=2&wait=25000'

# shell 2
curl -sS -X POST http://localhost:8099/s/ooc0eeQu \
  -H 'Content-Type: text/plain' \
  -d '{"state":{"config":"6633182cc028a4a5"}}'
```

## Create a session the production way

With `AUTO_CREATE` off, a code has to be issued by the relay:

```bash
curl -sS -X POST http://localhost:8099/new
# {"code":"7QK2MXTD","pollAfterMs":250}
```

Writing to a code that does not exist then returns `404`, and after 30 misses in a minute the caller's IP gets `429`.
