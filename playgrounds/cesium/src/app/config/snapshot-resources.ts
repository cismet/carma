/**
 * Resource configs in OLD snapshot format
 *
 * The cesium-engine-snapshot uses the old TilesetConfig format which differs
 * from the current @carma/resources TilesetResourceConfig.
 *
 * These configs are adapted from @carma/resources to work with the snapshot.
 */

import {
  WUPP_MESH_2024,
  WUPP_LOD2_TILESET,
  WUPP_TERRAIN_PROVIDER,
  BASEMAP_METROPOLE_RUHR_WMS_GRAUBLAU,
} from "@carma/resources";
import {
  TilesetTypes,
  type TilesetConfig,
} from "../../lib/cesium-engine-snapshot/src/lib/types/tileset-snapshot-types";

/**
 * Wuppertal Mesh 2024 - Snapshot Format
 */
export const WUPP_MESH_2024_SNAPSHOT: TilesetConfig = {
  url: WUPP_MESH_2024.url,
  type: TilesetTypes.MESH,
  constructorOptions: {},
};

/**
 * Wuppertal LOD2 Tileset - Snapshot Format
 */
export const WUPP_LOD2_TILESET_SNAPSHOT: TilesetConfig = {
  url: WUPP_LOD2_TILESET.url,
  type: TilesetTypes.LOD2,
  constructorOptions: {},
};

/**
 * Old imagery provider format
 * The snapshot expects simple ImageryProviderConfig with url/layers/parameters
 */
export const BASEMAP_METROPOLE_RUHR_SNAPSHOT = {
  url: "https://geodaten.metropoleruhr.de/spw2/service",
  layers: "spw2_light_gdk",
  parameters: {
    transparent: true,
    format: "image/png",
  },
};

// Re-export terrain provider (format hasn't changed)
export { WUPP_TERRAIN_PROVIDER };
