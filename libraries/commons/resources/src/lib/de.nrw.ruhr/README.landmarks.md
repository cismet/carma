# Langenberg transmitter landmarks

Two masts at the same WDR transmitter site in Velbert-Langenberg. They reuse the
`GeoreferencedLandmark` / `LandmarkSilhouettePart` schema in `../base/landmarks.ts`;
runtime geometry and datum transformations are intentionally outside resources.

| Mast | Position source | Above-ground height | Sampled DGM1 H |
| --- | --- | ---: | ---: |
| Hordt | OSM way 158358772, version 6 | 301 m | 239.25 m |
| Rommel | OSM way 158358778, version 9 | 170 m | 246.23 m |

## Sources and coverage

The primary [OpenStreetMap API][osm-query] was read on **2026-09-14 at 13:20:46
UTC**, after Overpass services timed out. Coordinates are the bounds centers of
the constituent way nodes, not measured foundation coordinates. Both objects
describe red/white, guyed-lattice communications masts. Their identifiers,
versions, timestamps and direct links are retained per descriptor.

The [City of Velbert][velbert] independently publishes **301 m** for the Hordtmast;
OSM agrees. The Rommel mast's **170 m** is a mapped value, not an independently
verified operator survey. The source does not establish surveyed dimensional
accuracy for either mast. Both OSM `ele` tags say 242, but were **not** used for
the ground anchors because their datum and accuracy are unspecified.

Both centers were tested **inside the actual published CARMA [terrain coverage
polygon][coverage]**, including its holes, at the same retrieval timestamp. This
is a source-coverage check, not evidence that runtime tile admission, camera
frustum selection, GPU resources or a particular camera ray are complete. The
mast centers also lie more than 3.5 km beyond the north side of the published
Mesh2024 root oriented box under its existing WGS84/ECEF interpretation (the
`WUPP_MESH_2024_ROOT_REFERENCE` snapshot); this coarse exclusion is not datum
certification. The resource does not add a mesh tile or alter a terrain source.

Ground values were sampled at **2026-09-14 13:21:23 UTC** from two independent
native 10 × 10 pixel NRW DGM1 WCS windows. Exact URLs, EPSG:25832 bounds and the
containing 1 m pixel centers are in `landmarks.ts`. The decoded float32 values
were **239.25** and **246.22999572753906**; the latter is stored as 246.23 m.
The provider [documents][dgm] EPSG:25832, **DHHN2016 normal height (EPSG:7837)**
and 1 m grid spacing. Response GeoTIFF keys confirmed the horizontal CRS; the
vertical datum is established by that product documentation. Source acquisition
dates were not returned. The decimal precision does not imply centimetre
accuracy or a surveyed foundation elevation.

Apply GCG2016 at each mast before ECEF mounting: **h = H + ζ**. Use the same
declared height convention as the accompanying terrain. Never replace these
individual samples with a mountain summit elevation or treat them as geodetic
validation controls. The [Nordhelle source notes][nordhelle] explain this shared
sampling and datum policy in more detail.

## Approximation and licences

All widths, intermediate section heights, red/white band placements, mast-head
shapes and square-shell orientations are **authored approximations**. The opaque
axial shells intentionally do not reproduce the lattice transparency, antenna
fixtures or guy wires. No surveyed anchor points were available for the latter,
so inventing exact cable geometry would be misleading. These silhouettes suit
long-range recognition, not detailed engineering or exact shadow/visibility
validation. No photographs, meshes or other third-party media are copied.

Mapped source fields: **© OpenStreetMap contributors**, [ODbL 1.0][odbl]. Ground
samples: **Geobasis NRW**, [Datenlizenz Deutschland – Zero 2.0][zero]. Preserve
the respective data notices on redistribution. Authored primitive descriptions
and code follow the repository licence.

[osm-query]: https://api.openstreetmap.org/api/0.6/map.json?bbox=7.130,51.349,7.140,51.358
[velbert]: https://stadtmarketing.velbert.de/tourismus/geschichte-erleben
[coverage]: https://terrain.cismet.de/nrw/coverage.geojson
[dgm]: https://www.bezreg-koeln.nrw.de/geobasis-nrw/produkte-und-dienste/hoehenmodelle/digitale-gelaendemodelle/digitales-gelaendemodell
[nordhelle]: ../de.nrw.sauerland/README.md
[odbl]: https://www.openstreetmap.org/copyright
[zero]: https://www.govdata.de/dl-de/zero-2-0
