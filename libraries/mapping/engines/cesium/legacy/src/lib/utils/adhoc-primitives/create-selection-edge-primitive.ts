import {
  Cartesian3,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  Primitive,
  PolylineColorAppearance,
  PolylineGeometry,
  type Color,
} from "@carma/cesium";

type CreateSelectionEdgeOptions = {
  ring: number[][];
  heights: number[];
  featureId: string;
  color: Color;
  getWallHeight: (segmentIndex: number) => number;
  offsetMeters?: number;
  widthPixels?: number;
};

export const createSelectionEdgePrimitive = (
  options: CreateSelectionEdgeOptions
): Primitive | null => {
  const {
    ring,
    heights,
    featureId,
    color,
    getWallHeight,
    offsetMeters = 1,
    widthPixels = 1.5,
  } = options;
  if (ring.length < 2) return null;

  const positionsArray: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const coord = ring[i];
    if (!coord) continue;
    const segmentIndex = Math.min(i, ring.length - 2);
    const baseHeight = heights[i] ?? 0;
    const wallHeight = getWallHeight(segmentIndex);
    positionsArray.push(
      coord[0],
      coord[1],
      baseHeight + wallHeight + offsetMeters
    );
  }

  if (positionsArray.length < 6) return null;

  const positions = Cartesian3.fromDegreesArrayHeights(positionsArray);

  const geometry = new PolylineGeometry({
    positions,
    width: widthPixels,
    vertexFormat: PolylineColorAppearance.VERTEX_FORMAT,
  });

  const instance = new GeometryInstance({
    geometry,
    attributes: {
      color: ColorGeometryInstanceAttribute.fromColor(color),
    },
    id: {
      featureId,
      selectionEdge: true,
    },
  });

  return new Primitive({
    geometryInstances: instance,
    appearance: new PolylineColorAppearance({
      translucent: true,
    }),
    releaseGeometryInstances: false,
  });
};
