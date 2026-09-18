# Wupper north-bank preset

Snapshot: 2026-09-13. Source: basemap.de / BKG, data © GeoBasis-DE,
licensed under Datenlizenz Deutschland – Namensnennung 2.0 (dl-de/by-2-0).

- Style: https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_top.json
- TileJSON: https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/tiles/v2/bm_web_de_3857/bm_web_de_3857.json
- Source-layer: `Gewaesserflaeche`, filter `name=Wupper`, water identifier
  `2736000000000000000`. The capture includes water beneath bridges/culverts.
- Captured through MapLibre `querySourceFeatures` at `[7.1978, 51.2696]`, zoom 15.
  Seven returned tile fragments were unioned with the repository's Turf `union`
  and clipped with `bboxClip` to `[7.1938, 51.2680, 7.202, 51.2715]`.
- `wupper-barmen-water-surface.geojson` is that connected source polygon.
  `extract-wupper-bank.mjs` takes its northern west-to-east boundary arc, keeping
  all original vertices. No centreline, constant-distance rail offset, snapping,
  convex hull or smoothing is involved in the bank fixture.

Reproduce the derived GeoJSON (printed to stdout):

```sh
node playgrounds/stories/src/stories/mapping/tile-loading-manager/data/extract-wupper-bank.mjs
node --test playgrounds/stories/src/stories/mapping/tile-loading-manager/data/extract-wupper-bank.spec.mjs
```

The shared camera builder groups nearly straight edges within a 3-degree total
heading range. Larger bends split even when that exceeds the requested camera
count. This approximation is for image planes only; the source fixture remains
unchanged. Cameras stand landward of the north bank and look across the river.
Each strip fits its far plane to the source water polygon in camera space, with
an 8 m margin beyond the opposite bank; foreground clipping keeps an 8 m margin
on the camera bank too. These margins include bridge abutments provisionally,
not a surveyed bridge outline. Wider river sections expand the individual
frustum without including distant riverbank blocks in every camera.

The source is two-dimensional and cartographically generalized. The story's
145–185 m vertical window is a visual framing choice for rail and supports, not a surveyed
facade or shoreline elevation model. Geometry holes, unavailable source tiles,
camera far clipping and analytical viewshed certification remain separate issues.
