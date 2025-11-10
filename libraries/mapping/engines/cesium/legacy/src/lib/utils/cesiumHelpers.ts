import {
  Cartesian3,
  Cartographic,
  Cesium3DTileset,
  Cesium3DTileStyle,
  Color,
  ColorMaterialProperty,
  Matrix4,
  Math as CesiumMath,
  Rectangle,
  OrthographicFrustum,
  OrthographicOffCenterFrustum,
  PerspectiveFrustum,
  PerspectiveOffCenterFrustum,
} from "cesium";

import type { TilesetConfig } from "@carma-commons/resources";

import { logOnce } from "@carma-commons/utils";

logOnce(
  "@carma-mapping/engines/cesium/legacy  utils/cesiumHelpers is deprecated use @carma/cesium api wrapper methods or new cesium/core replacements"
);

export const SELECTABLE_TRANSPARENT_3DTILESTYLE = create3DTileStyle({
  color: `vec4(1.0, 0.0, 0.0, 0.01)`,
  show: true,
});
export const SELECTABLE_TRANSPARENT_MATERIAL = new ColorMaterialProperty(
  Color.BLACK.withAlpha(1 / 255)
);

export function getModelMatrix(config: TilesetConfig, heightOffset = 0) {
  const { x, y, z } = config.translation ?? { x: 0, y: 0, z: 0 };
  const surface = Cartesian3.fromRadians(x, y, z);
  const offset = Cartesian3.fromRadians(x, y, z + heightOffset);
  const translation = Cartesian3.subtract(offset, surface, new Cartesian3());
  const modelMatrix = Matrix4.fromTranslation(translation);
  return modelMatrix;
}

// use with onReady event of Cesium3DTileset
export const logTileSetInfoOnReady = (tileset: Cesium3DTileset) => {
  const { center } = tileset.root.boundingSphere;
  const cartographic = Cartographic.fromCartesian(center);
  const longitude = CesiumMath.toDegrees(cartographic.longitude);
  const latitude = CesiumMath.toDegrees(cartographic.latitude);
  const height = cartographic.height;

  console.debug(
    `Longitude: ${longitude}, Latitude: ${latitude}, Height: ${height}, center: ${center}, ${tileset.basePath}}`
  );
};

export const getTileSetInfo = (tileset: Cesium3DTileset) => {
  const { center } = tileset.root.boundingSphere;
  const cartographic = Cartographic.fromCartesian(center);
  const longitude = CesiumMath.toDegrees(cartographic.longitude);
  const latitude = CesiumMath.toDegrees(cartographic.latitude);
  const height = cartographic.height;
  console.debug(
    `Longitude: ${longitude}, Latitude: ${latitude}, Height: ${height}, center: ${center}, ${tileset.basePath}}`
  );
};

export function create3DTileStyle(
  styleDescription: Record<string, unknown | string>
): Cesium3DTileStyle | undefined {
  try {
    return new Cesium3DTileStyle(styleDescription);
  } catch (error) {
    console.warn(
      "Error in Tileset Style Creation from: ",
      styleDescription,
      error
    );

    return undefined;
  }
}

// GET FRUSTUM/VIEWPORT EXTENT

export const createOffCenterFrustum = (
  // TODO Implement and Test
  sourceFrustum: PerspectiveFrustum | OrthographicFrustum,
  {
    near,
    far,
    left,
    right,
    top,
    bottom,
  }: {
    near?: number;
    far?: number;
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
  } = {}
) => {
  const src = sourceFrustum.clone();

  if (src instanceof OrthographicFrustum) {
    const frustum = new OrthographicOffCenterFrustum({
      near: near ?? src.near,
      far: far ?? src.far,
      left: -500,
      right: 500,
      top: 800,
      bottom: -300,
    });

    return frustum;
  } else if (src instanceof PerspectiveFrustum) {
    const frustum = new PerspectiveOffCenterFrustum({
      //fov: fov ?? src.fov,
      //aspectRatio: aspectRatio ?? src.aspectRatio,
      near: near ?? src.near,
      far: far ?? src.far,
      left: left ?? -500,
      right: right ?? 500,
      top: top ?? 800,
      bottom: bottom ?? -300,
    });
    return frustum;
  }
  console.warn("Unsupported frustum type");
  return;
};

// GEO

export const extentDegreesToRectangle = (extent: {
  west: number;
  east: number;
  north: number;
  south: number;
}) => {
  const { west, east, north, south } = extent;
  const wsen = [west, south, east, north];
  const wsenRad = wsen.map((x) => CesiumMath.toRadians(x));
  return new Rectangle(...wsenRad);
};

export const rectangleToExtentDegrees = ({
  west,
  south,
  east,
  north,
}: Rectangle) => {
  const wsen = [west, south, east, north].map((x) => CesiumMath.toDegrees(x));
  return {
    west: wsen[0],
    south: wsen[1],
    east: wsen[2],
    north: wsen[3],
    leafletBounds: {
      NE: {
        lat: wsen[3],
        lng: wsen[2],
      },
      SW: {
        lat: wsen[1],
        lng: wsen[0],
      },
    },
  };
};
