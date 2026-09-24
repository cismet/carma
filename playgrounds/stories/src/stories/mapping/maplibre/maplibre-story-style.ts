import { NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN } from "@carma-commons/resources";
import type { StyleSpecification } from "maplibre-gl";

export const SURFACE_TILE_OPTIONS = ["stadtplan", "luftbild"] as const;

export type SurfaceTileMode = (typeof SURFACE_TILE_OPTIONS)[number];

export const SURFACE_TILE_LABELS: Record<SurfaceTileMode, string> = {
  stadtplan: "Vector map",
  luftbild: "True Ortho 03/2024",
};

export const WUPPERTAL_TERRAIN_SOURCE_ID = "source-wuppertal-terrain";

const BASEMAP_SOURCE_ID = "source-basemap";
const BASEMAP_LAYER_ID = "layer-basemap";
const STADTPLAN_TILE_URL =
  "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}";
// Decision: real 512 px responses, not upscaled 256 px WMTS tiles. The server
// only caches the 256 px WMTS grid; these WMS tiles use HTTP caching instead.
// See MESH-REFERENCE-20260914 in MESH_REFERENCE_DECISIONS.md.
const LUFTBILD_TILE_URL =
  "https://geo.udsp.wuppertal.de/geoserver-cloud/ows?service=WMS&version=1.1.1&request=GetMap&layers=GIS-102:trueortho2024&styles=&format=image/png&transparent=true&width=512&height=512&srs=EPSG:3857&bbox={bbox-epsg-3857}&tiled=true";

export const createWuppertalStoryStyle = (
  surfaceTiles: SurfaceTileMode | null
): StyleSpecification => {
  const isLuftbild = surfaceTiles === "luftbild";

  return {
    version: 8,
    sources: {
      [WUPPERTAL_TERRAIN_SOURCE_ID]: {
        type: "raster-dem",
        tiles: [NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN.url],
        tileSize: NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN.tileSize,
        minzoom: NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN.minzoom,
        maxzoom: NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN.maxzoom,
        encoding: NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN.encoding,
      },
      ...(surfaceTiles === null
        ? {}
        : {
            [BASEMAP_SOURCE_ID]: {
              type: "raster" as const,
              tiles: [isLuftbild ? LUFTBILD_TILE_URL : STADTPLAN_TILE_URL],
              ...(isLuftbild
                ? {
                    minzoom: 10,
                    maxzoom: 22,
                    bounds: [
                      6.986948485777907, 51.09384481369635, 7.410374849511482,
                      51.406142167786214,
                    ] as [number, number, number, number],
                  }
                : {}),
              tileSize: isLuftbild ? 512 : 256,
              attribution: isLuftbild ? "© Stadt Wuppertal" : "© RVR",
            },
          }),
    },
    layers:
      surfaceTiles === null
        ? []
        : [
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
