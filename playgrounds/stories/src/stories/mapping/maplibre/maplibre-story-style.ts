import type { StyleSpecification } from "maplibre-gl";

export const SURFACE_TILE_OPTIONS = ["stadtplan", "luftbild"] as const;

export type SurfaceTileMode = (typeof SURFACE_TILE_OPTIONS)[number];

export const SURFACE_TILE_LABELS: Record<SurfaceTileMode, string> = {
  stadtplan: "Vector map",
  luftbild: "Luftbild raster",
};

export const WUPPERTAL_TERRAIN_SOURCE_ID = "source-wuppertal-terrain";

const BASEMAP_SOURCE_ID = "source-basemap";
const BASEMAP_LAYER_ID = "layer-basemap";
const WUPPERTAL_TERRAIN_TILE_URL =
  "https://wuppertal-terrain.cismet.de/services/wupp_dgm_01/tiles/{z}/{x}/{y}.png";
const STADTPLAN_TILE_URL =
  "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}";
const LUFTBILD_TILE_URL =
  "https://maps.wuppertal.de/karten?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=R102:trueortho2022&STYLES=&FORMAT=image/png&TRANSPARENT=false&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256";

export const createWuppertalStoryStyle = (
  surfaceTiles: SurfaceTileMode
): StyleSpecification => {
  const isLuftbild = surfaceTiles === "luftbild";

  return {
    version: 8,
    sources: {
      [WUPPERTAL_TERRAIN_SOURCE_ID]: {
        type: "raster-dem",
        tiles: [WUPPERTAL_TERRAIN_TILE_URL],
        tileSize: 512,
        maxzoom: 15,
      },
      [BASEMAP_SOURCE_ID]: {
        type: "raster",
        tiles: [isLuftbild ? LUFTBILD_TILE_URL : STADTPLAN_TILE_URL],
        tileSize: 256,
        attribution: isLuftbild ? "© Stadt Wuppertal" : "© RVR",
      },
    },
    layers: [
      {
        id: BASEMAP_LAYER_ID,
        type: "raster",
        source: BASEMAP_SOURCE_ID,
        paint: {
          "raster-opacity": isLuftbild ? 1 : 0.9,
        },
      },
    ],
  };
};
