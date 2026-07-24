import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";

import type { CopcNodeDescriptor, CopcPointChunk } from "./copcLoader";
import {
  POINT_CLOUD_FRUSTUM_OVERSCAN,
  selectCopcNodesForFrustum,
} from "./pointCloudFrustum";
import { mapEnuOffsetToScene } from "./pointcloud-spatial-registration";
import type {
  PointcloudSceneFrame,
  PointcloudSceneRuntime,
} from "./pointcloudSceneLayer";

// ─────────────────────────────────────────────────────────────
//  Three.js point-cloud runtime attached to pointcloudSceneLayer.
//  It uses scene-local meters around an origin lng/lat,
//  x east / y up / z south.
//
//  Point sizing runs in a custom shader with three modes: fixed
//  pixels, projective radius in meters, or auto (projective from
//  the per-node COPC spacing — the local point distance). Screen
//  size derives per vertex via finite differences of 1 m offsets.
//  Baked scalar fields such as AO use the same color-slot path as every
//  other COPC field; this runtime performs no derived-field computation.
// ─────────────────────────────────────────────────────────────

export const POINT_SIZE_MODES = {
  PIXELS: "pixels",
  METERS: "meters",
  /** Projective size from the per-node COPC point spacing */
  AUTO: "auto",
} as const;
export type PointSizeMode =
  (typeof POINT_SIZE_MODES)[keyof typeof POINT_SIZE_MODES];

export const POINT_SHAPES = {
  SQUARE: "square",
  CIRCLE: "circle",
  /** Camera-facing spherical impostor with CloudCompare-like relief. */
  DOME: "dome",
  /** Soft radial sprite; a lightweight visual approximation, not 3DGS. */
  SOFT_SPLAT: "soft-splat",
} as const;
export type PointShape = (typeof POINT_SHAPES)[keyof typeof POINT_SHAPES];

export type PointCompositeMode = "normal" | "multiply" | "screen";

export interface PointClipSegment {
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
}

export interface PointClipCorridor {
  segments: PointClipSegment[];
  halfWidth: number;
}

/** Engine-side color slot: 0 = off/white, 1 = RGB attribute,
 *  2 = classification LUT, 3 = scalar ramp, 4 = qualitative field LUT,
 *  5 = static solid color. */
export interface LayerColorSlot {
  mode: 0 | 1 | 2 | 3 | 4 | 5;
  rampTexture?: THREE.Texture;
  categoryLut?: Uint8Array;
  range?: [number, number];
  clipRangeMin?: boolean;
  clipRangeMax?: boolean;
  gamma?: number;
  solidColor?: string;
}

/** 0 = normal, 1 = multiply, 2 = screen, 3 = overlay */
export type LayerBlendMode = 0 | 1 | 2 | 3;

export interface CopcPointsLayer extends PointcloudSceneRuntime {
  /** Append a decoded chunk as a THREE.Points object */
  addChunk: (chunk: CopcPointChunk) => void;
  /** Dispose one GPU-resident COPC node without dropping its caller cache. */
  removeChunk: (nodeKey: string) => void;
  hasChunk: (nodeKey: string) => boolean;
  /** Drive on-demand node loading from the exact MapLibre clip matrix. */
  setFrustumNodeSource: (
    nodes: readonly CopcNodeDescriptor[],
    onSelection: (
      nodeKeys: readonly string[],
      stats: { visibleNodeCount: number; selectedPointCount: number }
    ) => void
  ) => void;
  /** Fixed point size in pixels (mode "pixels") */
  setPointSize: (sizePx: number) => void;
  /** Point radius in meters (mode "meters") */
  setRadiusMeters: (radius: number) => void;
  setSizeMode: (mode: PointSizeMode) => void;
  /** Multiplier on the per-node spacing (mode "auto") */
  setRadiusScale: (scale: number) => void;
  setShape: (shape: PointShape) => void;
  /** Configure the three-layer color stack (base + two blends) */
  setColorization: (
    a: LayerColorSlot,
    b: LayerColorSlot,
    c: LayerColorSlot,
    blendB: { mode: LayerBlendMode; opacity: number },
    blendC: { mode: LayerBlendMode; opacity: number }
  ) => void;
  /** Upload scalar field values for a slot per chunk */
  setChunkField: (
    slot: "a" | "b" | "c",
    chunkIndex: number,
    values: Float32Array | null
  ) => void;
  /** Vertical offset in meters added to the (zBase-relative) cloud */
  setHeightOffset: (offsetMeters: number) => void;
  /** Local display correction in the geographic East/North/Up frame. */
  setPositionOffset: (
    eastMeters: number,
    northMeters: number,
    upMeters: number
  ) => void;
  /** Apply a rigid ENU rotation around the cloud anchor. */
  setRotationOffset: (
    eastDegrees: number,
    northDegrees: number,
    upDegrees: number
  ) => void;
  /** Maximum number of loaded points submitted to the renderer. */
  setPointBudget: (pointBudget: number) => void;
  setMinimumSpacingPixels: (pixels: number) => void;
  setNodeBoundsVisible: (visible: boolean) => void;
  readonly pointCount: number;
}

/** Map-engine-independent point-cloud renderer used by both the MapLibre
 * custom layer and the standalone Three.js investigation stories. */
export interface CopcPointCloudVisualizer {
  readonly group: THREE.Group;
  readonly pointCount: number;
  addChunk: (chunk: CopcPointChunk) => void;
  removeChunk: (nodeKey: string) => void;
  hasChunk: (nodeKey: string) => boolean;
  setPointSize: (sizePx: number) => void;
  setRadiusMeters: (radius: number) => void;
  setSizeMode: (mode: PointSizeMode) => void;
  setRadiusScale: (scale: number) => void;
  setShape: (shape: PointShape) => void;
  setColorization: CopcPointsLayer["setColorization"];
  setChunkField: CopcPointsLayer["setChunkField"];
  /** Configure scene depth testing; composite mode owns depth writing. */
  setDepthTest: (enabled: boolean) => void;
  /** Composite overlapping point splats in framebuffer space. */
  setCompositeMode: (mode: PointCompositeMode) => void;
  /** Clip point fragments to a scene-local centerline corridor. */
  setClipCorridor: (corridor: PointClipCorridor | null) => void;
  setHeightOffset: (offsetMeters: number) => void;
  setPositionOffset: CopcPointsLayer["setPositionOffset"];
  setRotationOffset: CopcPointsLayer["setRotationOffset"];
  setPointBudget: CopcPointsLayer["setPointBudget"];
  /** Fades the whole cloud uniformly (1 = opaque); keeps colorization intact. */
  setGlobalOpacity: (opacity: number) => void;
  setViewport: (width: number, height: number) => void;
  dispose: () => void;
}

const VERTEX_SHADER = /* glsl */ `
  uniform float uMode;      // 0 = px fixed, 1 = meters, 2 = auto (spacing)
  uniform float uSizePx;
  uniform float uRadiusM;
  uniform float uRadiusScale; // spacing multiplier in auto mode
  uniform vec2 uViewport;   // drawing buffer size in device pixels
  uniform float uHasRgb;

  attribute float spacing;  // local point spacing (meters, per node)
  attribute float fieldA;   // scalar field value for color slot A
  attribute float fieldB;   // scalar field value for color slot B
  attribute float fieldC;   // scalar field value for color slot C
  attribute float classification;

  varying vec3 vColor;
  varying float vFieldA;
  varying float vFieldB;
  varying float vFieldC;
  varying float vClassification;
  varying vec2 vLocalXZ;

  void main() {
    vColor = uHasRgb > 0.5 ? color : vec3(1.0);
    vFieldA = fieldA;
    vFieldB = fieldB;
    vFieldC = fieldC;
    vClassification = classification;
    vLocalXZ = position.xz;
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = clip;

    float sizePx = uSizePx;
    if (uMode > 0.5 && clip.w > 0.0) {
      // Screen-space length of 1 m offsets (up + east); max() keeps the
      // estimate stable for both top-down and tilted views.
      vec4 clipUp = projectionMatrix * modelViewMatrix
        * vec4(position + vec3(0.0, 1.0, 0.0), 1.0);
      vec4 clipEast = projectionMatrix * modelViewMatrix
        * vec4(position + vec3(1.0, 0.0, 0.0), 1.0);
      vec2 s0 = clip.xy / clip.w;
      vec2 sUp = clipUp.xy / clipUp.w;
      vec2 sEast = clipEast.xy / clipEast.w;
      float pxPerMeter = 0.5 * max(
        length((sUp - s0) * uViewport),
        length((sEast - s0) * uViewport)
      );
      // auto: world diameter = spacing × scale closes the gaps
      // between neighboring points of the loaded octree level
      float worldDiameter = uMode > 1.5
        ? spacing * uRadiusScale
        : uRadiusM * 2.0;
      sizePx = worldDiameter * pxPerMeter;
    }
    gl_PointSize = clamp(sizePx, 0.5, 128.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uShape;      // 0 square, 1 circle, 2 shaded dome, 3 soft splat

  // Color slots: 0 off, 1 RGB, 2 classification, 3 scalar, 4 qualitative, 5 solid
  uniform float uSlotAMode;
  uniform float uSlotBMode;
  uniform float uSlotCMode;
  uniform sampler2D uRampA;
  uniform sampler2D uRampB;
  uniform sampler2D uRampC;
  uniform sampler2D uCategoryRampA;
  uniform sampler2D uCategoryRampB;
  uniform sampler2D uCategoryRampC;
  uniform vec2 uRangeA;
  uniform vec2 uRangeB;
  uniform vec2 uRangeC;
  uniform float uGammaA;
  uniform float uGammaB;
  uniform float uGammaC;
  uniform vec3 uSolidColorA;
  uniform vec3 uSolidColorB;
  uniform vec3 uSolidColorC;
  uniform bool uClipMinA;
  uniform bool uClipMaxA;
  uniform bool uClipMinB;
  uniform bool uClipMaxB;
  uniform bool uClipMinC;
  uniform bool uClipMaxC;
  uniform float uBlendBMode;   // 0 normal, 1 multiply, 2 screen, 3 overlay
  uniform float uBlendBOpacity;
  uniform float uBlendCMode;
  uniform float uBlendCOpacity;
  uniform float uGlobalOpacity;
  uniform int uClipSegmentCount;
  uniform vec4 uClipSegments[64];
  uniform float uClipHalfWidth;

  varying vec3 vColor;
  varying float vFieldA;
  varying float vFieldB;
  varying float vFieldC;
  varying float vClassification;
  varying vec2 vLocalXZ;

  vec4 slotColor(
    float mode, vec3 rgb, float value, vec3 solidColor,
    sampler2D ramp, sampler2D categoryRamp, vec2 range, float gamma,
    bool clipMin, bool clipMax
  ) {
    if (mode < 0.5) return vec4(1.0);
    if (mode < 1.5) return vec4(rgb, 1.0);
    if (mode > 4.5) return vec4(solidColor, 1.0);
    if (mode < 2.5) {
      float category = clamp(floor(vClassification + 0.5), 0.0, 255.0);
      return texture2D(categoryRamp, vec2((category + 0.5) / 256.0, 0.5));
    }
    if (mode > 3.5) {
      float category = clamp(floor(value + 0.5), 0.0, 255.0);
      return texture2D(categoryRamp, vec2((category + 0.5) / 256.0, 0.5));
    }
    if ((clipMin && value < range.x) || (clipMax && value > range.y)) return vec4(0.0);
    float t = clamp((value - range.x) / max(range.y - range.x, 1e-9), 0.0, 1.0);
    t = pow(t, gamma);
    return texture2D(ramp, vec2(t, 0.5));
  }

  vec3 blend(vec3 base, vec3 top, float mode) {
    if (mode < 0.5) return top;                                  // normal
    if (mode < 1.5) return base * top;                           // multiply
    if (mode < 2.5) return 1.0 - (1.0 - base) * (1.0 - top);     // screen
    vec3 low = 2.0 * base * top;                                 // overlay
    vec3 high = 1.0 - 2.0 * (1.0 - base) * (1.0 - top);
    return mix(low, high, step(0.5, base));
  }

  float pointSegmentDistanceSquared(vec2 point, vec4 segment) {
    vec2 start = segment.xy;
    vec2 delta = segment.zw - start;
    float lengthSquared = max(dot(delta, delta), 1e-9);
    float along = clamp(dot(point - start, delta) / lengthSquared, 0.0, 1.0);
    vec2 nearest = start + along * delta;
    vec2 distanceVector = point - nearest;
    return dot(distanceVector, distanceVector);
  }

  void main() {
    if (uClipSegmentCount > 0) {
      bool insideCorridor = false;
      float maxDistanceSquared = uClipHalfWidth * uClipHalfWidth;
      for (int index = 0; index < 64; index++) {
        if (index >= uClipSegmentCount) break;
        if (pointSegmentDistanceSquared(vLocalXZ, uClipSegments[index]) <= maxDistanceSquared) {
          insideCorridor = true;
          break;
        }
      }
      if (!insideCorridor) discard;
    }
    vec2 pointCoord = gl_PointCoord * 2.0 - vec2(1.0);
    float pointRadiusSquared = dot(pointCoord, pointCoord);
    if (uShape > 0.5 && pointRadiusSquared > 1.0) discard;
    float shapeCoverage = 1.0;
    if (uShape > 2.5) {
      // Keep the previous fake-splat falloff, but express it as real alpha so
      // adjacent splats blend without screen-door noise or ownership borders.
      float radialCoverage = max(0.0, 1.0 - pointRadiusSquared);
      shapeCoverage = radialCoverage * radialCoverage;
      if (shapeCoverage <= 0.001) discard;
    }
    vec4 baseColor = slotColor(
      uSlotAMode, vColor, vFieldA,
      uSolidColorA, uRampA, uCategoryRampA, uRangeA, uGammaA, uClipMinA, uClipMaxA);
    if (baseColor.a <= 0.001) discard;
    vec3 result = baseColor.rgb;
    if (uSlotBMode > 0.5) {
      vec4 colorB = slotColor(
        uSlotBMode, vColor, vFieldB,
        uSolidColorB, uRampB, uCategoryRampB, uRangeB, uGammaB, uClipMinB, uClipMaxB);
      result = mix(
        result,
        blend(result, colorB.rgb, uBlendBMode),
        uBlendBOpacity * colorB.a
      );
    }
    if (uSlotCMode > 0.5) {
      vec4 colorC = slotColor(
        uSlotCMode, vColor, vFieldC,
        uSolidColorC, uRampC, uCategoryRampC, uRangeC, uGammaC, uClipMinC, uClipMaxC);
      result = mix(
        result,
        blend(result, colorC.rgb, uBlendCMode),
        uBlendCOpacity * colorC.a
      );
    }
    if (uShape > 1.5 && uShape < 2.5) {
      float domeHeight = sqrt(max(0.0, 1.0 - pointRadiusSquared));
      vec3 domeNormal = normalize(vec3(pointCoord.x, -pointCoord.y, domeHeight));
      vec3 keyLight = normalize(vec3(-0.35, 0.45, 1.0));
      float diffuse = max(dot(domeNormal, keyLight), 0.0);
      float specular = pow(max(dot(domeNormal, vec3(0.0, 0.0, 1.0)), 0.0), 24.0);
      result = result * mix(0.48, 1.08, diffuse) + vec3(0.12 * specular);
    }
    float fragmentAlpha = baseColor.a * shapeCoverage * uGlobalOpacity;
    vec3 fragmentColor = result;
    if (uShape > 2.5) {
      // Premultiply transparent splat edges before they enter MapLibre's
      // shared framebuffer. This keeps the falloff purely transparent instead
      // of leaking dark RGB into later canvas compositing.
      fragmentColor *= fragmentAlpha;
    }
    gl_FragColor = vec4(fragmentColor, fragmentAlpha);
  }
`;

export function createCopcPointCloudVisualizer(
  requestRender: () => void = () => undefined
): CopcPointCloudVisualizer {
  const group = new THREE.Group();
  const chunkPoints: THREE.Points[] = [];
  const createCategoryTexture = () => {
    const data = new Uint8Array(256 * 4);
    for (let index = 0; index < 256; index++) {
      data[index * 4] = 255;
      data[index * 4 + 1] = 255;
      data[index * 4 + 2] = 255;
      data[index * 4 + 3] = 255;
    }
    const texture = new THREE.DataTexture(data, 256, 1);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    return texture;
  };
  const categoryTextures = {
    A: createCategoryTexture(),
    B: createCategoryTexture(),
    C: createCategoryTexture(),
  };
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMode: { value: 0 },
      uSizePx: { value: 2 },
      uRadiusM: { value: 0.05 },
      uRadiusScale: { value: 1 },
      uShape: { value: 0 },
      uSlotAMode: { value: 1 },
      uSlotBMode: { value: 0 },
      uSlotCMode: { value: 0 },
      uRampA: { value: null },
      uRampB: { value: null },
      uRampC: { value: null },
      uCategoryRampA: { value: categoryTextures.A },
      uCategoryRampB: { value: categoryTextures.B },
      uCategoryRampC: { value: categoryTextures.C },
      uRangeA: { value: new THREE.Vector2(0, 1) },
      uRangeB: { value: new THREE.Vector2(0, 1) },
      uRangeC: { value: new THREE.Vector2(0, 1) },
      uGammaA: { value: 1 },
      uGammaB: { value: 1 },
      uGammaC: { value: 1 },
      uSolidColorA: { value: new THREE.Color("#ffffff") },
      uSolidColorB: { value: new THREE.Color("#ffffff") },
      uSolidColorC: { value: new THREE.Color("#ffffff") },
      uClipMinA: { value: false },
      uClipMaxA: { value: false },
      uClipMinB: { value: false },
      uClipMaxB: { value: false },
      uClipMinC: { value: false },
      uClipMaxC: { value: false },
      uBlendBMode: { value: 1 },
      uBlendBOpacity: { value: 1 },
      uBlendCMode: { value: 1 },
      uBlendCOpacity: { value: 1 },
      uGlobalOpacity: { value: 1 },
      uClipSegmentCount: { value: 0 },
      uClipSegments: {
        value: Array.from({ length: 64 }, () => new THREE.Vector4()),
      },
      uClipHalfWidth: { value: 0 },
      uViewport: { value: new THREE.Vector2(1, 1) },
      uHasRgb: { value: 0 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    vertexColors: true,
    depthTest: true,
  });
  let totalPoints = 0;
  let renderPointBudget = Number.POSITIVE_INFINITY;
  let pointShape: PointShape = POINT_SHAPES.SQUARE;
  let compositeMode: PointCompositeMode = "normal";
  let baseHasTransparency = false;
  let globalOpacity = 1;

  const syncMaterialBlending = () => {
    const softSplat = pointShape === POINT_SHAPES.SOFT_SPLAT;
    const faded = globalOpacity < 1;
    const transparent =
      softSplat || compositeMode !== "normal" || baseHasTransparency || faded;
    const premultipliedAlpha = softSplat || compositeMode === "multiply";
    const depthWrite =
      !softSplat && compositeMode === "normal" && !baseHasTransparency && !faded;
    const blending =
      compositeMode === "multiply"
        ? THREE.MultiplyBlending
        : compositeMode === "screen"
        ? THREE.CustomBlending
        : THREE.NormalBlending;
    const shaderStateChanged =
      material.transparent !== transparent ||
      material.premultipliedAlpha !== premultipliedAlpha;
    material.transparent = transparent;
    material.premultipliedAlpha = premultipliedAlpha;
    material.alphaToCoverage = false;
    material.depthWrite = depthWrite;
    material.blending = blending;
    if (compositeMode === "screen") {
      material.blendEquation = THREE.AddEquation;
      material.blendSrc = THREE.OneFactor;
      material.blendDst = THREE.OneMinusSrcColorFactor;
      material.blendEquationAlpha = THREE.AddEquation;
      material.blendSrcAlpha = THREE.OneFactor;
      material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    }
    if (shaderStateChanged) material.needsUpdate = true;
  };

  const syncPointBudget = () => {
    let remaining = renderPointBudget;
    for (const points of chunkPoints) {
      const count = points.geometry.getAttribute("position").count;
      const visibleCount = Math.max(0, Math.min(count, remaining));
      points.geometry.setDrawRange(0, visibleCount);
      points.visible = visibleCount > 0;
      remaining -= visibleCount;
    }
    requestRender();
  };

  return {
    group,
    get pointCount() {
      return totalPoints;
    },
    addChunk(chunk: CopcPointChunk) {
      if (
        chunk.nodeKey &&
        chunkPoints.some((points) => points.userData.nodeKey === chunk.nodeKey)
      ) {
        return;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(chunk.positions, 3)
      );
      if (chunk.colors) {
        material.uniforms.uHasRgb.value = 1;
        geometry.setAttribute(
          "color",
          new THREE.BufferAttribute(chunk.colors, 3, true)
        );
      }
      const spacing = new Float32Array(chunk.pointCount).fill(chunk.spacing);
      geometry.setAttribute("spacing", new THREE.BufferAttribute(spacing, 1));
      geometry.setAttribute(
        "fieldA",
        new THREE.BufferAttribute(new Float32Array(chunk.pointCount), 1)
      );
      geometry.setAttribute(
        "fieldB",
        new THREE.BufferAttribute(new Float32Array(chunk.pointCount), 1)
      );
      geometry.setAttribute(
        "fieldC",
        new THREE.BufferAttribute(new Float32Array(chunk.pointCount), 1)
      );
      geometry.setAttribute(
        "classification",
        new THREE.BufferAttribute(
          chunk.fieldValues["classification"] ??
            new Float32Array(chunk.pointCount),
          1
        )
      );
      const points = new THREE.Points(geometry, material);
      points.userData.nodeKey = chunk.nodeKey;
      geometry.computeBoundingSphere();
      // The MapLibre matrix already contains the local-model transform. Our
      // node scheduler culls against that exact matrix; disabling Three's
      // second camera/object cull avoids applying incompatible assumptions.
      points.frustumCulled = false;
      group.add(points);
      chunkPoints.push(points);
      totalPoints += chunk.pointCount;
      syncPointBudget();
    },
    removeChunk(nodeKey: string) {
      const index = chunkPoints.findIndex(
        (points) => points.userData.nodeKey === nodeKey
      );
      if (index < 0) return;
      const [points] = chunkPoints.splice(index, 1);
      totalPoints -= points.geometry.getAttribute("position").count;
      group.remove(points);
      points.geometry.dispose();
      syncPointBudget();
    },
    hasChunk(nodeKey: string) {
      return chunkPoints.some((points) => points.userData.nodeKey === nodeKey);
    },
    setPointSize(sizePx: number) {
      if (material.uniforms.uSizePx.value === sizePx) return;
      material.uniforms.uSizePx.value = sizePx;
      requestRender();
    },
    setRadiusMeters(radius: number) {
      if (material.uniforms.uRadiusM.value === radius) return;
      material.uniforms.uRadiusM.value = radius;
      requestRender();
    },
    setSizeMode(mode: PointSizeMode) {
      const value =
        mode === POINT_SIZE_MODES.AUTO
          ? 2
          : mode === POINT_SIZE_MODES.METERS
          ? 1
          : 0;
      if (material.uniforms.uMode.value === value) return;
      material.uniforms.uMode.value = value;
      requestRender();
    },
    setRadiusScale(scale: number) {
      if (material.uniforms.uRadiusScale.value === scale) return;
      material.uniforms.uRadiusScale.value = scale;
      requestRender();
    },
    setShape(shape: PointShape) {
      if (pointShape === shape) return;
      pointShape = shape;
      material.uniforms.uShape.value =
        shape === POINT_SHAPES.SOFT_SPLAT
          ? 3
          : shape === POINT_SHAPES.DOME
          ? 2
          : shape === POINT_SHAPES.CIRCLE
          ? 1
          : 0;
      syncMaterialBlending();
      requestRender();
    },
    setColorization(a, b, c, blendB, blendC) {
      const applySlot = (
        slot: LayerColorSlot,
        suffix: "A" | "B" | "C"
      ): void => {
        material.uniforms[`uSlot${suffix}Mode`].value = slot.mode;
        material.uniforms[`uRamp${suffix}`].value = slot.rampTexture ?? null;
        (material.uniforms[`uRange${suffix}`].value as THREE.Vector2).set(
          slot.range?.[0] ?? 0,
          slot.range?.[1] ?? 1
        );
        material.uniforms[`uGamma${suffix}`].value = slot.gamma ?? 1;
        (material.uniforms[`uSolidColor${suffix}`].value as THREE.Color).set(
          slot.solidColor ?? "#ffffff"
        );
        material.uniforms[`uClipMin${suffix}`].value = slot.clipRangeMin ?? false;
        material.uniforms[`uClipMax${suffix}`].value = slot.clipRangeMax ?? false;
        const categoryTexture = categoryTextures[suffix];
        if (slot.categoryLut) {
          (categoryTexture.image.data as Uint8Array).set(slot.categoryLut);
          categoryTexture.needsUpdate = true;
        }
      };
      applySlot(a, "A");
      applySlot(b, "B");
      applySlot(c, "C");
      material.uniforms.uBlendBMode.value = blendB.mode;
      material.uniforms.uBlendBOpacity.value = blendB.opacity;
      material.uniforms.uBlendCMode.value = blendC.mode;
      material.uniforms.uBlendCOpacity.value = blendC.opacity;
      baseHasTransparency = Boolean(
        (a.mode === 2 || a.mode === 4) &&
          a.categoryLut?.some((value, index) => index % 4 === 3 && value < 255)
      );
      syncMaterialBlending();
      requestRender();
    },
    setChunkField(slot, chunkIndex, values) {
      const points = chunkPoints[chunkIndex];
      if (!points) return;
      const attributeName =
        slot === "a" ? "fieldA" : slot === "b" ? "fieldB" : "fieldC";
      const attribute = points.geometry.getAttribute(
        attributeName
      ) as THREE.BufferAttribute;
      if (values) {
        (attribute.array as Float32Array).set(values);
      } else {
        (attribute.array as Float32Array).fill(0);
      }
      attribute.needsUpdate = true;
      requestRender();
    },
    setDepthTest(enabled: boolean) {
      if (material.depthTest === enabled) return;
      material.depthTest = enabled;
      material.needsUpdate = true;
      requestRender();
    },
    setCompositeMode(mode: PointCompositeMode) {
      if (compositeMode === mode) return;
      compositeMode = mode;
      syncMaterialBlending();
      requestRender();
    },
    setClipCorridor(corridor: PointClipCorridor | null) {
      const segments = corridor?.segments.slice(0, 64) ?? [];
      material.uniforms.uClipSegmentCount.value = segments.length;
      material.uniforms.uClipHalfWidth.value = Math.max(
        0,
        corridor?.halfWidth ?? 0
      );
      const uniforms = material.uniforms.uClipSegments.value as THREE.Vector4[];
      segments.forEach((segment, index) => {
        uniforms[index].set(
          segment.startX,
          segment.startZ,
          segment.endX,
          segment.endZ
        );
      });
      requestRender();
    },
    setHeightOffset(offsetMeters: number) {
      group.position.y = offsetMeters;
      requestRender();
    },
    setPositionOffset(
      eastMeters: number,
      northMeters: number,
      upMeters: number
    ) {
      group.position.fromArray(
        mapEnuOffsetToScene(eastMeters, northMeters, upMeters)
      );
      requestRender();
    },
    setRotationOffset(
      eastDegrees: number,
      northDegrees: number,
      upDegrees: number
    ) {
      const eastRadians = (eastDegrees * Math.PI) / 180;
      const northRadians = (northDegrees * Math.PI) / 180;
      const upRadians = (upDegrees * Math.PI) / 180;
      const rotation = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(eastRadians, northRadians, upRadians, "XYZ")
      );
      group.quaternion.copy(rotation);
      requestRender();
    },
    setPointBudget(pointBudget: number) {
      const next = Math.max(0, Math.floor(pointBudget));
      if (next === renderPointBudget) return;
      renderPointBudget = next;
      syncPointBudget();
    },
    setGlobalOpacity(opacity: number) {
      const next = THREE.MathUtils.clamp(opacity, 0, 1);
      if (next === globalOpacity) return;
      globalOpacity = next;
      material.uniforms.uGlobalOpacity.value = next;
      syncMaterialBlending();
      requestRender();
    },
    setViewport(width: number, height: number) {
      (material.uniforms.uViewport.value as THREE.Vector2).set(width, height);
    },
    dispose() {
      for (const child of group.children) {
        (child as THREE.Points).geometry.dispose();
      }
      group.clear();
      chunkPoints.length = 0;
      totalPoints = 0;
      Object.values(categoryTextures).forEach((texture) => texture.dispose());
      material.dispose();
    },
  };
}

export function buildCopcPointsLayer(
  layerId: string,
  originLngLat: [number, number]
): CopcPointsLayer {
  let map: MaplibreMap | null = null;
  const visualizer = createCopcPointCloudVisualizer(() =>
    map?.triggerRepaint()
  );
  const root = new THREE.Group();
  root.add(visualizer.group);
  const nodeBoundsGroup = new THREE.Group();
  const nodeBoundsMaterial = new THREE.LineBasicMaterial({
    color: 0x22c55e,
    transparent: true,
    opacity: 0.55,
    depthTest: false,
  });
  nodeBoundsGroup.visible = false;
  root.add(nodeBoundsGroup);
  const selectedNodeBoundsMaterial = new THREE.LineBasicMaterial({
    color: 0xf97316,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  });
  const selectedNodeBoundsGroup = new THREE.Group();
  selectedNodeBoundsGroup.visible = false;
  root.add(selectedNodeBoundsGroup);
  const clipFromLocal = new THREE.Matrix4();
  let frustumNodes: readonly CopcNodeDescriptor[] = [];
  let onFrustumSelection: ((
    nodeKeys: readonly string[],
    stats: { visibleNodeCount: number; selectedPointCount: number }
  ) => void) | null = null;
  let frustumPointBudget = Number.POSITIVE_INFINITY;
  let minimumSpacingPixels = 0.75;
  let lastSelectionSignature = "";
  const buildBoundsGeometry = (nodes: readonly CopcNodeDescriptor[]) => {
    const positions: number[] = [];
    for (const node of nodes) {
      const [minX, minY, minZ, maxX, maxY, maxZ] = node.boundsLocal;
      const corners = [
        [minX, minY, minZ], [maxX, minY, minZ], [maxX, maxY, minZ], [minX, maxY, minZ],
        [minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ],
      ];
      for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) {
        positions.push(...corners[a], ...corners[b]);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
  };
  const clearBoundsGroup = (group: THREE.Group) => {
    group.traverse((object) => {
      if (object instanceof THREE.LineSegments) object.geometry.dispose();
    });
    group.clear();
  };

  const layer: CopcPointsLayer = {
    id: layerId,
    originLngLat,
    root,
    get pointCount() {
      return visualizer.pointCount;
    },
    addChunk: visualizer.addChunk,
    removeChunk: visualizer.removeChunk,
    hasChunk: visualizer.hasChunk,
    setFrustumNodeSource(nodes, onSelection) {
      frustumNodes = nodes;
      onFrustumSelection = onSelection;
      clearBoundsGroup(nodeBoundsGroup);
      clearBoundsGroup(selectedNodeBoundsGroup);
      nodeBoundsGroup.add(new THREE.LineSegments(buildBoundsGeometry(nodes), nodeBoundsMaterial));
      lastSelectionSignature = "";
      map?.triggerRepaint();
    },
    setPointSize: visualizer.setPointSize,
    setRadiusMeters: visualizer.setRadiusMeters,
    setSizeMode: visualizer.setSizeMode,
    setRadiusScale: visualizer.setRadiusScale,
    setShape: visualizer.setShape,
    setColorization: visualizer.setColorization,
    setChunkField: visualizer.setChunkField,
    setHeightOffset: visualizer.setHeightOffset,
    setPositionOffset: visualizer.setPositionOffset,
    setRotationOffset: visualizer.setRotationOffset,
    setPointBudget(pointBudget: number) {
      frustumPointBudget = Math.max(0, Math.floor(pointBudget));
      visualizer.setPointBudget(frustumPointBudget);
      lastSelectionSignature = "";
    },
    setMinimumSpacingPixels(pixels: number) {
      minimumSpacingPixels = Math.max(0, pixels);
      lastSelectionSignature = "";
      map?.triggerRepaint();
    },
    setNodeBoundsVisible(visible: boolean) {
      nodeBoundsGroup.visible = visible;
      map?.triggerRepaint();
    },

    onAdd(mapInstance: MaplibreMap) {
      map = mapInstance;
    },

    update(frame: PointcloudSceneFrame) {
      visualizer.setViewport(frame.viewport.x, frame.viewport.y);

      if (onFrustumSelection && frustumNodes.length > 0) {
        root.updateMatrixWorld(true);
        clipFromLocal
          .copy(frame.renderCamera.projectionMatrix)
          .multiply(visualizer.group.matrixWorld);
        const selection = selectCopcNodesForFrustum(
          frustumNodes,
          clipFromLocal,
          frustumPointBudget,
          POINT_CLOUD_FRUSTUM_OVERSCAN,
          {
            viewportWidth: frame.viewport.x,
            viewportHeight: frame.viewport.y,
            minimumSpacingPixels,
          }
        );
        const signature = selection.keys.join("|");
        if (signature !== lastSelectionSignature) {
          lastSelectionSignature = signature;
          clearBoundsGroup(selectedNodeBoundsGroup);
          selectedNodeBoundsGroup.add(new THREE.LineSegments(
            buildBoundsGeometry(frustumNodes.filter((node) => selection.keys.includes(node.key))),
            selectedNodeBoundsMaterial
          ));
          onFrustumSelection(selection.keys, {
            visibleNodeCount: selection.visibleNodeCount,
            selectedPointCount: selection.pointCount,
          });
        }
      }
    },

    dispose() {
      visualizer.dispose();
      clearBoundsGroup(nodeBoundsGroup);
      clearBoundsGroup(selectedNodeBoundsGroup);
      nodeBoundsMaterial.dispose();
      selectedNodeBoundsMaterial.dispose();
      root.clear();
      lastSelectionSignature = "";
      map = null;
    },
  };

  return layer;
}
