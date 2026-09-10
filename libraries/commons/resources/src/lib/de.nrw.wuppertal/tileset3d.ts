import {
  ContentType,
  type TilesetConfig,
  type TextureColorCorrection,
  TilesetType,
} from "../base/tilesets";

export const WUPP_MESH_2020: TilesetConfig = {
  url: "https://wupp-3d-data.cismet.de/mesh/tileset.json",
  key: "wupp-mesh-2020",
  type: TilesetType.MESH,
};

export const WUPP_MESH_2024: TilesetConfig & {
  colorCorrection: TextureColorCorrection;
  alternateUrls: readonly string[];
} = {
  url: "https://wupp-3d-data.cismet.de/mesh2024/tileset.json",
  key: "wupp-mesh-2024",
  /** MeshX delivery used by the Geoportal's 2024 mesh style. */
  alternateUrls: ["https://wupp-3d-datax.cismet.de/mesh2024/tileset.json"],
  /** Cesium UNLIT_ENHANCED_2024 calibration; tone correction, not de-lighting. */
  colorCorrection: {
    gamma: [1.25, 1.25, 1.23],
    blackPoint: [0, 0, 0],
    whitePoint: [0.9, 0.9, 0.92],
    saturation: 1,
  },
  type: TilesetType.MESH,
};

export const WUPP_LOD2_TILESET: TilesetConfig = {
  url: "https://wupp-3d-data.cismet.de/lod2/tileset.json",
  key: "wupp-lod2",
  type: TilesetType.LOD2,
  contentTypes: [ContentType.BUILDINGS, ContentType.BRIDGES],
  disableSelection: true,
};

export const WUPP_BAUMKATASTER_TILESET: TilesetConfig = {
  url: "https://wupp-3d-data.cismet.de/trees/tileset.json",
  key: "wupp-baumkaster",
  type: TilesetType.LOD4,
  contentTypes: [ContentType.TREES],
};
