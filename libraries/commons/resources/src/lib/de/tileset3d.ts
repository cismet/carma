import { ContentType, type TilesetConfig, TilesetType } from "../tilesets";

export const TILESET_BASEMAP_DE: TilesetConfig = {
  url: "https://web3d.basemap.de/cesium/buildings-fly/root.json",
  key: "basemap-de",
  type: TilesetType.LOD2,
  contentTypes: [ContentType.BUILDINGS, ContentType.BRIDGES],
};
