import { clamp, TWO_PI } from "@carma-commons/math";

import { createPlanarScaleRotationTranslationMatrix } from "../Transforms";
import {
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  CoplanarPolygonGeometry,
  GeometryInstance,
  Matrix4,
  PerInstanceColorAppearance,
  PolygonHierarchy,
  Primitive,
} from "@carma-cesium";
export type RingSegmentOptions = {
  radius: number;
  innerRadius?: number;
  angleRad?: number;
  rotationRad?: number;
  color?: Color;
  segments?: number;
  modelMatrix?: Matrix4;
};

export type RingOptions = Omit<RingSegmentOptions, "angleRad" | "rotationRad">;

export type DiscOptions = Omit<RingOptions, "innerRadius">;

export type UnitRingSegmentGeometryOptions = {
  innerRadiusRatio?: number;
  angleRad?: number;
  segments?: number;
};

type ResolvedRingSegmentOptions = {
  normalizedInnerRadius: number;
  arcSampling: ArcSampling;
  color: Color;
  modelMatrix: Matrix4;
};

type ArcSampling = {
  segments: number;
  pointCount: number;
  isFullCircle: boolean;
  stepRad: number;
};

const DEFAULT_SEGMENTS = 24;
const DEFAULT_COLOR = Color.WHITE.withAlpha(0.65);
const MIN_RADIUS = 1e-6;
const MIN_INNER_RADIUS_GAP = 1e-3;
const FULL_CIRCLE_ARC_EPSILON_RAD = 1e-8;
const SEGMENT_COUNT_EPSILON = 1e-9;
const VERTEX_FORMAT = PerInstanceColorAppearance.VERTEX_FORMAT;

const toSafeRadius = (radius: number) =>
  Math.max(Number.isFinite(radius) ? radius : 0, MIN_RADIUS);

const toSafeInnerRadius = (innerRadius: number | undefined, radius: number) => {
  const maxInnerRadius = Math.max(0, radius - MIN_INNER_RADIUS_GAP);
  return clamp(
    typeof innerRadius === "number" && Number.isFinite(innerRadius)
      ? innerRadius
      : 0,
    0,
    maxInnerRadius
  );
};

const toNormalizedInnerRadius = (innerRadius: number, radius: number) =>
  clamp(innerRadius / radius, 0, 1 - MIN_INNER_RADIUS_GAP);

const toSafeAngleRad = (angleRad?: number) => {
  const resolvedAngleRad =
    typeof angleRad === "number" && Number.isFinite(angleRad)
      ? angleRad
      : TWO_PI;
  return clamp(resolvedAngleRad, 0, TWO_PI);
};

const toSafeSegments = (segments?: number) =>
  Math.max(
    8,
    Math.floor(
      typeof segments === "number" && Number.isFinite(segments)
        ? segments
        : DEFAULT_SEGMENTS
    )
  );

const toSafeRotationRad = (rotationRad?: number) =>
  typeof rotationRad === "number" && Number.isFinite(rotationRad)
    ? rotationRad
    : 0;

const isNearlyFullCircle = (angleSpanRad: number, epsilonRad: number) =>
  Math.abs(angleSpanRad - TWO_PI) <= epsilonRad;

const toArcSubdivisionCount = (segments: number, angleRad: number) => {
  const safeSegments = Math.max(1, segments);
  if (angleRad <= SEGMENT_COUNT_EPSILON) {
    return 1;
  }
  if (isNearlyFullCircle(angleRad, FULL_CIRCLE_ARC_EPSILON_RAD)) {
    return safeSegments;
  }

  const rawSubdivisionCount = (angleRad / TWO_PI) * safeSegments;
  const nearestInteger = Math.round(rawSubdivisionCount);
  if (Math.abs(rawSubdivisionCount - nearestInteger) <= SEGMENT_COUNT_EPSILON) {
    return Math.max(1, nearestInteger);
  }

  return Math.max(1, Math.ceil(rawSubdivisionCount));
};

const resolveArcSampling = (
  segments: number,
  angleRad: number
): ArcSampling => {
  const safeSegments = Math.max(1, segments);
  const clampedAngle = clamp(angleRad, 0, TWO_PI);
  const subdivisions = toArcSubdivisionCount(safeSegments, clampedAngle);
  const isFullCircle = subdivisions >= safeSegments;

  return {
    segments: safeSegments,
    pointCount: isFullCircle ? subdivisions : subdivisions + 1,
    isFullCircle,
    stepRad: TWO_PI / safeSegments,
  };
};

const createArcPositions = (
  sampling: ArcSampling,
  radius = 1
): Cartesian3[] => {
  const clampedRadius = Math.max(radius, 0);

  return Array.from({ length: sampling.pointCount }, (_, index) => {
    const angle = sampling.stepRad * index;
    return new Cartesian3(
      Math.cos(angle) * clampedRadius,
      Math.sin(angle) * clampedRadius,
      0
    );
  });
};

const createFullCircleRingHierarchy = (
  sampling: ArcSampling,
  normalizedInnerRadius: number
) => {
  const outerPositions = createArcPositions(sampling);
  const innerHolePositions = createArcPositions(
    sampling,
    normalizedInnerRadius
  ).reverse();

  return new PolygonHierarchy(outerPositions, [
    new PolygonHierarchy(innerHolePositions),
  ]);
};

const createRingSegmentBoundary = ({
  sampling,
  normalizedInnerRadius,
}: {
  sampling: ArcSampling;
  normalizedInnerRadius: number;
}) => {
  const outerArc = createArcPositions(sampling);

  if (normalizedInnerRadius <= 0) {
    return [Cartesian3.ZERO, ...outerArc];
  }

  const innerArc = createArcPositions(
    sampling,
    normalizedInnerRadius
  ).reverse();

  return [...outerArc, ...innerArc];
};

const createGeometryFromBoundary = (positions: Cartesian3[]) =>
  CoplanarPolygonGeometry.fromPositions({
    positions,
    vertexFormat: VERTEX_FORMAT,
  });

export const createUnitRingSegmentGeometry = ({
  innerRadiusRatio = 0,
  angleRad = TWO_PI,
  segments = DEFAULT_SEGMENTS,
}: UnitRingSegmentGeometryOptions): CoplanarPolygonGeometry => {
  const safeSegments = toSafeSegments(segments);
  const safeAngleRad = toSafeAngleRad(angleRad);
  const normalizedInnerRadius = clamp(
    Number.isFinite(innerRadiusRatio) ? innerRadiusRatio : 0,
    0,
    1 - MIN_INNER_RADIUS_GAP
  );
  const arcSampling = resolveArcSampling(safeSegments, safeAngleRad);

  if (arcSampling.isFullCircle) {
    if (normalizedInnerRadius > 0) {
      return new CoplanarPolygonGeometry({
        polygonHierarchy: createFullCircleRingHierarchy(
          arcSampling,
          normalizedInnerRadius
        ),
        vertexFormat: VERTEX_FORMAT,
      });
    }

    return createGeometryFromBoundary(createArcPositions(arcSampling));
  }

  return createGeometryFromBoundary(
    createRingSegmentBoundary({
      sampling: arcSampling,
      normalizedInnerRadius,
    })
  );
};

const createPrimitiveFill = ({
  id,
  geometry,
  color,
  modelMatrix,
}: {
  id: string;
  geometry: CoplanarPolygonGeometry;
  color: Color;
  modelMatrix: Matrix4;
}) =>
  new Primitive({
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

const resolveRingSegmentOptions = (
  options: RingSegmentOptions
): ResolvedRingSegmentOptions => {
  const safeRadius = toSafeRadius(options.radius);
  const safeInnerRadius = toSafeInnerRadius(options.innerRadius, safeRadius);
  const safeSegments = toSafeSegments(options.segments);
  const angleRad = toSafeAngleRad(options.angleRad);
  const arcSampling = resolveArcSampling(safeSegments, angleRad);
  const rotationRad = toSafeRotationRad(options.rotationRad);
  const baseModelMatrix = options.modelMatrix ?? Matrix4.IDENTITY;
  const scaleAndRotation = createRingSegmentModelMatrix(
    Cartesian3.ZERO,
    safeRadius,
    rotationRad
  );

  return {
    normalizedInnerRadius: toNormalizedInnerRadius(safeInnerRadius, safeRadius),
    arcSampling,
    color: options.color ?? DEFAULT_COLOR,
    modelMatrix: Matrix4.multiply(
      baseModelMatrix,
      scaleAndRotation,
      new Matrix4()
    ),
  };
};

const createRingSegmentModelMatrix = (
  origin: Cartesian3,
  radius = 1,
  rotationRad = 0
): Matrix4 =>
  createPlanarScaleRotationTranslationMatrix(
    origin,
    radius,
    rotationRad,
    MIN_RADIUS
  );

export const createRingSegment = (
  id: string,
  options: RingSegmentOptions
): Primitive => {
  const resolvedOptions = resolveRingSegmentOptions(options);
  const geometry = createUnitRingSegmentGeometry({
    innerRadiusRatio: resolvedOptions.normalizedInnerRadius,
    angleRad: options.angleRad,
    segments: resolvedOptions.arcSampling.segments,
  });

  return createPrimitiveFill({
    id,
    geometry,
    color: resolvedOptions.color,
    modelMatrix: resolvedOptions.modelMatrix,
  });
};

export const createRing = (id: string, options: RingOptions): Primitive =>
  createRingSegment(id, {
    ...options,
    angleRad: TWO_PI,
    rotationRad: 0,
  });

export const createDisc = (id: string, options: DiscOptions): Primitive =>
  createRing(id, {
    ...options,
    innerRadius: 0,
  });
