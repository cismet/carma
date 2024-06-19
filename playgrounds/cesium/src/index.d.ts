type Translation = {
  x: number;
  y: number;
  z: number;
};

export type TilesetConfig = {
  url: string;
  translation: Translation;
};

export type ColorRgbaArray = [number, number, number, number];

export type CameraPositionAndOrientation = {
  position: Cartesian3;
  up: Cartesian3;
  direction: Cartesian3;
};
