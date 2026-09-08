# Shadow diagnostics: control audit

Reviewed 2026-09-07. Scope: Geoportal's movable display settings and projection
debug panels, their state callbacks, runtime consumers and rendering paths.
This is a wiring/compatibility audit, not a production-fidelity certification.

## UI and runtime changes

- Both panels reuse `CarmaResponsiveInfoBox` dragging and AntD theme tokens,
  typography, icons and form controls. Popup controls stay inside their panel's
  stacking context. Panel bodies may scroll; the main time ribbon never wraps.
- The overview fits active loaded tile bounds around the map-center terrain
  anchor, independently of the artificial sun-camera distance. A centered corner
  radius and shorter-axis orthographic fit retain the full extent during orbit
  and panel resizing. Before tiles arrive it falls back to camera bounds.
- Tiled rendering is the default; explicit mono selection remains supported.
- Debug publishes actual layout, configured solar-disc sample target and tiled
  page/cache/allocation statistics. Before initialization these statistics are
  unavailable, not zero. Publication is coalesced to at most 10 Hz, with a final
  trailing update and cleanup on disposal; it does not add an animation loop.
- Tile bounds apply to newly registered supporting 3D runtimes as well as those
  present when the switch was enabled. Repeated content events do not reapply it.

## Loading and diagnostic work

- Display settings and projection debug use separate lazy imports and local
  Suspense boundaries. Neither blocks the map/runtime while its module loads;
  opening display settings does not preload the projection debug module.
- The debug model and visualizer load with the debug panel. Snapshot capture
  follows actual subscribers, including a repaint when a lazy subscriber arrives
  after the scene has settled. Closing or collapsing the panel cancels pending
  publication and releases retained snapshots and UI capability subscriptions.
  Runtime tile-bound subscriptions exist only while that overlay is enabled in
  an open debug panel, not when the debug panel is closed.
- The main-scene sun-vector gizmo has its own dynamic import. No arrow, arc or
  marker geometry is allocated until enabled. Closing debug removes/disposes it;
  an import finishing after hiding/disposal cannot recreate it. An explicitly
  enabled main-scene overlay stays visible while only the panel is collapsed.
- Validation: 31 focused lifecycle/runtime tests passed. A clean dev-browser
  resource observer recorded zero panel/model/gizmo requests at startup, only
  display settings on its first opening, debug/model on Debug, and the gizmo on
  its checkbox. Collapsing removes the visualizer canvas; expanding restores it
  and its statistics without camera movement. Closing removes the debug portal
  without removing the map canvas. This verifies demand
  loading and cleanup, not a quantified FPS gain. Module code remains cached for
  reopening; it is not downloaded again.

## Functional scope and remaining adaptations

### Native map pixels and adaptive shadow quality

- Geoportal uses device pixels for its MapLibre canvas, captured map color and
  scene-color integration. It opts out of MapLibre's arbitrary 4096px canvas
  ceiling via the public `maxCanvasSize` option; actual drawing-buffer/hardware
  limits still apply. Other apps keep MapLibre's default unless they opt in.
- Three shares MapLibre's canvas without owning its size. Accumulation uses the
  synchronized physical viewport, not Three's construction-time cached size.
  Viewport dimensions also invalidate settled color frames on DPR-only changes.
- Do not independently downscale Three RGB in this pipeline: captured road text
  is already mixed into terrain materials before lighting. A separate low-res
  color pass would therefore blur map content even with a native main canvas.
- Display settings expose **Adaptive Schattenqualität** (default on, bypassed
  in Ultra). Mono trials reduce update cadence first, then shadow depth density;
  tiled trials change per-page ground texel demand directly because coverage
  must follow every frame. The controller retains reductions only when the next
  measurement improves throughput; ineffective trials revert. Ending motion or
  disabling adaptation restores the configured density. Neither path changes
  canvas, map capture, scene-color size or the terrain model during motion.
- Validation: 76 focused shadow/state/UI tests and 9 shared-layer tests passed.
  Browser resize from 2200 to 2300 CSS pixels at DPR 2 produced a 4600x1800
  canvas and map-capture texture, while Three's cached width remained 4400.
  Controlled frame-time tests cover tiled adaptation, toggle-off and recovery
  with an unchanged 2560x1440 frame. This establishes resolution and wiring,
  not a measured GPU speedup or a guarantee of the selected FPS on every device.

| Control / output | Current behavior | Recommendation |
| --- | --- | --- |
| Sun view | Uses the mono light camera and scene path. Disabled in tiled mode; switching from mono sun view to tiled displays the overview. | Adapt to a selectable tiled page/light camera before enabling for tiled rendering. Do not show the mono image as a tiled diagnostic. |
| Overview, frusta, camera/ground cues | Work as viewport and conservative caster-envelope diagnostics. They do not visualize actual tiled page projections. The UI states this distinction. | Keep; add a separate page/corridor overlay if page-level inspection is needed. |
| Buffer/texel statistics | Mono reports its fitted buffer. Tiled reports real page/cache statistics, not the old mono buffer size. “Samples (Ziel)” is the configured integration target, not completed samples. | Keep the distinct mode-specific meanings. Add completed integration progress separately if needed. |
| Tile edges + IDs | Only offered when an external 3D runtime implements `setTileBoundsVisible`. Does not expose raster-simulation tile edges. | Keep for supported layers; a raster-edge diagnostic requires its own runtime capability. |
| Mesh LOD | Only offered for a terrain-providing external runtime with `setErrorTarget`. It does not change the raster generator's error target. | Keep capability gating. |
| Mesh texture/color mix and saturation | Textured terrain/3D mesh controls. Generic untextured ALKIS building copies do not implement equivalent texture blending/saturation. These controls are grouped with the external terrain mesh. | Do not expose them as universal building controls. Only add a separate ALKIS material implementation if that use case is requested. |
| Terrain color | Changes terrain material/albedo; a draped basemap can dominate the visible color. | Keep with the explanatory tooltip; inspect with basemap disabled when testing plain material color. |
| DGM / DOM | Chooses the simulation's raster source, not the pinned MapLibre DGM. An external terrain mesh can own the visible receiver surface. | Keep this source/receiver distinction explicit; source selection does not guarantee a visible mesh replacement. |
| Ground texel fitting | User-selectable for mono. Tiled chooses ground resolution per page automatically; its checkbox is disabled. | Keep, do not wire it to an unrelated tiled quality parameter. |
| HDR format, MSAA, disc samples | Apply to stationary soft-disc integration; point-light mode disables them. Hardware/format limits may reduce effective MSAA. | Keep device constraints visible; these are targets rather than unconditional allocations. |
| Sun vector, LUTs, map content and labels | Have state-to-runtime consumers; no orphaned switch found. Image/axis overlays have their documented view dependencies. | Keep. |

No globally unconsumed debug state field was found. Disabled or hidden unsupported
controls are intentional compatibility gates, not claims that their missing
rendering implementation has been completed. Fine low-sun tiled self-shadow
artifacts and page-pass scheduling remain separate renderer work.
