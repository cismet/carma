import {
  Cartesian3,
  CoplanarPolygonGeometry,
  Matrix4,
  PerInstanceColorAppearance,
} from "@carma/cesium";

export type AnchoredCoplanarPolygonGeometry = {
  geometry: CoplanarPolygonGeometry;
  modelMatrix: Matrix4;
};

export const createAnchoredCoplanarPolygonGeometry = (
  positions: Cartesian3[]
): AnchoredCoplanarPolygonGeometry | null => {
  const anchor = positions[0];
  if (!anchor || positions.length < 3) return null;

  const localPositions = positions.map((position) =>
    Cartesian3.subtract(position, anchor, new Cartesian3())
  );
  const geometry = CoplanarPolygonGeometry.fromPositions({
    positions: localPositions,
    vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
  });
  if (!geometry) return null;

  return {
    geometry,
    modelMatrix: Matrix4.fromTranslation(anchor, new Matrix4()),
  };
};
