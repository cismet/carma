# DZ_B_PRM shadow-texture assets

The unified Schatten addon owns capture geometry and optional 3D display. Its
first-level Bestand/BuGa-Entwurf choice selects the printable receiver. Advanced
settings optionally use the catalog 3D bridge as the proposal's shadow caster:
the STL bridge then only receives shadows, while the catalog bridge only casts.
The existing shared receiver draw filter keeps the catalog GLB out of capture
depth/color without excluding it from the light pass. Surroundings and trees
still cast and receive. Without the override, the STL bridge does both. Bestand
omits both proposed casters, retaining the override preference for later use.

The two optional workflows, "Schatten mit Karte" and "Schatten ohne Karte",
remain entry presets that enable the addon with the chosen background. The
separate bridge-comparison workflow was removed: that choice belongs to the
pane's advanced caster option. Neither preset adds separate geometry rows.
GLB binaries are served from `https://wupp-3d-data.cismet.de/dz-b-prm/derived`;
the repository contains manifests/provenance and conversion scripts, not the GLBs.

The generated `*.asset.json` provenance reports retain source/GLB checksums,
georeferencing, conversion parameters, and aggregate GPU-instancing results.
Individual instance-family diagnostics are intentionally omitted from the
checked-in reports; rerunning the converter reproduces the summary and GLB.

The source of truth is the [DZ_B_PRM STL collection](https://adhocdata.cismet.de/DZ_B_PRM/).
`build-dzb-prm-collection.py` downloads the source STLs to a separate raw
directory, invokes Blender for each part and quality, and writes a versioned
`collection.json` with the BuGa groups, bridge variants, georeference, source
and output checksums, and both official footprint GeoJSON files. It also
generates `buga.layer.json` for standalone ad-hoc loading with `modelCollection`
Secondary-Info controls. The unified shadow workflow (or an explicit `shadow=`
URL) instead enables the shadow addon, which owns the collection internally.
Raw STLs
are never modified. The adjacent `*.asset.json` files record Blender version,
cleanup and instancing statistics as well as per-part bounds.

```sh
python3 apps/geoportal/scripts/build-dzb-prm-collection.py \
  --raw-dir /path/to/dz-b-prm-raw \
  --output-dir /path/to/dz-b-prm-derived \
  --qualities 2m 5m
```

`--qualities 2m 5m original` additionally builds the roughly 31-million-triangle
source and includes **Original** in the existing detail selector. This is
optional and expensive; 5m remains the default. Completed GLBs are reused only after
both source and derivative SHA-256 checks pass. `--dry-run` prints the fetch
and build plan without network or writes. `--manifest-only` indexes existing
derivatives after validating their output checksums; it is useful when a
deployment hosts only selected quality tiers. When both 2m and 5m are
published, the script rejects matching source checksums across quality tiers
to prevent a mislabeled LOD.

Run `convert-dzb-prm-stl.py` with Blender 5.2 to regenerate one part without
modifying its source STL. For example:

```sh
blender --background --factory-startup \
  --python apps/geoportal/scripts/convert-dzb-prm-stl.py -- \
  --part environment --quality 5m --min-instances 10 \
  --input /path/to/umgebung.stl --output-dir /path/to/derived/5m
```

The other part IDs are `zoo`, `bridge`, `bridge-existing`, and `station`.
The advanced 3D-Entwurf option switches the proposal's caster between the existing
`BRUECKENENTWURF_GLB` catalog GLB and the STL-derived GLB, keeping the printable
BuGa proposal as receiver.
Cache it separately with `--catalog-bridge-only`; the
collection manifest records its Cesium anchor, altitude, heading and SHA-256.
The runtime uses the same transform in the visible MapLibre model and shadow
capture. Its Draco decoder is copied from the installed Three.js package into
`public/assets/draco/` for self-contained deployment.
On `pm-show`, the visible catalog bridge subtracts the collection manifest's
`boardBottomHeightMeters`, matching the visible BuGa collection. Offscreen
capture keeps both bridges in the common unshifted height frame.
The catalog layer is added last and hidden by the
shadow workflows; its eye also controls whether it contributes a shadow.
Pass the matching source file explicitly; `--quality` is a provenance label,
not a source-URL selector. The outputs are Meshopt-compressed glTF 2.0 GLBs
with `EXT_mesh_gpu_instancing`. Their X/Z positions are *projected* metres
around EPSG:3857 `(791706.051, 6664825.628)`; Y is absolute DHHN2016
height. The nadir shadow canvas converts X/Z back to longitude/latitude;
it does not render the GLB material into the map.

The derivative root contains `2m/`, `5m/`, `original/`, the manifest and the layer JSON.
The GLB files are published separately at
`https://wupp-3d-data.cismet.de/dz-b-prm/derived/`, not in Git. The small
`collection.json`, layer JSON, and provenance reports remain in the app. Local
GLBs can stay in the ignored `public/assets/dz-b-prm/` tree for reproduction.
The true 5m environment GLB is 124 MiB and exceeds GitHub's file limit.
The build script packages large GLBs as reproducible `*.glb.gz`
(gzip mtime 0), checks that each decompresses byte-for-byte, and publishes only
the package. Server-hosted originals are not subject to GitHub's file-size limit.
Browser loading accepts both servers that pass the gzip
bytes unchanged and servers that advertise `Content-Encoding: gzip`.
A deployment defaults to the public 3D-data host; set
`VITE_DZ_B_PRM_GLB_BASE_URL` only to override its root with the same quality
subdirectories. Do not use an STL URL in that setting. The receiver remains
the model's own non-flat surface; MapLibre
terrain is not required for this mode.

FFmpeg and video export belong to the localhost-only exploration workflow.
They are not bundled with the Geoportal addon or required by deployed shadow
capture; the deployed addon computes its canvas in the browser.

## Asset packaging decision

- ID / date / status: `dzb-prm-glb-package`, 2026-09-24, adopted for the 5m environment.
- Context and constraints: The verified true 5m environment is 130,467,188 bytes as a Meshopt GLB, above GitHub's 100 MB per-file limit. Geometry, normals, instance transforms, and the original source hash must remain unchanged.
- Decision: Store the exact GLB as deterministic gzip (`mtime=0`) and verify the decompressed SHA-256 against the uncompressed conversion report. The client unpacks before `GLTFLoader.parse`, except when HTTP `Content-Encoding: gzip` has already caused browser decompression. The other GLBs remain ordinary glTF files.
- Alternatives and disposition: Commit raw GLB (incompatible by inspection: over file limit); Git LFS (not used); Draco re-encoding or spatial splits (deferred, would change the verified asset/loader contract). All ten GLBs now use the separate public 3D-data host; a deployment depends on those URLs remaining available.
- Evidence: The true 5m GLB was 130,467,188 bytes; deterministic gzip produced 96,160,001 bytes. The build script verifies byte identity when both are present, and `--manifest-only` verifies the uncompressed SHA even if only the package is present. The local Geoportal served and rendered the packaged asset with a 4096×2288 shadow texture.
- Revisit when: The 3D-data host or its cache policy changes, or measured load/decode cost favors another transport.
- 2026-09-25 extension: Original-detail assets use the same exact-byte packaging,
  but the obsolete 100 MB GitHub rejection is removed because all GLBs are hosted
  on the asset server. The existing manifest-driven Original option is opt-in;
  it does not change the default model detail or the shadow-texture resolution.
  Blender 5.2.2 produced all five originals with normals and Meshopt compression,
  without a decimation step. The original environment is 906,414,764 decoded
  bytes / 735,543,241 gzip bytes; all five transport files total 813,880,809 bytes.
  Server SHA-256 values match the manifest. Public HEAD/range requests returned
  200/206, matching sizes, GLB/gzip magic and the requesting origin's CORS header.
  Conversion and transport verification do not establish interactive frame rate
  for the roughly 31-million-triangle tier.

## Animation clock

- ID / date / status: `dzb-prm-animation-clock`, 2026-09-25, adopted.
- Context: Waiting 250 ms after every capture capped animation below 4 fps and
  tied simulated time to capture cost.
- Decision: Reuse the shared animation hook with an opt-in elapsed-time clock.
  At 1×, one real second advances one simulated hour; 4×/12× multiply that rate.
  Request captures on display-refresh ticks, with one capture in flight and only
  the latest timestamp waiting. Publish React/UI time every 250 ms and at pause.
  Render hard shadows during playback without per-frame WebP cache work; retain
  paused-frame caching and the 1500 ms idle debounce before sun-disc refinement.
- Alternatives: Fixed time steps or waiting after capture (rejected: speed depends
  on GPU cost); parallel captures or mesh simplification (deferred). The normal
  shadow addon retains its existing per-tick timing unless realtime is requested.
- Evidence: Thirteen focused tests cover elapsed-time steps, daylight wrapping,
  available 60 Hz ticks, hard-only playback, cache bypass, and latest-only capture.
  Addons TypeScript passes; localhost shows time and shadow changes. These are
  scheduling checks, not a measured 60 fps GPU benchmark.
- Revisit when: Capture or canvas-upload profiling justifies further optimization.

## Unified shadow controls

- ID / date / status: `dzb-prm-unified-shadow-controls`, 2026-09-25, adopted.
- Context: Separate shadow, landscape and catalog-bridge rows duplicated controls
  and made a single capture depend on independently configured layer visibility.
- Decision: The route configures the shadow-texture addon with the existing
  collection manifest and asset base URL. It owns geometry selection and optional
  visible meshes; workflows create only the shadow row. The shared loader/cache
  and georeference remain unchanged. Standalone ad-hoc model loading still works.
  Bestand selects the existing inset; BuGa-Entwurf selects the printable proposed
  inset. The advanced 3D-Entwurf option replaces the proposed inset with the
  existing STL inset plus the catalog bridge. All STL parts still cast and
  receive shadows; the catalog bridge is an additional caster. Bestand alone
  excludes the catalog bridge while retaining the advanced preference. This replaces the earlier
  three-way first-level selector and catalog-as-receiver behavior. Existing
  `renderShadowReceiverObject` handles the pass separation; no second draw filter.
  The optional 3D display and opacity do not alter shadow inputs. On activation,
  a pre-existing catalog companion row is absorbed into the internal selection.
- UI: Two equal-width sliders have full dates and clock values followed by exclusive
  year/day play buttons on their left. No label column. The compact header keeps
  both play controls, uses content-sized columns and omits year/timezone (kept
  in the expanded pane, with the full date also in a tooltip). The pane's fold
  arrow and visibility button stay at the right edge. Blank header space toggles
  the pane without intercepting its controls; the arrow remains a native button.
  Narrow collapsed panes wrap their time controls below the fixed title row.
  Slider thumbs
  render above ticks and sun markers. Settings start collapsed; status shares the settings
  summary row instead of reserving a footer. Idle is hidden; truncated messages
  retain their full text in a tooltip. Day length in hours/minutes sits below the
  date; the clock shows the selected timezone's DST-aware abbreviation (MEZ/MESZ).
  Realtime year playback loops within the selected year at 60 days per second
  at the default 4× (15 at 1×, 180 at 12×) and holds clock time. Elapsed-time RAF
  steps target one day per frame at 60 Hz without depending on capture throughput.
  Daily playback holds the date and offers a full-day
  or daylight loop. Both use the shared 1×/4×/12× speeds and hard-only interaction.
  The URL stores whole minutes, including midnight; sub-minute rendering remains
  internal. This prevents pausing from serializing an invalid shadow hash.
  The time rail always spans 00–24 with hourly ticks, 6-hour labels and
  sunrise/solar-noon/sunset markers (half-sun arrows for rise/set), with times
  to the right of the icons. In narrow panels both rails span the full width
  below their controls so labels remain separated;
  manual range input is clamped to daylight, independently of the playback loop.
  The year rail keeps all month ticks but labels only Jan/Apr/Jul/Oct. Both rails
  distinguish civil (-6°), nautical (-12°) and astronomical (-18°) twilight from
  full darkness using the existing event search with an optional elevation
  threshold, included in the cache key. Memoized yearly windows include timezone
  and DST; normal daylight limits are unchanged. Date changes and clock input
  remain unrestricted. Event icons are centered over short ticks, with exact
  times in tooltips; both sliders keep the same width.
- Alternatives: Companion geometry rows (replaced at the user's request); new
  loaders, shared global scene contracts or mesh optimization (not introduced).
  Normal shadow-addon timing and daylight defaults are unchanged.
- Evidence: Focused animation, shared-controls, geometry-selection, workflow and
  hash tests pass. Live capture shows equal-width sliders, exclusive playback,
  centered status and persistent midnight/paused shadows. This is not a GPU
  throughput benchmark.
