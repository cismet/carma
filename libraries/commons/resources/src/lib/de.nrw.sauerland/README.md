# Nordhelle landmark silhouettes

Immutable reference data for long-range demonstrations, not a surveyed building
dataset. Rendering and datum conversion belong in the mapping/projection
libraries. `landmarks.ts` exports four independently georeferenced descriptors.

## Which towers?

The three tall transmitters are the **WDR Sender Nordhelle**, the smaller
**NATO-Fernmeldeturm Nordhelle**, and the **Fernmeldeturm Ebbegebirge**, also mapped
as **Waldbergsender**, on the adjacent Waldberg. The **Robert-Kolb-Turm** is an
additional, much shorter lookout near the WDR tower, not one of those three.
The photographer's [three-tower caption][three-tower-photo] independently
identifies the radio towers; its historical military label should not be read
as a claim about their current operators.

| Descriptor | Nominal structure height | Source | Ground anchor H |
| --- | ---: | --- | ---: |
| WDR Sender Nordhelle | 150 m, disputed | OSM way 462542377 | 662.09 m |
| NATO-Fernmeldeturm | 56 m | OSM node 2812442525 | 656.77 m |
| Ebbegebirge / Waldbergsender | 150 m | OSM node 297576774 | 638.40 m |
| Robert-Kolb-Turm | 18 m | Municipality of Herscheid | 663.50 m |

OSM was queried on 2026-09-14; database timestamp 12:43:25 UTC. Individual object
URLs, versions and edit timestamps are recorded beside the fields. Node positions
are copied directly; way positions are Overpass bounding-box centers, not polygon
centroids or surveyed foundation coordinates. No positional accuracy is asserted.
The duplicate Waldberg building way/relation is deliberately not another model.
The [municipality confirms Robert-Kolb's 18 m height][herscheid].

**WDR discrepancy:** the [municipality-hosted MVG 2017 brochure][mvg], printed
pages 10–11, describes a 130 m transmitter, whereas the current OSM object says
150 m. The descriptor retains 150 m as a mapped, uncertain total and records
130 m as conflicting evidence. No operator survey resolved this; do not infer
whether dates, antenna tips or a mistake explain the discrepancy.

## Ground anchors and datum

The four ground values were actually read from the official **full-NRW DGM1
WCS** on 2026-09-14 at 12:51:14 UTC. These are not samples from the clipped
CARMA Terrarium service and not borrowed summit elevations.

The [Geobasis NRW product description][dgm] specifies a 1 m grid, ETRS89/UTM32
(EPSG:25832), and DHHN2016 normal heights (EPSG:7837). Each descriptor includes the
complete WCS URL, native 10 × 10 m request bounds and selected pixel center. The
request used WCS 2.0.1, coverage `nw_dgm`, `image/tiff`, and native x/y subsets.

Longitude/latitude was projected into UTM32; the containing 1 m raster cell was
selected without resampling. Its pixel-center value was retained to two decimals.
Decoded float32 values before rounding were 662.0900268554688,
656.77001953125, 638.4000244140625 and 663.5 m in table order. The response GeoTIFF
confirmed EPSG:25832 and 10 × 10 pixels; vertical datum comes from the provider's
product documentation, not an absent vertical GeoTIFF key. The source publication
or acquisition year for each sampled cell was not returned by this request.

`approximate-terrain` means a sourced ground-grid approximation at a mapped
location, **not a measured tower foundation**. Centimetre storage is not centimetre
accuracy. The stated DGM height accuracy is terrain-dependent, and mapping error
adds uncertainty. Do not use these anchors as geodetic validation control points.

For ECEF mounting, convert normal height **H** to ellipsoidal height **h = H + ζ**
using GCG2016 at each landmark before adding above-ground parts. Fail visibly if
that conversion is unavailable. Do not use DHHN2016 H as ellipsoidal h or add the
quasigeoid offset twice. The consumer's selected planar demonstration may instead
deliberately keep H, but must label that choice.

Full-NRW DGM availability does **not** establish visible terrain coverage in CARMA.
The Terrarium subset uses a clipped [coverage polygon][coverage], not just its
TileJSON rectangle. In particular Waldberg is east of that rectangle's current
7.764078° boundary. Consumers must distinguish a separately anchored landmark
from a landmark standing on loaded terrain; these assets do not extend tile
service coverage or silently move towers onto the nearest covered pixel.

## Geometry and rights

All component radii, intermediate heights, platform shapes, antenna bands,
colors and the lookout's square orientation are **authored approximate silhouette
parameters**, not measured dimensions. Frusta are centered on the local vertical;
four radial segments approximate the lookout's square shell. Only the full-height
envelopes have the separate evidence above. Antenna fixtures, ancillary buildings,
construction changes and scaffolding are omitted. These low-detail models are for
recognition at distance, not engineering or exact line-of-sight validation.

The extracted OSM data carries **© OpenStreetMap contributors**, with [ODbL 1.0
terms and attribution][osm-license]. Ground samples are **Geobasis NRW**, under
[Datenlizenz Deutschland – Zero 2.0][zero]; the provider's product page links those
terms. Preserve these notices when distributing the extracted data. The original
approximate primitive descriptions and code follow the repository licence.

The user-supplied [Nordhelle.JPG][user-photo] is an own-work photograph by
**Milseburg**, dated **2011-07-16**, under **CC BY-SA 3.0 Unported**. Its listed
location describes the camera, not a tower. It remains an external visual
reference: no bitmap, crop, texture or copied image is bundled here. If later
redistributed or adapted, provide author/title/source, [licence][photo-license]
and change attribution as required. The extra three-tower photograph is linked
only for its author's identification; its media is not redistributed either.

[three-tower-photo]: https://commons.wikimedia.org/wiki/File:Fernmelde-_und_Sendet%C3%BCrme_Nordhelle_FFSW_PK_5374.jpg
[herscheid]: https://www.herscheid.de/freizeit-tourismus/wandern
[mvg]: https://www.meinerzhagen.de/fileadmin/user_upload/Meinerzhagen/TourismusFreizeit/Freizeitangebote/Sportliches/Wandern/MVG_Wanderbus_Broschuere_2017_WEB.pdf
[dgm]: https://www.bezreg-koeln.nrw.de/geobasis-nrw/produkte-und-dienste/hoehenmodelle/digitale-gelaendemodelle/digitales-gelaendemodell
[coverage]: https://terrain.cismet.de/nrw/coverage.geojson
[osm-license]: https://www.openstreetmap.org/copyright
[zero]: https://www.govdata.de/dl-de/zero-2-0
[user-photo]: https://commons.wikimedia.org/wiki/File:Nordhelle.JPG
[photo-license]: https://creativecommons.org/licenses/by-sa/3.0/
