export type ImageryReference = {
  key: string;
  opacity?: number;
};

export type TilesetReference = {
  key: string;
  opacity?: number;
};

export type TerrainReference = {
  key: string;
  opacity?: number;
};

export type SceneStyleConfig = {
  key: string;
  name: string;
  type: string;
  backgroundColor: ColorRgbaArray;
  globe: {
    baseColor: ColorRgbaArray;
  };
  imagery?: ImageryReference[];
  tilesets?: TilesetReference[];
  terrain?: TerrainReference;
};
