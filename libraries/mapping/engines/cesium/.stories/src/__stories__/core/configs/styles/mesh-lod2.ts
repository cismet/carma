/**
 * Aerial Photogrammetry Mesh scene styles
 */
import { Color, toColorRgbaArray } from "@carma/cesium";
import type { SceneStyleConfig } from "@carma-mapping/engines/cesium/core";
import {
  WUPP_MESH_2024,
  WUPP_MESH_2020,
  WUPP_LOD2_TILESET,
  BASEMAP_METROPOLE_RUHR_WMTS_GRAUBLAU_HQ,
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
} from "@carma/resources";

export const MESH_LOD2_STYLE: SceneStyleConfig = {
  sources: {
    imagery: [
      {
        id: "spw2_graublau",
        ...BASEMAP_METROPOLE_RUHR_WMTS_GRAUBLAU_HQ,
      } as any,
    ],
    terrain: [
      { id: "dem-2020", ...WUPP_TERRAIN_PROVIDER },
      //{ id: "dsm-mesh-2024", ...WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M },
    ],
    tilesets: [
      { id: "wupp-mesh-2024", ...WUPP_MESH_2024 },
      { id: "wupp-mesh-2020", ...WUPP_MESH_2020 },
      { id: "wupp-lod2", ...WUPP_LOD2_TILESET },
    ],
  },

  styles: [
    {
      id: "mesh-2024",
      name: "Mesh 2024",
      shadows: false,
      backgroundColor: toColorRgbaArray(Color.GRAY),
      globe: {
        baseColor: [1.0, 0, 0, 1 / 255],
      },
      tilesets: [{ id: "wupp-mesh-2024" }],
      terrain: "dem-2020",
    },
    {
      id: "mesh-2020",
      name: "Mesh 2020",
      shadows: false,
      backgroundColor: toColorRgbaArray(Color.GRAY),
      globe: {
        baseColor: [0, 1.0, 0, 1 / 255],
      },
      tilesets: [{ id: "wupp-mesh-2020" }],
      terrain: "dem-2020",
    },
    {
      id: "lod2",
      name: "LOD2",
      shadows: false,
      backgroundColor: toColorRgbaArray(Color.WHITE),
      globe: {
        baseColor: toColorRgbaArray(Color.WHITE),
      },
      imageryLayers: [{ id: "spw2_graublau", opacity: 1.0 }],
      tilesets: [{ id: "wupp-lod2" }],
      terrain: "dem-2020",
    },
  ],
};
