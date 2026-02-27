import {
  Cartesian3,
  Cartesian4,
  Color,
  ColorGeometryInstanceAttribute,
  CoplanarPolygonGeometry,
  GeometryInstance,
  Matrix4,
  PerInstanceColorAppearance,
  Primitive,
} from "@carma/cesium";

export type DiscOptions = {
  radius: number;
  color?: Color;
  unitCircleSegments?: number;
  modelMatrix?: Matrix4;
};

const DEFAULT_UNIT_CIRCLE_SEGMENTS = 24;
const DEFAULT_COLOR = Color.WHITE.withAlpha(0.65);
const MIN_RADIUS = 0.1;

const createUnitDiscPositions = (segmentCount: number): Cartesian3[] => {
  const segments = Math.max(8, segmentCount);
  const positions: Cartesian3[] = [];

  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    positions.push(new Cartesian3(Math.cos(angle), Math.sin(angle), 0));
  }

  return positions;
};

export const createDiscModelMatrix = (
  origin: Cartesian3,
  radius: number
): Matrix4 => {
  const safeRadius = Math.max(radius, MIN_RADIUS);
  const matrix = Matrix4.clone(Matrix4.IDENTITY, new Matrix4());
  Matrix4.setColumn(matrix, 0, new Cartesian4(safeRadius, 0, 0, 0), matrix);
  Matrix4.setColumn(matrix, 1, new Cartesian4(0, safeRadius, 0, 0), matrix);
  Matrix4.setColumn(matrix, 2, new Cartesian4(0, 0, 1, 0), matrix);
  Matrix4.setColumn(
    matrix,
    3,
    new Cartesian4(origin.x, origin.y, origin.z, 1),
    matrix
  );
  return matrix;
};

export const createDisc = (id: string, options: DiscOptions): Primitive => {
  const {
    radius,
    color = DEFAULT_COLOR,
    unitCircleSegments = DEFAULT_UNIT_CIRCLE_SEGMENTS,
    modelMatrix = createDiscModelMatrix(Cartesian3.ZERO, radius),
  } = options;

  const geometry = CoplanarPolygonGeometry.fromPositions({
    positions: createUnitDiscPositions(unitCircleSegments),
    vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
  });

  return new Primitive({
    geometryInstances: new GeometryInstance({
      id: `${id}-fill`,
      geometry,
      attributes: {
        color: ColorGeometryInstanceAttribute.fromColor(color),
      },
    }),
    appearance: new PerInstanceColorAppearance({
      translucent: color.alpha < 1,
      closed: false,
    }),
    allowPicking: false,
    asynchronous: true,
    releaseGeometryInstances: true,
    show: true,
    modelMatrix,
  });
};
