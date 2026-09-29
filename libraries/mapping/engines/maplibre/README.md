# engines/maplibre

## Consumers must build workers as ES modules

The engine lazy-loads its terrain worker client, so any app or playground that
bundles it gets a code-split worker chunk. Vite refuses to emit that with the
default `iife` worker format. Every Vite config that depends on this package
needs `worker: { format: "es" as const, ... }`; the geoportal, belis desktop,
the Storybook playgrounds, the ng-topicmap and measurements playgrounds all set
it. A new consumer without it fails its production build with
`Invalid value "iife" for option "output.format"`.

## Style contract for `metadata.carmaConf["3d"]`

A tileset is declared by a style's `3d` block. The legacy shape, still served
by `tiles.cismet.de` and still valid, names only `renderMode: "tiles3d"`, the
`tilesetUrl` and `terrainMandatory`. `resolveTiles3dConfig` in the layer
manager completes every block with the same defaults, so a legacy style loads
the way a fully declared one does:

| Field | Absent means | Note |
| --- | --- | --- |
| `providesTerrain` | derived | The host sets it from the `Mesh` tag or a `mesh*.style.json` URL before the block reaches the manager. |
| `errorTarget` | 4 px, 6 px for terrain-providing tilesets | Idle refinement target; the shadow simulation may override it per view (`setErrorTargetOverride`). |
| `qualityProfile` | none; existing 6 px mesh target | Mesh quality defaults: `low` (16 CSS px), `standard` (12 CSS px), `high` (6 CSS px). Explicit quality fields override individual profile fields. |
| `baseErrorTarget` | 12 px with a quality profile, otherwise 16 px, terrain-providing only | First-pass target and the mesh loading strategy; other tilesets refine straight to the error target. |
| `firstImageErrorTarget` | 64 px for terrain providers | Optional initial request threshold, bounded below by base and idle targets. Hard shadows may present complete coarser fallback coverage. Read when the runtime is created. |
| `handoverErrorTarget` | legacy staging | Optional cold observer handover before whole-extent reserve admission. A complete observer cut advances to the idle target independently of caster refinement. Read when the runtime is created. |
| `baseCoverageMemoryShare` | 0.10, terrain-providing only | Fraction of the loader's usable memory grant reserved for a complete resident baseline. Bounded to 0.05–0.15; independent of network and visible quality profiles. |
| `tilesetMinResolutionPx` | 0, terrain-providing only | Zero chooses the baseline by its memory budget and per-level entry sizes. Positive values add an optional geometric-detail limit. |
| `hierarchyCache` | true | Worker-built static hierarchy index instead of native tileset JSON paging. `false` loads pages natively; kept after measurement, see TILES_COVERAGE.md, tileset hierarchy cache kept. |
| `persistBaseTiles` | true for terrain-providing host layers | Optional local render-record cache of the complete resident base. Uses the hierarchy cache's validated source root. Shadows use the same source records. |
| `basemap` | `labels` | Drape the map labels and keep MapLibre terrain; `none` shows the tileset alone. |
| `outline` | on | `CESIUM_primitive_outline` edges. |
| `diagnostics` | off | Never ship it on; the stories switch it on themselves. |
| `shadowBuildingStyle` | off | Let the shadow simulation restyle the tileset as a building layer while shadows are on. Off keeps the declared appearance; outlines always follow `outline`. |
| `entry` | none | Per-level `geometricError` and `bytes` size the resident extent within the memory share; `prefetch` names hierarchy files to warm. |
| `colorCorrection`, cache budgets | none | Colour grading and memory stay as the runtime decides. |

### Mesh quality

Select `qualityProfile` in `metadata.carmaConf["3d"]`. The shared
`TILES_MESH_QUALITY_PROFILES` export defines the settings. Explicit numeric
targets take precedence, so remove an existing `errorTarget` to use the profile
value. For example, this uses the standard profile with a custom 10 CSS-pixel
target and a 10% resident baseline share:

```json
{
  "qualityProfile": "standard",
  "errorTarget": 10,
  "baseCoverageMemoryShare": 0.1
}
```

Quality trades visible detail for download, decode and resident-memory work.
It is selected explicitly, not inferred from a connection speed or screen size.
The values were calibrated in a 1920 x 1080 CSS-pixel shadow view of Mesh 2024;
they are not load-time guarantees. Leaving the setting absent preserves the
existing 6 px refinement and 16 px first-pass defaults. Quality does not set the
memory grant or the whole-extent baseline resolution.

### HD, UHD and memory

Mesh selection uses the CSS viewport; rendering uses the physical canvas.
For the same camera and quality target:

| Display and browser layout | Mesh selection | Render-buffer pixels |
| --- | --- | --- |
| Full HD, 1920 x 1080 CSS px, DPR 1 | Reference | 2.07 million |
| UHD, 1920 x 1080 CSS px, DPR 2 | Same requested mesh detail | 8.29 million |
| UHD, 3840 x 2160 CSS px, DPR 1 | Finer detail needed to meet the same CSS-pixel error | 8.29 million |

Doubling CSS viewport height at the same field of view doubles the projected
error of unchanged geometry. How many additional tiles this requires depends
on the hierarchy and scene; mesh bytes do not have a fixed fourfold multiplier.
Increasing DPR alone does not change the mesh target.

Keep the tile-memory grant device-based for both HD and UHD. The current desktop
seed is 6 GiB before low-memory, explicit or learned caps; healthy occupied
grants can grow within the configured maximum. This is an admission estimate,
not proof that the browser has reserved that much physical or GPU memory.
`cacheBudgetBytes` and `cacheOverflowBytes` can override the layer limits within
device caps. Runtime pressure handling and learned failure limits still apply.

The resident baseline keeps its 5–15% share (default 10%) of that grant regardless
of display size. For example, a 4 GiB grant reserves a 409.6 MiB baseline budget
at 10% on either display. Render targets need separate headroom: a single
RGBA8 + 32-bit depth buffer is approximately 15.8 MiB at Full HD or 63.3 MiB at
UHD, before multisampling, extra passes and shadow targets. These are byte-count
examples, not measured whole-app budgets. UHD does not automatically increase
the loader's memory allowance.

### Persistent resident base

`baseCoverageMemoryShare` defaults to 10% of the loader's usable memory grant,
clamped to 5–15%. Per-level source sizes choose a conservative complete floor;
the coarsest source fallback remains the minimum when no finer floor fits.
This is independent of the visible CSS-pixel target and quality profile.

The optional base cache uses IndexedDB structured-clone records: typed geometry
buffers, original material parameters and decoded texture `ImageBitmap`s. It
does not simplify geometry, create another network format, or cache shadow
maps. Shaded and unshaded views share exactly the same base. Native traversal,
transforms, material application, publication and disposal still own restored
tiles. Unsupported materials, unavailable storage and cache failures keep the
source loading path.

Source URL (including query), validated root-document digest, loader build
identity and render-format version isolate cache entries. Production build
identity is the emitted runtime module URL with its bundle hash. Development
HMR query timestamps are excluded; bump `MESH_BASE_RENDER_FORMAT` when changing
the stored representation. As with the hierarchy cache, changing child data
at the same URL requires a root revision or a source-URL revision as well.

Records are written one at a time after visible convergence. A manifest is
published only when stored content proves complete coverage, allowing a
stored parent to cover unfinished children. Later idle writes improve that
baseline. On restart, a validated complete manifest fitting the current memory
grant arms the resident floor immediately; native first-image traversal can
restore local tiles before remote detail arrives. The source root is still
validated on the network. Missing entries and reads exceeding 200 ms fall back
to source loading; they never become a refinement gate.

The worker shares the existing adaptive origin-quota cache. Confirmation
requests persistent browser storage, but browsers can deny persistence or
evict data; every startup checks the manifest and individual record presence.
`CARMA_MESH_BASE_CACHE.getStats()` reports cache hits, misses, writes, read and
restore duration, pending bytes and confirmed source identity. These durations
exclude GPU upload; use a render benchmark when comparing local formats.

The bundled `mesh2024-cesium-parity.style.json` copies in the geoportal and the
stories are the reference for the 2024 mesh. They declare only what differs
from the defaults or carries data: the tuned base target of 12 px, the
standalone basemap, the colour grading and the entry hint. Both copies use the
primary `WUPP_MESH_2024` endpoint on `wupp-3d-data.cismet.de`, matching
Cesium and its gzip delivery of B3DM responses. The alternate MeshX host
serves the sampled payloads without HTTP compression.

## Shared-canvas camera views
The shared scene layer owns post-MapLibre screen passes. `createSharedThreeSceneCameraPreview` clips embedded CSS regions onto the existing drawing buffer with viewport and scissor, preserving DPR, camera projection, clipping planes and host render state. Embedded camera windows and panorama strips stay inside the map canvas. The shared strip presenter keeps pan, zoom, wrap and keyboard navigation without copying each frame through Canvas2D. Only visible strip segments render; repeated meridian views share tile demand. Optional image-plane textures stay on the GPU, while explicit pixel export remains available.

Detached popup documents use bounded asynchronous image transport because they cannot share the map canvas directly. A popup or export may use readback; opening more embedded views does not create another tileset, scene or WebGL context. Each camera still incurs its own draw work, and optional image planes retain their render targets.

## Consolidated tile manager

`buildThreeTilesRuntime` owns one native `TilesRenderer`, mesh loading, selection and residency. `buildRasterDemTerrainRuntime` processes raster elevation in its own format while using the same shared scene, camera-demand and receiver/caster contracts. `Tiles3dLayerManager` and `SharedThreeTilesLayerManager` are host adapters to the one mesh runtime. Stories use those adapters and do not instantiate a second loader. The layer manager forwards the style's `metadata.carmaConf["3d"]` settings. See [Shared tile coverage policy](./TILES_COVERAGE.md) for the authoritative loading, publication, offscreen caster, reserve, cache and recovery behavior.

The worker-built hierarchy cache is on by default; `hierarchyCache: false` uses native tileset JSON paging. External JSON routing jobs use independent metadata download and parse queues while native tile identity, statistics and cancellation remain authoritative. Static hierarchy pages are source-bound records, not mesh payloads. On startup the full root document is revalidated and hashed; an unchanged URL with silently changed child data cannot be detected without a root or URL revision. Source URL, root digest, build identity and page format isolate stored pages. Optional cache writes are bounded and never gate foreground loading. The separate resident-base render-record cache is described above.

## Geographic bounds and longitude wrapping

Geographic rectangle operations belong to `@carma-geo/helpers`.
`intersectUnwrappedGeographicBounds` returns the positive-area intersection of
two finite, ordered bounds in the same longitude frame, or `null`. It rejects
the wrapped `west > east` representation; it does not normalize longitudes or
align different world copies. Ordered intervals such as 170..190 remain in the
caller's unwrapped frame.

The raster grid enumerator uses this contract and clips to the source extent.
Its XYZ columns remain in 0..2^level-1; it does not split a view or a source at
the antimeridian. The standalone idle-prefetch planner supports wrapping, while
the idle shadow-region planner and local Mercator camera fit reject crossings.
These are partial capabilities, not end-to-end antimeridian support. Global
support requires coordinated splitting and world-frame handling in selection,
camera fitting and presentation; a rectangle helper alone cannot provide it.

## Shared Three.js scene and runtime API

`buildSharedThreeSceneLayer` creates one MapLibre custom layer and renderer for multiple `SharedThreeSceneRuntime` roots. Point clouds, 3D Tiles and simulation geometry can share its scene graph. `buildThreeTilesRuntime` adds a streamed tileset; callers can retain its `root` or use the layer's `getScene()` for custom rendering passes. The existing `carma3d` building and vegetation layers keep their own established selection/overlay scenes and report lifecycle and geometry changes through the generic-layer registry.

The 3D Tiles runtime exposes stable owner groups: `runtime.scene` is the adapter registered with the shared renderer; `runtime.appearance` controls materials, visibility, opacity and projection; `runtime.loading` controls quality, cache and concurrency; `runtime.placement` controls origin and height offset; `runtime.debug` observes tiles. `scene.update` is the frame callback. These imperative groups are created once per runtime. State remains instance-owned; subscriptions begin in `onAdd` and are removed with the runtime.

`three-tiles-runtime.ts` wires the public facade. `three-tiles-runtime-attachment.ts` owns native renderer construction, plugins, request queues and symmetric teardown. `-lifecycle.ts` and `-frame.ts` own event and frame work; loading, quality, spatial, shadow, appearance, projection and surface modules own their respective behavior. Shared types live in `three-tiles-runtime-types.ts`, per-instance state in `-state.ts`, contracts in `-context.ts`, constants in `-config.ts` and vendor compatibility in `-vendor.ts`. Internal consumers import their owner directly rather than the package root. The root entry exposes the intentional consumer API.

The shared scene layer coordinates lifecycle, scene placement and camera/render dispatch. Pure camera and shadow-view contracts live under `core/`; material hooks, accumulation, map-style projection and WebGL render context remain with their runtime owners. MapLibre raster-DEM terrain is not automatically Three.js geometry in this scene. A simulation needing terrain as a shadow receiver supplies an explicit terrain-mesh runtime.

Local-frame fitting and cancellable zoom prefetch have separate runtime owners; the scene layer retains the complete render transaction. Cylinder and spine rigs, footprint fitting and strip layout live in their corresponding `core/` modules. Diagnostic record/projection contracts, resident primitives, camera outlines and text rendering are separate from the worker/GPU host. Raster-DEM selection snapshots, staged loading and optional seam coordination feed the terrain runtime's atomic publication step. Their existing tests are colocated by concern; shared test fixtures are excluded from production declarations.

## Linked receiver/caster detail

Visible mesh receivers own their colour and depth geometry. The observer publishes complete REPLACE families independently of offscreen caster readiness. The current displayed receiver cut seeds sunward offscreen corridors; pure offscreen casters use the same native Tile pool but do not become receivers or increase observer detail. Offscreen caster REPLACE families form their own exclusive cut without coarse/fine depth overlap. A visible tile casts directly, so it is not downloaded again as an extra caster. The sun camera supplies direction and capture projection, not an independent mesh LOD target. Changed committed caster geometry invalidates the affected shadow proofs and captures; unchanged geometry can reuse them. Soft-shadow visibility captures use a scalar texture and compose RGB lighting afterward, keeping the accumulation working set bounded. The exact current contract is [Exclusive shadow caster handover](./TILES_COVERAGE.md#exclusive-shadow-caster-handover).

<a id="mesh-memory-and-shadow-casting"></a>
Mesh payloads that provide terrain retain native observer/light frustum culling. A second shadow-demand query selects only additional offscreen casters intersecting receiver corridors. Diagnostic corridors and finite-sun rendering do not authorize unrelated mesh downloads. Photogrammetric materials cast with `DoubleSide`, so back-facing surface triangles may occlude sunlight; visible material sidedness is unchanged. The independent raster heightfield remains `FrontSide`.

## Shared caster volumes

Raster and mesh receivers use the common `createShadowReceiverMask` light-space sweep while keeping source-specific loading and publication. Raster receiver demand may include the finite-sun margin; terrain-providing mesh retrieval uses parallel sunward corridors from displayed mesh receivers. Raster observations retain source-scoped min/max height for each exact z/x/y tile address, independent of whether its geometry remains resident. Horizontal bounds come from the address and are transformed into the current local frame for selection. Unknown child heights keep a conservative envelope; a coarse raster extremum is not certified to bound all resampled descendants. Final selected payloads are filtered against receiver prisms before download.

The terrain worker pool stores bounded `terrain-height-metadata` rows through the derived-buffer cache. A row contains `[z,x,y,min,max]` Float64 values, 40 bytes per tile, capped at 16,384 observations per source before storage overhead. Source/configuration/revision and NoData identity, immutable producer hashes and schema version isolate records. Source-scoped Web Locks serialize read/merge/write across workers and tabs. Initial lookup waits at most 50 ms; a late restore invalidates selection and requests repaint. Missing, malformed, denied, evicted or slow storage falls back to normal terrain loading. Services that change bytes at a stable URL must update their resource revision or use immutable URLs.

### LOD2 terrain corridor reuse

Building-only tilesets may cast into visible raster terrain even where no building intersects the observer. Their visible tiles and the independently supplied terrain Box3 receivers share the existing sunward corridor query. Ground bounds are transformed from scene space to tile space for loading and clipped to the requested region for proof. Terrain outside the observer frustum does not recursively seed caster demand. A missing mesh receiver frontier does not disable building shadows over terrain.

### Local frame for ECEF tilesets, sun and sky

The MapLibre wrapper owns one east/up/south local frame at the map centre on the ellipsoid and publishes it with every `SharedThreeSceneFrame`. The current view's error budget (`localFrameErrorPixels`, default 0.5 CSS px) determines when the frame is refitted, accounting for Mercator scale drift, surface sag and up-vector tilt. Frame-mounted runtimes mount once at their reference fit. The shared local-frame group carries tiles, shadow light and solar direction together; a refit changes that group's matrix without changing their relative geometry or forcing another tile-demand sweep.

Shadow-facing boxes are exchanged in the reference frame. Page fits and keys use host space, so a pure frame refit does not change shadow page identity. Caster selection keys on the ECEF sun direction, and the receiver signature excludes the mount matrix. A real receiver or solar change still invalidates the relevant page and depth. The sampled atmosphere is re-expressed in the current scene frame without re-evaluating its ECEF solar state. The refit happens inside map rendering; it does not publish a content change to React or the registry. Raster terrain under a building-only layer remains an independent receiver with its own frame conversion.

## Appearance, basemap and terrain ownership

Layer opacity multiplies authored material opacity after any full-opacity shadow styling. Below full opacity, materials enable transparency and disable depth writing; restoring full opacity restores the appropriate source render flags. Updating opacity or colour-correction uniforms does not replace the loaded tile pool.

The Mesh 2024 resource may supply gamma, black/white point and saturation through `colorCorrection`; catalog-authored settings override that fallback. The correction adjusts texture or vertex RGB before physical lighting. It is a display correction, not recovered physical albedo. `shadowBuildingStyle` gates shadow UI colour, saturation and opacity overrides, but every activated textured mesh still receives the lit material adapter and can receive simulated shadows. Opted-out styles keep their declared appearance; outlines follow their own `outline` setting. Source materials are restored when shadows stop.

Textured-mesh map paint and label behavior live in `core/mesh-map-style.ts`; terrain and LoD2 drape behavior lives in `core/terrain-map-style.ts`. The shared scene registry applies reversible MapLibre changes and restores authored style on release. Elevation lines and labels have independent visibility gates; textured mesh mode also hides house numbers, while terrain/LoD2 keeps their authored house-number visibility.

Adding or removing a terrain-providing mesh synchronously reconciles raster terrain ownership, the MapLibre ground pass and the mesh-label drape override. Removing the last provider restores raster ground and its base-map projection while retaining DEM elevation for labels. Ordinary tile arrivals use the bounded content-refresh cadence. Mesh removal detaches and disposes the runtime before the next frame so raster terrain can start; [coverage policy](./TILES_COVERAGE.md#mesh-removal-and-raster-handover) defines the native cleanup boundary.

## Multi-camera demand and shared presentation

`SharedThreeSceneLayer.setTileCameraView(view)` upserts a camera by ID; `removeTileCameraView(id)` removes that source. The host snapshots live matrices once per frame for every runtime. `core/tile-camera-demand.ts` supports perspective, orthographic, off-axis and parented Three cameras in the shared world frame. Mesh and raster demand union before one loading generation, reusing the same tile identity and payload. Overlap uses each camera's requested error and role; a geometry-only view does not automatically promote colour materials. Disjoint raster views enumerate separate regions rather than filling the rectangle between them. Camera priority changes scheduling order without creating another cache. See [Camera-normalized mesh refinement](./TILES_COVERAGE.md#camera-normalized-mesh-refinement).

`createSharedThreeSceneCameraPreview` draws an embedded view through the shared renderer. The strip presenter transforms a shared image source for drag, wheel/trackpad, keyboard and closed-loop wrap. Vertical navigation translates the whole camera rig and its clipping/image planes together; it does not move the main MapLibre camera. Detached readbacks remain asynchronous and sequential. Camera count changes rebuild views, not loaders. A geometry-only point light supplies six frusta for shadow-map demand; an optional preview promotes its selected faces to colour receivers. These views are rendered observations, not certified viewsheds.

## Camera and lighting stories

The Tile Loading Manager stories exercise one runtime with Coverage, Camera Views and Lights demos. Panorama, closed facade, Wupper north-bank spine, HKW lights and Barmen streetlights share scene and loader resources. Camera strips preserve source proportions within the 16,384-pixel backing-width ceiling. Panorama cameras share one optical centre and matching side rays; they remain faceted perspective images, not an equirectangular reprojection. Orthographic walls use the same matrices for image and tile demand.

### Joined orthographic reference walls

`createSpineCameraRig.referenceSurfaceOffset` offsets supporting lines and intersects adjacent lines into shared mitre joints. It updates camera centres, widths, image-plane depth, strip layout and navigation together. Zero uses the source spine; positive offsets move into the scene. Per-segment configuration is applied before subdivision. All wall panels use one `baselineElevation` (the first spine vertex by default) or one explicit `verticalRange`. Open caps and closed seams use the same path. An inward cylindrical reference surface uses an inner tangent polygon; its depth and width remain configurable. These reference surfaces align at their chosen depth; independent orthographic rays cannot make every scene depth seam-free.

The north-bank route follows the Barmen Wupper water boundary recorded with its derivation and source attribution in the story's `data/` directory. Its 2D source does not provide surveyed facade heights. The Rathaus closed footprint uses an adjustable convex offset and bounded far planes; it does not isolate neighbouring geometry or certify a measured facade. Virtual camera heights and clipping envelopes are explicitly reviewable story inputs. Missing geometry remains unknown rather than a clear ray.

### Point lights and night demonstrator

The HKW and BELIS demos use the shared renderer. The default shadowed-light subset is four and remains limited by fragment sampler headroom; other requested lights can still illuminate. Each shadowed point light has six geometry-only camera faces. Static poses keep their maps until content revisions require a refresh. BELIS lamp locations from the public `leuchten` source are leased while source tiles unload, and unknown DGM heights withhold placement instead of inventing zero elevation. Lamp mast height and photometry remain assumptions.

The Barmen night story limits loaded lamp positions and uses a worker-built RGBA8 ground irradiance atlas, not a mesh-occlusion or shadow bake. Atlas RGB represents additive illumination and alpha carries weighted ground height for attenuation. The previous complete atlas remains visible until a replacement DataTexture swaps in. A small bounded set of car and rail lights uses OSM route fragments and assumed heights; it is a visual demonstrator, not a traffic or timetable simulation. The Whole Town story stays disabled until complete source coverage and a measured budget are available. Source and derivation notes live beside the story data.

## Build, test and lint

```sh
nx build engines/maplibre
nx test engines/maplibre
nx lint engines/maplibre
```
