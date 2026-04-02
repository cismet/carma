import { clamp, TWO_PI } from "@carma-commons/math";

import { createPlanarScaleRotationTranslationMatrix } from "../Transforms";
import {
  Cartesian3,
  Color,
  CoplanarPolygonGeometry,
  GeometryInstance,
  Matrix4,
  PolygonHierarchy,
  Primitive,
} from "@carma-cesium";
import {
  Appearance,
  VertexFormat,
} from "cesium";

export const RING_MATERIAL_PRESETS = {
  COLOR: "color",
  CHROME_MIRROR: "chrome-mirror",
  FROSTED_GLASS: "frosted-glass",
} as const;

export type RingMaterialPreset =
  (typeof RING_MATERIAL_PRESETS)[keyof typeof RING_MATERIAL_PRESETS];

export type RingSegmentOptions = {
  radius: number;
  innerRadius?: number;
  angleRad?: number;
  rotationRad?: number;
  color?: Color;
  opacity?: number;
  materialPreset?: RingMaterialPreset;
  segments?: number;
  modelMatrix?: Matrix4;
};

export type RingOptions = Omit<RingSegmentOptions, "angleRad" | "rotationRad">;

export type DiscOptions = Omit<RingOptions, "innerRadius">;

export type UnitRingSegmentGeometryOptions = {
  innerRadiusRatio?: number;
  angleRad?: number;
  segments?: number;
  vertexFormat?: VertexFormat;
};

type ResolvedRingSegmentOptions = {
  normalizedInnerRadius: number;
  arcSampling: ArcSampling;
  color: Color;
  opacity: number;
  materialPreset: RingMaterialPreset;
  vertexFormat: VertexFormat;
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
const DEFAULT_OPACITY = DEFAULT_COLOR.alpha;
const MIN_RADIUS = 1e-6;
const MIN_INNER_RADIUS_GAP = 1e-3;
const FULL_CIRCLE_ARC_EPSILON_RAD = 1e-8;
const SEGMENT_COUNT_EPSILON = 1e-9;
const SOLID_COLOR_VERTEX_FORMAT = VertexFormat.POSITION_ONLY;
const TEXTURED_VERTEX_FORMAT = VertexFormat.POSITION_AND_ST;
const DEFAULT_DISC_RENDER_STATE = (
  Appearance as unknown as {
    getDefaultRenderState: (
      translucent: boolean,
      closed: boolean,
      existing?: unknown
    ) => unknown;
  }
).getDefaultRenderState(true, false);

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

const toSafeOpacity = (opacity: number | undefined, fallback: number) =>
  clamp(
    typeof opacity === "number" && Number.isFinite(opacity) ? opacity : fallback,
    0,
    1
  );

const toSafeMaterialPreset = (
  materialPreset?: RingMaterialPreset
): RingMaterialPreset =>
  materialPreset === RING_MATERIAL_PRESETS.CHROME_MIRROR ||
  materialPreset === RING_MATERIAL_PRESETS.FROSTED_GLASS
    ? materialPreset
    : RING_MATERIAL_PRESETS.COLOR;

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

export const createUnitRingSegmentGeometry = ({
  innerRadiusRatio = 0,
  angleRad = TWO_PI,
  segments = DEFAULT_SEGMENTS,
  vertexFormat = SOLID_COLOR_VERTEX_FORMAT,
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
        vertexFormat,
      });
    }

    return CoplanarPolygonGeometry.fromPositions({
      positions: createArcPositions(arcSampling),
      vertexFormat,
    });
  }

  return CoplanarPolygonGeometry.fromPositions({
    positions: createRingSegmentBoundary({
      sampling: arcSampling,
      normalizedInnerRadius,
    }),
    vertexFormat,
  });
};

const DISC_APPEARANCE_VERTEX_SHADER_SOURCE = `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec2 st;
in float batchId;

out vec2 v_st;
out vec3 v_positionEC;

void main()
{
    vec4 p = czm_computePosition();
    v_st = st;
    v_positionEC = (czm_modelViewRelativeToEye * p).xyz;
    gl_Position = czm_modelViewProjectionRelativeToEye * p;
}`;

const SOLID_COLOR_APPEARANCE_VERTEX_SHADER_SOURCE = `
in vec3 position3DHigh;
in vec3 position3DLow;
in float batchId;

void main()
{
    vec4 p = czm_computePosition();
    gl_Position = czm_modelViewProjectionRelativeToEye * p;
}`;

const toShaderNumberLiteral = (value: number) =>
  Number.isFinite(value) ? value.toFixed(6) : "0.0";

const toColorLiteral = (color: Color) =>
  `vec4(${toShaderNumberLiteral(color.red)}, ${toShaderNumberLiteral(
    color.green
  )}, ${toShaderNumberLiteral(color.blue)}, ${toShaderNumberLiteral(
    color.alpha
  )})`;

const createChromeMirrorFragmentShaderSource = (color: Color) => `
in vec2 v_st;
in vec3 v_positionEC;

void main()
{
    vec4 color = ${toColorLiteral(color)};
    vec2 centered = v_st * 2.0 - 1.0;
    float radial = clamp(1.0 - length(centered), 0.0, 1.0);
    vec3 pseudoNormal = normalize(vec3(centered.xy * 0.72, max(0.28, radial)));
    vec3 viewDir = normalize(-v_positionEC);
    float facing = clamp(abs(dot(pseudoNormal, viewDir)), 0.0, 1.0);
    float fresnel = pow(1.0 - facing, 3.6);
    float banding = 0.5 + 0.5 * sin(v_st.y * 30.0 + v_st.x * 10.0);
    float sweep = 0.5 + 0.5 * cos((v_st.x - v_st.y) * 18.0);
    float highlight = clamp(0.22 + banding * 0.36 + sweep * 0.22 + fresnel * 0.35, 0.0, 1.0);
    vec3 chrome = mix(color.rgb * 0.24, vec3(1.0), highlight);
    vec3 glow = chrome * (0.12 + fresnel * 0.20 + radial * 0.05);
    out_FragColor = vec4(chrome + glow, color.a);
}`;

const createFrostedGlassFragmentShaderSource = (color: Color) => `
in vec2 v_st;
in vec3 v_positionEC;

float hash(vec2 p)
{
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main()
{
    vec4 color = ${toColorLiteral(color)};
    vec2 centered = v_st * 2.0 - 1.0;
    float radial = clamp(1.0 - length(centered), 0.0, 1.0);
    vec3 pseudoNormal = normalize(vec3(centered.xy * 0.55, max(0.2, radial)));
    vec3 viewDir = normalize(-v_positionEC);
    float facing = clamp(abs(dot(pseudoNormal, viewDir)), 0.0, 1.0);
    float rim = pow(1.0 - facing, 2.4);
    float grain = hash(floor(v_st * 52.0)) * 0.08;
    float haze = 0.30 + radial * 0.12 + rim * 0.18 + grain;
    vec3 frosted = mix(color.rgb, vec3(1.0), clamp(haze, 0.0, 0.72));
    vec3 glow = frosted * (0.08 + rim * 0.10);
    float alpha = color.a * clamp(0.42 + radial * 0.24 + rim * 0.12, 0.0, 1.0);
    out_FragColor = vec4(frosted + glow, alpha);
}`;

const createDiscShaderAppearance = (
  materialPreset: RingMaterialPreset,
  color: Color
) =>
  new Appearance({
    translucent: true,
    closed: false,
    renderState: DEFAULT_DISC_RENDER_STATE,
    vertexShaderSource: DISC_APPEARANCE_VERTEX_SHADER_SOURCE,
    fragmentShaderSource:
      materialPreset === RING_MATERIAL_PRESETS.CHROME_MIRROR
        ? createChromeMirrorFragmentShaderSource(color)
        : createFrostedGlassFragmentShaderSource(color),
  });

const createSolidColorFragmentShaderSource = (color: Color) => `
void main()
{
    out_FragColor = ${toColorLiteral(color)};
}`;

const createSolidColorAppearance = (color: Color) =>
  new Appearance({
    translucent: color.alpha < 1,
    closed: false,
    renderState: DEFAULT_DISC_RENDER_STATE,
    vertexShaderSource: SOLID_COLOR_APPEARANCE_VERTEX_SHADER_SOURCE,
    fragmentShaderSource: createSolidColorFragmentShaderSource(color),
  });

const createPrimitiveFill = ({
  id,
  geometry,
  color,
  opacity,
  materialPreset,
  modelMatrix,
}: {
  id: string;
  geometry: CoplanarPolygonGeometry;
  color: Color;
  opacity: number;
  materialPreset: RingMaterialPreset;
  modelMatrix: Matrix4;
}) => {
  const materialColor = Color.fromAlpha(color, opacity, new Color());

  if (materialPreset === RING_MATERIAL_PRESETS.COLOR) {
    return new Primitive({
      geometryInstances: new GeometryInstance({
        id: `${id}-fill`,
        geometry,
      }),
      appearance: createSolidColorAppearance(materialColor),
      allowPicking: false,
      asynchronous: true,
      releaseGeometryInstances: true,
      show: true,
      modelMatrix,
    });
  }

  return new Primitive({
    geometryInstances: new GeometryInstance({
      id: `${id}-fill`,
      geometry,
    }),
    appearance: createDiscShaderAppearance(materialPreset, materialColor),
    allowPicking: false,
    asynchronous: true,
    releaseGeometryInstances: true,
    show: true,
    modelMatrix,
  });
};

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
  const materialPreset = toSafeMaterialPreset(options.materialPreset);
  const color = options.color ?? DEFAULT_COLOR;
  const opacity = toSafeOpacity(options.opacity, color.alpha ?? DEFAULT_OPACITY);
  const scaleAndRotation = createRingSegmentModelMatrix(
    Cartesian3.ZERO,
    safeRadius,
    rotationRad
  );

  return {
    normalizedInnerRadius: toNormalizedInnerRadius(safeInnerRadius, safeRadius),
    arcSampling,
    color,
    opacity,
    materialPreset,
    vertexFormat:
      materialPreset === RING_MATERIAL_PRESETS.COLOR
        ? SOLID_COLOR_VERTEX_FORMAT
        : TEXTURED_VERTEX_FORMAT,
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
    vertexFormat: resolvedOptions.vertexFormat,
  });

  return createPrimitiveFill({
    id,
    geometry,
    color: resolvedOptions.color,
    opacity: resolvedOptions.opacity,
    materialPreset: resolvedOptions.materialPreset,
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
