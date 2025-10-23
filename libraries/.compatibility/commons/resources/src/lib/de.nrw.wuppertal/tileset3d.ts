import { ContentType, type TilesetConfig, TilesetType } from "../tilesets";

export const WUPP_MESH_2020: TilesetConfig = {
  url: "https://wupp-3d-data.cismet.de/mesh/tileset.json",
  key: "wupp-mesh-2020",
  type: TilesetType.MESH,
};

export const WUPP_MESH_2024: TilesetConfig = {
  url: "https://wupp-3d-data.cismet.de/mesh2024/tileset.json",
  key: "wupp-mesh-2024",
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
