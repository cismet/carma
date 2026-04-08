# Cesium Scene Picking Notes

Role: implementation notes for low-latency cursor picking, reprojection, and shape updates in Cesium scene helpers.
Load when: changing cursor-follow visuals, point-query picking, scene reprojection, or lag diagnostics.
Tags: cesium, picking, cursor, lag, reprojection

## Goal

For cursor-follow previews in Cesium, the lowest perceived lag does not come from
doing a full scene or tileset pick for every pointer event.

The practical low-lag path is:

1. track pointer input at the highest browser rate available
2. update the visible shape from local math only
3. refresh the true scene sample on a slower cadence
4. compare displayed vs. true positions explicitly

## Recommended Input Path

- Prefer `pointerrawupdate` when available.
- If the browser exposes `getCoalescedEvents()`, read the latest coalesced
  sample instead of only the outer event.
- Keep `pointermove` as the fallback path and as the compatibility path for
  code that does not opt into raw updates.
- Treat input capture and scene picking as separate concerns.

Reason:

- Cesium's default `ScreenSpaceEventHandler` listens to `pointermove`, not
  `pointerrawupdate`.
- High-rate cursor overlays should not rely on Cesium input abstraction when the
  goal is lowest visible lag.

## Recommended Update Path For Cursor-Follow Shapes

When a visible shape should follow the cursor with minimum lag:

1. keep the last true sampled world position
2. keep the last stable surface normal
3. build a pick ray from the current screen point
4. intersect that ray with the last sampled plane
5. move the visible primitive to that intersection immediately
6. let the next true sample correct drift in the background

Important guard:

- if no last true tangent plane exists yet, do not run the fast reprojection
  path
- fall back to the regular true sample path until both values exist:
  - last true sampled mesh point
  - last smoothed disc normal

This path is usually cheaper than:

- scene pick per pointer event
- tileset pick per pointer event
- per-event depth roundtrips for surface normals

## Plane Choice

For shape-follow previews, prefer the last sampled surface plane over a
camera-parallel image plane.

Use:

- plane point: last true sampled world position
- plane normal: last stable sampled or smoothed surface normal

In other words:

- the offline approximation should use the last local tangent plane of the mesh
- not the last visible disc position if that disc was already reprojected
- not a camera-parallel image plane

Reason:

- it better preserves local surface behavior
- it avoids the visual "sticker on screen" feel of a camera-plane offset

## True Sample Refresh Strategy

Do not pay for full picking on every input event.

Recommended split:

- fast path:
  - pointer raw input
  - ray/plane reprojection only
  - no scene roundtrip beyond `camera.getPickRay(...)`
  - update visible position immediately
  - keep using the last smoothed normal
- slow path:
  - true tileset or scene pick at a capped cadence
  - target at least 60 Hz when the cost allows it
  - update true depth
  - update the smoothed normal from the real mesh sample
- slower still:
  - surface-normal refresh on a lower cadence than point refresh

Reason:

- a point pick can already be moderately expensive
- a surface-normal estimate often needs multiple nearby picks and is usually the
  more expensive part

## Tangent-Disc-Visualizer Smoothing

For the tangent-disc-visualizer trail:

- keep a longer recent normal history, e.g. around `90` samples
- weight newer samples more strongly than older ones
- prefer a configurable falloff curve over a flat average

In this repo the current direction is:

- trail sample count default: `90`
- recency weighting via a gamma-style falloff
- `gamma = 1` means linear decay
- `gamma > 1` biases more strongly toward the newest samples

Use this only for normal smoothing and visual settling.
Do not average pointer positions for the visible disc anchor.

## Lag Metrics To Keep Separate

Never compress all cursor lag into a single number during development.

Track at least:

- `live lag`:
  latest observed pointer vs. latest rendered visible shape
- `sample offset`:
  latest visible reprojected shape vs. latest true sampled world point
- `sync latency`:
  request timestamp vs. rendered true sample timestamp

Interpretation:

- high `live lag`, low `sample offset`: input/render pipeline is trailing
- low `live lag`, high `sample offset`: reprojection is responsive but drifting

## Benchmark Guidance

For A/B tests, prefer:

- same synthetic pointer path
- same camera pose
- same geometry
- two placement modes
- per-render telemetry, not only coarse report buckets

That lets the comparison answer:

- how quickly the shape follows the pointer
- how much geometric error the fast reprojection introduces

## Current Repo Direction

The current preferred trial direction in this repository is:

- raw or coalesced pointer input for the fast path
- last-sample-plane reprojection for immediate updates
- true sample refresh in the background
- explicit storybook telemetry for comparison until the approach stabilizes
