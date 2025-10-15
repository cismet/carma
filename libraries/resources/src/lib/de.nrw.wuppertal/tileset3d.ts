import { ContentTypes, type TilesetConfig, TilesetTypes } from "@carma/types";

export const WUPP_MESH_2020: TilesetConfig = {
  url: "https://wupp-3d-data.cismet.de/mesh/tileset.json",
  key: "wupp-mesh-2020",
  type: TilesetTypes.MESH,
};

export const WUPP_MESH_2024: TilesetConfig = {
  url: "https://wupp-3d-data.cismet.de/mesh2024/tileset.json",
  key: "wupp-mesh-2024",
  type: TilesetTypes.MESH,
};

export const WUPP_LOD2_TILESET: TilesetConfig = {
  url: "https://wupp-3d-data.cismet.de/lod2/tileset.json",
  key: "wupp-lod2",
  type: TilesetTypes.LOD2,
  contentTypes: [ContentTypes.BUILDINGS, ContentTypes.BRIDGES],
  disableSelection: true,
};

export const WUPP_BAUMKATASTER_TILESET: TilesetConfig = {
  url: "https://wupp-3d-data.cismet.de/trees/tileset.json",
  key: "wupp-baumkaster",
  type: TilesetTypes.LOD4,
  contentTypes: [ContentTypes.TREES],
};
