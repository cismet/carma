# GCG2016 tiles

Status: July 16, 2026. For browser-side transformations between DHHN2016
normal heights and ellipsoidal heights, the helper in `@carma-geo/proj`
provides a spatially limited subset of GCG2016. This is a derived
representation of the official grid, not a separate height model.

## Source and derivation

The source is `de_bkg_gcg2016.tif` from PROJ 9.8.1:

- SHA-256:
  `598f18324dea7f8e72421d18add7ac6228259adf91eeb335cc9c27d98484f7ac`
- file size: 995,647 bytes
- raster: 950 × 1,052 Float32 values
- first pixel center: 3.25625° east, 55.979166667° north
- resolution: 0.0125° longitude × 0.008333333334° latitude
- horizontal grid reference according to the PROJ metadata: `EPSG:10283`
  (ETRS89/DREF91/2016)

The source data is provided by the German Federal Agency for Cartography and
Geodesy (BKG). According to the bundled PROJ file `de_bkg_README.txt`, it is
licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution:
"(c) Bundesamt für Kartographie und Geodäsie - BKG - Deutschland". The
[BKG product page](https://gdz.bkg.bund.de/index.php/default/quasigeoid-der-bundesrepublik-deutschland-quasigeoid.html)
is identified as the original source. The CARMA tiles are a technically
repacked and spatially limited adaptation: raster values and Float32 encoding
remain unchanged, while file partitioning and the runtime loader are
CARMA-specific. The generated payloads are TypeScript modules so their dynamic
imports work in consumers that do not enable TypeScript JSON-module resolution.

The derivation copies the binary Float32 values unchanged into four 2° tiles
for `[6°, 10°) east × [50°, 54°) north`. Each raster value belongs to exactly
one tile according to its pixel center; no halo rows or columns are duplicated.
When a spline's 5×5 support window crosses a tile boundary, only the required
neighboring tile is imported as well. Together, the four payloads occupy
820,586 bytes before HTTP compression. The `N50E006` tile containing the
current area of interest is 205,146 bytes before HTTP compression, 119,596
bytes with Gzip, and 92,870 bytes with Brotli. Vite bundles the dynamically
imported payload modules as separate chunks.

At runtime, the implementation uses the method reconstructed from the official
BKG `gintbs` program: five support values per axis, with natural cubic splines
evaluated first along raster X and then along raster Y. For a query between
raster values `i` and `i + 1`, each axis uses the local window
`i - 1 … i + 3`. This is a natural bicubic 5×5 spline, not GDAL's bilinear
raster sampling.

The height relationship is:

```text
h_ellipsoidal = H_DHHN2016 + N_GCG2016
H_DHHN2016    = h_ellipsoidal - N_GCG2016
```

The spline interpolates only the unchanged official grid values. It does not
apply a global polynomial, spherical-harmonic, or coefficient approximation,
and it introduces no additional quantization. An LOD pyramid is not useful for
this small scalar correction grid. The loader imports the requested 2° tile and
only those neighboring tiles intersected by the concrete 5×5 support window.
An explicit `prefetchGcg2016Tiles` call can preload additional tiles.

### Distinction from Proj4js and PROJ

The repository's Proj4js 2.19.4 dependency does not replace this helper. Its
GeoTIFF `nadgrids` path reads two horizontal angular-shift bands, interpolates
them bilinearly, and does not modify the height component. It therefore cannot
apply GCG2016 as a vertical grid shift. GeoTIFF.js can decode the source raster,
but it implements neither its height-datum semantics nor the official
interpolation method.

Native PROJ supports `vgridshift` and remains suitable for reproducible
offline pipelines. Its usual raster sampling is bilinear, however, and is not
identical to the BKG 5×5 spline reproduced here. A PROJ WASM build is not
currently a project dependency, would be substantially larger, and would not
by itself resolve this methodological difference.

## Coverage and failure behavior

The eastern and northern region boundaries are exclusive. The official raster
also contains NoData areas, primarily along its western and northern edges.
Every query therefore validates all 25 interpolation values. The helper rejects
its promise with a typed error:

- `UnsupportedVerticalOffsetRegionError`: coordinate outside
  `[6, 10) × [50, 54)`, incomplete 5×5 window at the outer boundary, or source
  NoData;
- `VerticalOffsetTileLoadError`: dynamic import or tile file unavailable;
- `InvalidVerticalOffsetTileError`: invalid format, encoding, or sample count
  in a loaded tile.

Coordinates are never clamped to the boundary, and NoData is never
extrapolated from neighboring values. Load and interpolation errors are neither
converted to a fallback height nor swallowed internally; calling UI code must
catch and display them.

## Reproducible derivation

```bash
python3 \
  libraries/commons/resources/src/lib/de/gcg2016/derive-gcg2016-tiles.py \
  --source-grid /path/to/de_bkg_gcg2016.tif \
  --output-directory \
    libraries/commons/resources/src/lib/de/gcg2016 \
  --region 6 50 10 54 \
  --tile-size-degrees 2 \
  --verification-random-per-tile 100000

./.dev-local/scripts/dev-build.mjs prettier --write \
  libraries/commons/resources/src/lib/de/gcg2016.ts \
  libraries/commons/resources/src/lib/de/gcg2016/validation.json
```

The generator requires GDAL with its Python bindings and NumPy. It validates
the Float32 values decoded from the generated tiles against the same 5×5
interpolation on the complete source GeoTIFF. With seed 4064, it generates
100,000 random points per tile plus 16,384 boundary and seam points. Actual
source NoData positions and points without a complete outer support window are
treated as unsupported. Individual values, point counts, and maximum numerical
differences are recorded in `validation.json`.

The spline selection was independently verified against the official BKG
`quasigeoid.geo89.de.zip` package. Its Linux binary contains the
`spline_`/`splint_` symbols, uses five support positions, and applies natural
boundary derivatives. Across 321,201 points in the complete geodetic footprint
of Mesh 2024, the reconstructed calculation differed by at most
`0.000501833693043352 m` from the millimeter-rounded `gintbs` text output.
Package, program, and raster hashes and the verification region are recorded in
`GCG2016_PROVENANCE.officialReferenceValidation`. For comparison, the
previous bilinear calculation differed from the spline by at most approximately
0.953 mm in the same region.

## API and validity limits

- `queryGcg2016Undulation(longitude, latitude)` returns the value together
  with the resource tiles actually used, the interpolation method, and separate
  validation metrics;
- `queryGcg2016Undulations(coordinates)` and
  `getGcg2016Undulations(coordinates)` process points concurrently, preserve
  input order, and share in-flight tile imports;
- `getGcg2016Undulation(longitude, latitude)` accepts geographic
  ETRS89/DREF91/2016 angles in degrees;
- `getGcg2016UndulationFromUtm32(easting, northing)`;
- `dhhn2016ToEllipsoidalHeight(easting, northing, height)`;
- `ellipsoidalToDhhn2016Height(easting, northing, height)`;
- `dhhn2016ToEllipsoidalHeights(coordinates)` and
  `ellipsoidalToDhhn2016Heights(coordinates)` provide explicit batch methods
  in both directions;
- `getGcg2016Utm32VerticalTransformer()` returns a cached, Proj4js-like
  transformer for UTM32 three-dimensional coordinates with asynchronous
  `forward`, `inverse`, `forwardBatch`, and `inverseBatch`. Its optional
  `init` preloads tiles for one or more UTM32 positions; later queries outside
  those positions still load on demand and propagate errors unchanged;
- `getGcg2016Wgs84VerticalTransformer()` keeps geographic longitude and
  latitude in `EPSG:4326` and transforms only the height component;
- `getGcg2016EcefTransformer()` fully transforms between
  `EPSG:25832+7837` and WGS84 ECEF `EPSG:4978`, individually or in batches;
- `prefetchGcg2016Tiles(longitude, latitude, radius)`.

The API is asynchronous because every 2° tile is a separate dynamic import.
The free functions intentionally use domain-specific names. Only the
transformer uses `forward` and `inverse`, because its `sourceReference` and
`targetReference` define the direction unambiguously, as they do for a
Proj4js converter. Ellipsoidal height is not a separate vertical CRS, so
`targetReference.verticalCrs` is deliberately `null` rather than an invented
EPSG identifier.

The horizontal UTM32/WGS84 and geocentric ECEF steps use the existing cached,
managed Proj4js converters from `@carma-geo/proj`, including `EPSG:4978`.
This module therefore duplicates neither WGS84 ellipsoid formulas nor the
Three-based scene geometry in `@carma-geo/utils`. Without a coordinate epoch,
Proj4js performs no time-dependent WGS84-to-ETRS89 transformation. This is
recorded as `epochTransformation: null` in the WGS84 and ECEF references and
must be assessed separately when absolute positioning accuracy matters. The
combination of an `EPSG:4326` position and a DHHN2016 height is not an official
compound CRS, so `compoundCrs` is also `null`.

The query metrics document observed agreement with the millimeter-rounded
official program output and lossless repackaging of the verified raster
values. The bilinear difference is only a method comparison.
`physicalModelAccuracyMeters` deliberately remains `null`: these software
checks do not establish a local physical accuracy bound for GCG2016.

The module and API names describe GCG2016 only. The current partial coverage is
recorded in `GCG2016_PROVENANCE.supportedRegion` and can be extended with newly
generated tiles. Within the supported raster cells, the implementation
reproduces the verified official 5×5 spline method to the output precision of
the reference program. It does not guarantee the physical accuracy of
GCG2016, an observed point, or any other input asset, and it does not replace
verification of CRS, height type, and coordinate epoch.
