import { ContentTypes, type TilesetConfig, TilesetTypes } from "@carma/types";

export const TILESET_BASEMAP_DE: TilesetConfig = {
  url: "https://web3d.basemap.de/cesium/buildings-fly/root.json",
  key: "basemap-de",
  type: TilesetTypes.LOD2,
  contentTypes: [ContentTypes.BUILDINGS, ContentTypes.BRIDGES],
};
