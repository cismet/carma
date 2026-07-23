# Point cloud samples (wupp#4064)

COPC/LAZ samples for the `/#/pointcloud` route. Built-in datasets are loaded from the configured remote data service and must never be copied into the application bundle. The portable preprocessing scripts live under `playgrounds/pointcloud-stories/scripts/`; private connection and remote-root values belong only in ignored `.env.local` files.

| Local file                                       | Source tag     | Acquisition date | Reproducible input                                           |
| ------------------------------------------------ | -------------- | ---------------- | ------------------------------------------------------------ |
| `kaiser-wilhelm-hain-rgb.copc.laz`               | Fraunhofer     | unknown          | supplier delivery                                            |
| `awg-2-segmentierung.copc.laz`                   | Fraunhofer     | unknown          | Fraunhofer delivery                                          |
| `wuppertal-oelberg-mls-2025-09-11.copc.laz`      | F4R            | 2025-09-11       | F4R delivery, 29 raw MLS runs                                |
| `wuppertal-oelberg-georadar-2025-09-11.copc.laz` | F4R            | 2025-09-11       | supplier delivery, currently 11 georadar volumes in the COPC |
| `nordbahntrasse-2025-12-segments.copc.laz`       | Fraunhofer IPM | 2025-12          | supplier delivery                                            |

The georadar and the large September MLS cloud belong to the same Wuppertal-Ölberg F4R campaign. Only the December delivery is currently verified as Nordbahntrasse. File-creation dates in incomplete LAS headers are not treated as acquisition dates.

The deliveries do not share one verified 3D CRS. In particular, the AWG2 LAS header contains no CRS declaration. Dataset context: https://github.com/cismet/wupp/issues/4064.

## MapLibre scene reference frame

The `/#/pointcloud` route uses the active MapLibre terrain provider as its vertical display reference. The standalone Three.js stories keep their ellipsoidal ECEF reference instead:

- horizontal display: MapLibre Web Mercator (`EPSG:3857`), with local metres `X = east`, `Y = up`, `Z = south` inside each custom layer;
- horizontal point inputs: `EPSG:25832` (ETRS89 / UTM zone 32N) when that CRS is declared or explicitly recorded as an inference;
- vertical display: the Wuppertal DGM1 provider's DHHN2016 numeric metres;
- ellipsoidal input heights are converted with GCG2016: `H_DHHN2016 = h_ellipsoidal - zeta_GCG2016`;
- DHHN2016 inputs remain unchanged;
- surface-relative inputs require a successful query against the active, registered terrain. Missing GCG2016 or terrain data is an error, never a silent zero correction.

This is a rendering frame, not a compound CRS: tile addressing is `EPSG:3857`, while Z follows the provider's DHHN2016 heights. The standalone viewer keeps the native mesh in `EPSG:4978` and derives a local tangent frame from it.

| Asset                 | Horizontal source                                                                     | Vertical source                                                                                            | MapLibre registration status                                                                |
| --------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Wuppertal DGM terrain | Web-Mercator terrain tiles                                                            | DHHN2016 numeric metres (service assumption; immutable source metadata still required)                     | target display surface, decoded unchanged                                                   |
| AWG2 point cloud      | LAS header says unknown; `EPSG:25832` inferred from coordinate extent and location    | ellipsoidal inferred from the measured GCG2016-sized delta                                                 | fixed rigid correction below, then `-46.499918254 m` GCG2016 datum conversion at the anchor |
| Mesh 2024             | root content `EPSG:4978`; original source-height pipeline remains incompletely proven | ECEF placement confirmed; physical vertical datum of visible surface not guaranteed from the wrapper alone | no additional runtime datum offset; current agreement is empirical                          |
| Mesh 2020 / LOD2      | tileset placement only; source build CRS not verified                                 | not verified                                                                                               | diagnostic only; no datum correction until provenance is known                              |

`EPSG:25832` is ETRS89 / UTM zone 32N; it must not be labelled “WGS84-UTM32” (`EPSG:32632`).

### Mesh 2024 root transform and the 46 m regression

The published Mesh 2024 root transform has ECEF translation `[3970046.914097, 498961.576644, 4950543.333325] m`. Independent `EPSG:4978 -> EPSG:4979` conversion gives longitude `7.163461249942 deg`, latitude `51.241111230271 deg`, and ellipsoidal height `207.598429 m`. GCG2016 gives `zeta = 46.596670 m` there, corresponding numerically to approximately `161.001759 m` DHHN2016. This proves the technical ECEF frame of the root transform, but not that every visible vertex originated from a correctly declared source-height datum.

The observed regression came from applying an additional `-zeta_GCG2016` translation to the already reoriented tileset. It put Mesh 2024 about 46.5 m below terrain and Mesh 2020. The runtime therefore applies only the explicit user mesh offset, zero by default. This is an empirical mounting decision, not a claim that the missing source-height provenance is resolved.

Mesh 2020 does not expose equivalent CRS provenance. Its wrapper has broad, nonphysical height bounds, while root tile `p-00000.b3dm` uses `CESIUM_RTC` with ECEF centre `[3969665.471310, 498996.057181, 4950586.522289] m`; surface height is carried in the local vertices. This confirms ECEF-style placement but not the original vertical datum or conversion pipeline. Agreement with terrain is an empirical cross-check, not a datum guarantee.

## AWG2 empirical rigid registration

Registration was computed against the same Wuppertal DGM1 terrain tiles shown by MapLibre, after converting their assumed DHHN2016 values to ellipsoidal heights with the official GCG2016 grid.

1. The COPC header reports 14,720,114 points and no declared CRS. The extent `E 370089.308…370480.543`, `N 5679884.094…5680222.173` locates the cloud plausibly in `EPSG:25832`. Source SHA-256: `2518e5dca78afd1369a18de2d165070655a7b416aa7e9b7bc2e1781b347a0ace`.
2. Every 100th source point was retained; 63,723 LAS class-2 ground samples were compared with bilinearly sampled DGM terrain at zoom 15 (about 2.389 m per terrain pixel) and converted with GCG2016.
3. A robust rigid ENU fit with iterative 3.5-MAD rejection used 63,660 inliers around source anchor `E 370327.584`, `N 5680082.375`, `h 200.265 m`.
4. The correction, applied to source coordinates before UTM→WGS84 conversion, is `+5.103344567°` about east, `+4.281994042°` about north and `-11.042280815 m` up. Manual ENU adjustment remains a separate display correction.

The `46.499918254 m` at the AWG anchor is the GCG2016 datum term, not a free visual offset. The MapLibre route applies `H_DHHN2016 = h_ellipsoidal - 46.499918254 m`; the rigid registration remains the separate `-11.042280815 m` fit term above. Before that fit, the raw point-minus-DHHN-DGM median was `55.593609 m`; removing the datum component leaves `9.093691 m`. Afterwards the registered residual has median `-0.075561 m`, MAD `1.560017 m`, RMSE `2.163486 m`, and 5th/95th percentiles `-3.296087/3.667806 m`. These figures make the correction reproducible but not survey-grade: DGM resolution, vegetation/objects, classification errors and the unverified source CRS limit the result. A supplier-declared CRS, vertical datum and exterior/mount orientation must replace this empirical registration when available.

### AWG2 source-field audit and browser conversion

The immutable AWG2 source was scanned across all 14,720,114 points, not sampled. Its SHA-256 is the value above; the local derived file is currently byte-identical. It is LAS 1.4 point format 6 with a 30-byte point record, no WKT and no `Red`, `Green`, or `Blue` dimensions. Therefore AWG2 must never receive the generic RGB preset.

Only `X`, `Y`, `Z`, and `Classification` vary. `Intensity`, return counters, all point flags, scanner channel, scan direction, edge-of-flight-line, `UserData`, `ScanAngle`, `PointSourceId`, and `GpsTime` are uniformly zero. Point format 6 structurally contains these standard fields, so a valid COPC cannot physically delete them. The browser conversion retains only `Z` and `Classification` as scalar visualization fields, does not allocate an RGB array, and creates classification colors from the editable lookup table on the GPU. This removes the constant fields from application memory and UI without rewriting or weakening the immutable source.

The same source also cannot prove a sensor or mount orientation. Its LAS `System Identifier` and `Generating Software` are empty, its creation date is the placeholder day 1 of year 1, the projection VLR has zero length, and no trajectory or exterior-orientation record is present. An exploratory geometry-only check of locally planar class-6 facade patches does indicate a roughly `2...4 deg` source-frame tilt towards grid north-west, in the same direction as the terrain fit. That supports a tilt somewhere in the upstream registration or reconstruction, but it neither identifies a physical sensor mount error nor justifies the full `6.658 deg` combined DGM-fit tilt. The fit must therefore remain labelled empirical until acquisition metadata or independent control points are available.

At the AWG anchor, UTM32 grid north is approximately `1.446 deg` west of true north. This meridian convergence is a rotation about the up axis only. It may matter for an independently stored heading, but cannot produce the fitted east/north tilt or any vertical offset; point coordinates transformed point-by-point from `EPSG:25832` already follow the projection geometry.

The scene panel exposes a non-destructive manual correction in the local East/North/Up frame. East and North translate the already registered cloud horizontally; Up replaces the former `z-Offset` and is applied after the documented `-46.499918254 m` datum conversion. Each slider covers `-10...+10 m` at `0.1 m` resolution, while the adjacent numeric field accepts finite values outside that range. These display corrections do not modify the COPC source or the documented AWG2 registration.

The Terrain-RGB decoder remains unchanged. The exact GCG2016 value above is valid for the AWG anchor; a larger working area must query the spatially varying GCG2016 model rather than reuse this constant.

## Derived visualization fields

Production COPCs may carry `AO` as an unsigned 8-bit LAS Extra Bytes dimension: `0` means fully occluded and `255` means fully sky-visible. The browser maps it to `0...1` and treats it like any other scalar colorization field. The fixed AO layer opacity only controls how strongly that baked field mixes with the base color; the viewer does not compute AO. AO must be baked after applying the documented rigid registration so that its upper hemisphere matches scene up. The immutable supplier file remains the provenance source; the AO-enriched COPC is a reproducible derived asset.

Height above DGM 2020 deliberately remains a runtime-derived field. It is cheap to sample bilinearly from the selected DEM tiles, depends on the active terrain reference, and does not justify a per-point floating-point Extra Bytes field.

## Data and remote deployment

The large source and derived files under `.data/` are local preprocessing data only and are ignored by Git. They are neither copied into the Vite production build nor used by the point-cloud route at runtime. The deployed viewer reads the remote dataset URLs from its descriptors; local `.data/` files remain relevant only to the separate `pointcloud-stories` investigation app.

The production route defaults to the separately hosted, content-versioned KWH, AWG, Ölberg MLS, and Nordbahntrasse AO COPCs at the public data origin. Georadar is deliberately excluded from this surface-point-cloud publication and remains a separate relative-depth volume asset. A deployment may override the default origin at build time:

```text
VITE_POINTCLOUD_DATA_BASE_URL=https://wupp-3d-data.cismet.de/mesh2024/pointclouds
```

The server must support HTTPS byte-range requests (`206 Partial Content` with a correct `Content-Range`) and cross-origin browser access. For public, credential-free assets, use `Access-Control-Allow-Origin: *` and expose `Accept-Ranges`, `Content-Length`, and `Content-Range`.

The active deployment uses `kaiser-wilhelm-hain-rgb-mesh2024-ao-v1-084aca0cfdcf.copc.laz` (64,315,546 bytes) and `awg-2-segmentierung-mesh2024-ao-v1-c7b7ccc83cb8.copc.laz` (96,364,489 bytes), `wuppertal-oelberg-mls-2025-09-11-mesh2024-ao-v1-8a2e89b90856.copc.laz` (11,465,093,116 bytes), and `nordbahntrasse-2025-12-segments-mesh2024-ao-v1-48badd4f8e68.copc.laz` (625,866,998 bytes). COPC clients request only the hierarchy and byte ranges needed for the current view; hosting a large file does not mean transferring the complete file to each client.

The browser API uses canonical lowercase field identifiers for every cloud. The full source audit retained RGB only for Kaiser-Wilhelm-Hain and Ölberg MLS. AWG contains no RGB payload; the Nordbahntrasse delivery's three channels were all the same constant value (`32896`) and were removed by conversion. Mandatory constant LAS fields can remain structurally present in a point format, but are not decoded into the browser working set unless the asset catalog lists them.
