# Wuppertal camera corridors

Source: © OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright).
Public Overpass snapshot, 2026-09-16. Queries and endpoint are embedded in the
raw `wuppertal-corridors-osm.geojson` and `wuppertal-water-osm.json` snapshots.

Reproduce from this directory:

```sh
node capture-wuppertal-corridors.mjs
node derive-wuppertal-camera-corridors.mjs
```

Derivation uses original coordinate nodes, bidirectional source edges and a
shortest path between the western and eastern extremes. No gap snapping.
Way IDs, approximate lengths and maximum edge lengths are in the derived JSON.
Rail: 17 ways, 568 vertices, about 13.37 km, Vohwinkel–Oberbarmen. This is a
visual corridor, not a directed rail routing graph or certified track survey.
Street: 49 connected B7 ways, 119 vertices, about 3.05 km through the
Friedrich-Engels-Allee corridor. It is one connected carriageway path, not a
surveyed road centreline. No claim to the highest measured traffic volume.

Rail cross-sections intersect a transverse ray with the containing OSM water
polygon. The local 70,000/111,000 metres-per-degree approximation only selects
the ray; resulting bank points interpolate the actual source boundary.
438 sections use water boundaries. 130 use an explicitly marked assumed
±12 m street corridor where no valid containing water polygon was available
(including the western land section). This fallback is not a surveyed bank.
Only closed way polygons are currently interpreted; future relation-only
water coverage needs ring assembly before use. The source is 2D; story heights
use one shared preset baseline/window, not per-vertex terrain or rail elevations.

## Sliding array decision

**ID:** CORRIDOR-WINDOW-20260916 · implemented, visual acceptance pending.

The complete rig is inexpensive camera metadata. Only cameras intersecting the
displayed strip publish tile demand, render, or retain diagnostic capture
targets. Panning replaces that active subset; it does not create another tile
pool. Initial range is about ten segments, adjustable in Controls. Paired street
views rotate the lower camera planes by 180 degrees, unfolding the opposite
facade downward. Both rows share horizontal station/order and zoom; vertical
navigation is mirrored. Camera rotation preserves handedness and needs no pixel
copy. Controls select left, right, or both sides and which side is above. A
single-side view removes the unused rig and its demands rather than hiding it.
The long-corridor stories use a 1.5 GiB resident budget, independent of the main
coverage story's 6 GiB stress-test configuration. Main-view coverage remains
primary. Corridor framing no longer downloads or waits for a terrain height
profile: all panels share one horizontal baseline and move vertically together.
The observer follows strip navigation one-way: its centre is the reference-wall
point at the strip midpoint, and its bearing is the visible-width-weighted mean
camera direction (vector average, including bearing wrap). Only a change of
horizontal strip position or zoom starts a short map transition; map interaction
never changes strip station and remains free between transitions. In-story
up/down buttons and Alt-drag move the complete wall, including paired street
rows. Buttons step 1 m, or 10 m with Shift. This reuses shared strip pose queries
and elevation translation; no additional scene or tile pool is created.

Rejected by inspection: rendering every segment or giving each array a loader.
Not measured: whole-route interaction FPS, strict end-to-end gapless coverage.
Evidence: focused rig tests (including full source geometry), demand retirement
tests and bidirectional navigation synchronization tests. Revisit if independent
popout arrays or surveyed bank/bridge envelopes become required.
