import type { RasterDemTerrainResource } from "../base/terrain";

export const WUPP_TERRAIN_PROVIDER = {
  url: "https://cesium-wupp-terrain.cismet.de/terrain2020",
};

export const WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M = {
  url: "https://cesium-wupp-terrain.cismet.de/dom_2024_1m",
};

/*
 * The NRW 1 m height models served as Terrarium elevation tiles. The ids name
 * the source dataset ("nrw"), model, resolution, datum and subset: the
 * Bergisches Städtedreieck (Wuppertal, Solingen, Remscheid, "w-sg-rs") plus a
 * 30 km buffer that reaches Düsseldorf, Köln, Essen and Dortmund. `bounds`
 * equals the services' TileJSON bounds; zoom range, bounds corners and the
 * cities were probed against both services on 2026-09-10.
 */

/** Both models: 1 m source grid, Terrarium 1/256 m step, AdV 95 % accuracy. */
const NRW_HEIGHT_MODEL_ELEVATION = {
  groundSamplingMeters: 1,
  heightStepMeters: 1 / 256,
  accuracyMeters95: [0.15, 0.3],
} as const satisfies RasterDemTerrainResource["elevation"];

const NRW_HEIGHT_MODEL_NOTES = `Accuracy per the AdV product standard (95 % confidence): about ±0.15 m on flat, open ground and up to ±0.30 m on steep or densely vegetated terrain; the Wuppertal 2020 acquisition is described with about ±0.20 m single-point accuracy. At zoom 16 a tile pixel spans about 0.75 m in Wuppertal, finer than the 1 m source grid. Derived dataset, compiled by cismet on 2026-09-04 and re-encoded as lossless WebP with zoom 16 on 2026-09-05 (the server ignores the URL extension and always answers image/webp). Processing: clipped to the Bergisches Städtedreieck plus 30 km, reprojected from UTM32 (EPSG:25832) to Web Mercator, DHHN2016 heights encoded as Terrarium RGB (base -32768, 1/256 m steps), 512 px tiles z5-16 on terrain.cismet.de; coverage outline at https://terrain.cismet.de/nrw/coverage.geojson. Source: Geobasis NRW (Bezirksregierung Köln), 1 km GeoTIFF tiles, licence Datenlizenz Deutschland - Zero - Version 2.0 (dl-de/zero-2-0, https://www.govdata.de/dl-de/zero-2-0), attribution "Geobasis NRW". Source state read from the open data listing on 2026-09-10: inside the extent 7 917 tiles with flight years 2020, 2021, 2022 and 2025 in their names (Wuppertal core: 2020 and 2025).`;

/** DEM: NRW DGM1, ground model without buildings and vegetation. */
export const NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN = {
  id: "nrw-dem-1m-dhhn2016-w-sg-rs",
  url: "https://terrain.cismet.de/services/nrw/dgm1_dhhn2016_terrarium/tiles/{z}/{x}/{y}.webp",
  tileSize: 512,
  minzoom: 5,
  maxzoom: 16,
  encoding: "terrarium",
  format: "webp",
  bounds: [6.48883, 50.831527, 7.764078, 51.597321],
  verticalDatum: "DHHN2016",
  elevation: NRW_HEIGHT_MODEL_ELEVATION,
  sourceUrl: "https://www.opengeodata.nrw.de/produkte/geobasis/hm/dgm1_tiff/",
  notes: `Digitales Geländemodell (DGM1), Rasterweite 1 m (source tiles published 2023-05-29 to 2026-09-01). ${NRW_HEIGHT_MODEL_NOTES}`,
} as const satisfies RasterDemTerrainResource;

/** DSM: NRW DOM1, surface model including buildings and vegetation. */
export const NRW_DOM1_DHHN2016_TERRARIUM_TERRAIN = {
  id: "nrw-dsm-1m-dhhn2016-w-sg-rs",
  url: "https://terrain.cismet.de/services/nrw/dom1_dhhn2016_terrarium/tiles/{z}/{x}/{y}.webp",
  tileSize: 512,
  minzoom: 5,
  maxzoom: 16,
  encoding: "terrarium",
  format: "webp",
  bounds: [6.48883, 50.831527, 7.764078, 51.597321],
  verticalDatum: "DHHN2016",
  elevation: NRW_HEIGHT_MODEL_ELEVATION,
  sourceUrl: "https://www.opengeodata.nrw.de/produkte/geobasis/hm/dom1_tiff/",
  notes: `Digitales Oberflächenmodell (DOM1), Rasterweite 1 m (source tiles published 2022-03-21 to 2026-09-02); deviations are markedly larger at vegetation, narrow objects and height jumps. ${NRW_HEIGHT_MODEL_NOTES}`,
} as const satisfies RasterDemTerrainResource;
