import {
  ContentTypes,
  CityModelTypes,
  TilesetFormats,
  TilesetContentTypes,
  type TilesetResourceConfig,
} from "@carma/types";

export const WUPP_MESH_2020: TilesetResourceConfig = {
  url: "https://wupp-3d-data.cismet.de/mesh/tileset.json",
  content: {
    format: TilesetFormats.B3DM,
    contentType: TilesetContentTypes.MESH,
    cityModelType: CityModelTypes.MESH,
  },
  renderPreset: {
    customShader: "UNLIT_ENHANCED_2020" as any,
  },
  metadata: {
    name: "Wuppertal Mesh 2020",
    captureDate: "2020",
  },
};

export const WUPP_MESH_2024: TilesetResourceConfig = {
  url: "https://wupp-3d-data.cismet.de/mesh2024/tileset.json",
  content: {
    format: TilesetFormats.B3DM,
    contentType: TilesetContentTypes.MESH,
    cityModelType: CityModelTypes.MESH,
  },
  renderPreset: {
    customShader: "UNLIT_ENHANCED_2024" as any,
  },
  metadata: {
    name: "Wuppertal Mesh 2024",
    captureDate: "2024",
  },
};

export const WUPP_LOD2_TILESET: TilesetResourceConfig = {
  url: "https://wupp-3d-data.cismet.de/lod2/tileset.json",
  content: {
    format: TilesetFormats.B3DM,
    contentType: TilesetContentTypes.OBJECT,
    cityModelType: CityModelTypes.LOD2,
    contentTypes: [ContentTypes.BUILDINGS, ContentTypes.BRIDGES],
  },
  metadata: {
    name: "Wuppertal LOD2 Buildings",
  },
};

export const WUPP_BAUMKATASTER_TILESET: TilesetResourceConfig = {
  url: "https://wupp-3d-data.cismet.de/trees/tileset.json",
  content: {
    format: TilesetFormats.I3DM,
    contentType: TilesetContentTypes.OBJECT,
    cityModelType: CityModelTypes.LOD4,
    contentTypes: [ContentTypes.TREES],
  },
  metadata: {
    name: "Wuppertal Tree Cadastre",
  },
};
