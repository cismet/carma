import {
  Cartesian3,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  PerInstanceColorAppearance,
  Primitive,
  PrimitiveCollection,
  WallGeometry,
  type Color,
} from "@carma/cesium";

type CreateWallPrimitivesOptions = {
  ring: number[][];
  heights: number[];
  featureId: string;
  isSelected: boolean;
  getWallColor: (isSelected: boolean) => Color;
  getWallHeight: (segmentIndex: number) => number;
};

export const createWallPrimitives = (
  options: CreateWallPrimitivesOptions
): PrimitiveCollection => {
  const { ring, heights, featureId, isSelected, getWallColor, getWallHeight } =
    options;
  const primitives = new PrimitiveCollection();
  const wallColor = getWallColor(isSelected);
  const appearance = new PerInstanceColorAppearance({
    translucent: true,
    closed: true,
  });

  for (let i = 0; i < ring.length - 1; i++) {
    const start = ring[i];
    const end = ring[i + 1];
    if (!start || !end) continue;

    const startHeight = heights[i] ?? 0;
    const endHeight = heights[i + 1] ?? 0;
    const wallHeight = getWallHeight(i);

    const geometry = new WallGeometry({
      positions: Cartesian3.fromDegreesArrayHeights([
        start[0],
        start[1],
        startHeight,
        end[0],
        end[1],
        endHeight,
      ]),
      maximumHeights: [startHeight + wallHeight, endHeight + wallHeight],
      minimumHeights: [startHeight, endHeight],
    });

    const instance = new GeometryInstance({
      geometry,
      attributes: {
        color: ColorGeometryInstanceAttribute.fromColor(wallColor),
      },
      id: {
        adhocFeatureId: featureId,
      },
    });

    primitives.add(
      new Primitive({
        geometryInstances: instance,
        appearance,
        releaseGeometryInstances: false,
      })
    );
  }

  return primitives;
};
