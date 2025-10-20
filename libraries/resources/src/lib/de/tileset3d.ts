import {
  ContentTypes,
  CityModelTypes,
  TilesetFormats,
  TilesetContentTypes,
  type TilesetResourceConfig,
} from "@carma/types";

export const TILESET_BASEMAP_DE: TilesetResourceConfig = {
  url: "https://web3d.basemap.de/cesium/buildings-fly/root.json",
  content: {
    format: TilesetFormats.B3DM,
    contentType: TilesetContentTypes.OBJECT,
    cityModelType: CityModelTypes.LOD2,
    contentTypes: [ContentTypes.BUILDINGS, ContentTypes.BRIDGES],
  },
  metadata: {
    name: "Basemap.de LOD2 Buildings",
    credits: ["Basemap.de"],
  },
};
