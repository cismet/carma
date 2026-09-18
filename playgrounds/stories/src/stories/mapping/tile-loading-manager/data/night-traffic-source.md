# Barmen night-traffic fixture

Snapshot: 2026-09-13. Source: OpenStreetMap contributors, ODbL 1.0.

- Retrieved from the public Overpass API as `out tags geom` within
  `[51.265, 7.185, 51.276, 7.215]`.
- Road paths preserve every returned vertex of OSM ways `24404476`
  (Berliner Straße, B 7), `35067224` (Friedrich-Engels-Allee, B 7), and
  `543132399` (Höhne, B 7). They are individual directed way fragments, not
  inferred complete routes.
- The Schwebebahn path is an ordered vertex subsample of OSM way `37195413`
  (`railway=monorail`, `monorail=hanging`) across the Barmen excerpt.
- The national-rail path is an ordered vertex subsample of OSM way `6052315`
  (`railway=rail`, route reference `2525`, operator DB InfraGO AG). It is one
  physical track, not a claim about a specific passenger service.
- Signal positions are OSM `highway=traffic_signals` nodes `2497096960`,
  `7247902052`, and `451712501`; each coordinate is also a vertex of its named
  road path.
- Coordinates are GeoJSON-order longitude/latitude in OSM's WGS84 coordinate
  system. No elevation is asserted. The transit vertex subsampling is for a
  compact visual fixture and must not be used for measurement or routing.
- Vehicle speeds, headways, direction, occupancy, and every signal phase in the
  story are synthetic. This fixture contains no observed traffic or timing.

Retrieval query:

```overpass
[out:json][timeout:25];(
  way["highway"~"^(primary|secondary|tertiary)$"](51.265,7.185,51.276,7.215);
  way["railway"~"^(rail|monorail|light_rail)$"](51.265,7.185,51.276,7.215);
  node["highway"="traffic_signals"](51.265,7.185,51.276,7.215);
);out tags geom;
```
