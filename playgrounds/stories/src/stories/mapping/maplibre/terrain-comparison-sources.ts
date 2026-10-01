import {
  NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
  type RasterDemTerrainResource,
} from "@carma-commons/resources";
import { WEB_MERCATOR_MAX_LATITUDE_DEG } from "@carma-geo/proj";

export const TERRAIN_COMPARISON_SOURCES = {
  nrw: NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
  global: {
    id: "mapzen-global-terrarium",
    url: "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png",
    tileSize: 256,
    minzoom: 0,
    maxzoom: 15,
    encoding: "terrarium",
    format: "png",
    bounds: [
      -180,
      -WEB_MERCATOR_MAX_LATITUDE_DEG,
      180,
      WEB_MERCATOR_MAX_LATITUDE_DEG,
    ],
    verticalDatum: "Source mosaic; no DHHN2016 correction",
    elevation: {
      groundSamplingMeters: null,
      heightStepMeters: 1 / 256,
      accuracyMeters95: null,
    },
    sourceUrl: "https://registry.opendata.aws/terrain-tiles/",
    notes:
      "Mapzen/Tilezen global bare-earth mosaic on AWS. Attribution varies by contributing dataset: https://github.com/tilezen/joerd/blob/master/docs/attribution.md. This comparison preserves encoded heights; it does not claim a uniform ellipsoidal height datum.",
  },
} as const satisfies Record<string, RasterDemTerrainResource>;

export type TerrainComparisonSource = keyof typeof TERRAIN_COMPARISON_SOURCES;
