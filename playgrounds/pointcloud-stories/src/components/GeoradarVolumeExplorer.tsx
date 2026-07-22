import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import * as THREE from "three/webgpu";
import {
  Break,
  cameraPosition,
  Continue,
  float,
  Fn,
  If,
  ivec3,
  Loop,
  max,
  min,
  modelWorldMatrixInverse,
  positionGeometry,
  positionLocal,
  texture,
  texture3D,
  uniform,
  varying,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { buildStoryMasonryPanelStyle } from "../../../stories/src/stories/common/ui/story-masonry-layout";
import {
  buildRampBytes,
  RAMP_NAMES,
  rampCssGradient,
  type RampName,
} from "../../../ng-topicmap-playground/src/app/pointcloud/colorRamps";

export type VolumeView = "top" | "side" | "end" | "ortho3d" | "perspective";
export type VolumeRenderMode = "voxel" | "composite" | "maximum";
export type DirectSignalMode = "signed" | "amplitude";

export type CurvePoint = { x: number; y: number };

export type VolumeVariant = {
  id: string;
  label: string;
  url: string;
  dtype: "uint16-le" | "uint10-packed-le";
  validBits: number;
  maximumCode: number;
  signalOffset: number;
  order: ["depth", "trace", "slice"];
  shape: { slice: number; trace: number; depth: number };
  byteLength: number;
  unpackedByteLength?: number;
  valueRange: [number, number];
  histogram256: number[];
};

export type VolumeMetadata = {
  format: "carma-georadar-volume-v1";
  captureId: number;
  data: VolumeVariant;
  variants?: VolumeVariant[];
  noiseGate?: {
    method: string;
    interpretation: string;
    estimatedSigmaCodes: number;
    thresholdCodes: number;
    removedSampleCount: number;
    removedFraction: number;
  };
  quantization10Bit?: {
    maximumAbsoluteErrorCodes16: number;
    rmseCodes16: number;
    activeRmseCodes16: number;
  };
  selection: {
    startSlice: number;
    endSliceExclusive: number;
    actualLengthMeter: number;
    requestedLengthMeter?: number;
    focusStartMeter?: number;
    segmentLengthMeter?: number;
    adjacentSegments?: number;
  };
  axes: {
    sliceMeters: number[];
    traceMeters: number[];
    depthMillimeters: number[];
  };
  spacing: {
    sliceMedianMeters: number;
    traceMedianMeters: number;
    depthMedianMillimeters: number;
  };
  histogram256: number[];
};

export type ClipRange = { min: number; max: number };

type VolumeScene = {
  renderer: THREE.WebGPURenderer;
  mesh: THREE.Mesh;
  clipMin: ReturnType<typeof uniform>;
  clipMax: ReturnType<typeof uniform>;
  opacityScale: ReturnType<typeof uniform>;
  renderMode: ReturnType<typeof uniform>;
  axisProjection: ReturnType<typeof uniform>;
  steps: ReturnType<typeof uniform>;
  sampleOffset: ReturnType<typeof uniform>;
  transferTexture: THREE.DataTexture;
  setVariant: (values: Float32Array) => void;
  resize: () => void;
  setView: (view: VolumeView) => void;
  dispose: () => void;
};

const IDENTITY_CURVE: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

export const GEORADAR_TONE_CURVE_PRESETS: Record<string, CurvePoint[]> = {
  linear: IDENTITY_CURVE,
  structure: [
    { x: 0, y: 0 },
    { x: 0.12, y: 0.03 },
    { x: 0.34, y: 0.42 },
    { x: 0.62, y: 0.82 },
    { x: 1, y: 1 },
  ],
  contrast: [
    { x: 0, y: 0 },
    { x: 0.2, y: 0.05 },
    { x: 0.55, y: 0.72 },
    { x: 1, y: 1 },
  ],
  shadows: [
    { x: 0, y: 0 },
    { x: 0.25, y: 0.52 },
    { x: 1, y: 1 },
  ],
};

export const GEORADAR_ALPHA_RAMP_PRESETS: Record<string, CurvePoint[]> = {
  structure: [
    { x: 0, y: 0 },
    { x: 0.18, y: 0 },
    { x: 0.32, y: 0.08 },
    { x: 0.52, y: 0.32 },
    { x: 0.72, y: 0.68 },
    { x: 1, y: 0.92 },
  ],
  "signal body": [
    { x: 0, y: 0 },
    { x: 0.08, y: 0 },
    { x: 0.22, y: 0.18 },
    { x: 0.55, y: 0.72 },
    { x: 1, y: 1 },
  ],
  "strong returns": [
    { x: 0, y: 0 },
    { x: 0.42, y: 0 },
    { x: 0.68, y: 0.45 },
    { x: 1, y: 1 },
  ],
  opaque: [
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ],
};

const DEFAULT_SIGNAL_MODE: DirectSignalMode = "amplitude";

export const DEFAULT_GEORADAR_TONE_CURVE =
  GEORADAR_TONE_CURVE_PRESETS.structure;
export const DEFAULT_GEORADAR_CLAMP_RANGE: ClipRange = {
  min: 0.03,
  max: 0.78,
};
export const DEFAULT_GEORADAR_COLOR_RAMP: RampName = "inferno";
export const DEFAULT_GEORADAR_COLOR_RAMP_INVERTED = true;
export const DEFAULT_GEORADAR_ALPHA_RAMP =
  GEORADAR_ALPHA_RAMP_PRESETS.structure;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const TRANSFER_LUT_SIZE = 4096;

export const prepareDirectGeoradarVolume = (
  source: Uint16Array,
  signalOffset: number,
  maximumCode: number,
  signalMode: DirectSignalMode
) => {
  const values = new Float32Array(source.length);
  const histogram256 = new Array<number>(256).fill(0);
  const negativeScale = Math.max(1, signalOffset);
  const positiveScale = Math.max(1, maximumCode - signalOffset);

  for (let index = 0; index < source.length; index += 1) {
    const centered = source[index] - signalOffset;
    const signed =
      centered < 0 ? centered / negativeScale : centered / positiveScale;
    const value = clamp01(
      signalMode === "amplitude" ? Math.abs(signed) : signed * 0.5 + 0.5
    );
    values[index] = value;
    histogram256[Math.min(255, Math.floor(value * 256))] += 1;
  }

  return { values, histogram256 };
};

const sortCurve = (points: CurvePoint[]) =>
  [...points].sort((left, right) => left.x - right.x);

const interpolateCurve = (sortedPoints: CurvePoint[], x: number) => {
  const upperIndex = sortedPoints.findIndex((point) => point.x >= x);
  if (upperIndex <= 0) return sortedPoints[0]?.y ?? 0;
  const lower = sortedPoints[upperIndex - 1];
  const upper = sortedPoints[upperIndex];
  const span = Math.max(1e-6, upper.x - lower.x);
  return lower.y + ((x - lower.x) / span) * (upper.y - lower.y);
};

export const buildTransferData = (
  toneCurve: CurvePoint[],
  alphaRamp: CurvePoint[],
  clampRange: ClipRange,
  colorRamp: RampName,
  invertColorRamp = false
) => {
  const data = new Uint8Array(TRANSFER_LUT_SIZE * 4);
  const ramp = buildRampBytes(colorRamp);
  const sortedToneCurve = sortCurve(toneCurve);
  const sortedAlphaRamp = sortCurve(alphaRamp);
  const clampSpan = Math.max(1e-6, clampRange.max - clampRange.min);
  for (let index = 0; index < TRANSFER_LUT_SIZE; index += 1) {
    const sourceUnit = index / (TRANSFER_LUT_SIZE - 1);
    const clampedUnit = clamp01((sourceUnit - clampRange.min) / clampSpan);
    const curvedUnit = clamp01(interpolateCurve(sortedToneCurve, clampedUnit));
    const rampUnit = invertColorRamp ? 1 - curvedUnit : curvedUnit;
    const rampIndex = Math.min(255, Math.round(rampUnit * 255));
    data[index * 4] = ramp[rampIndex * 4];
    data[index * 4 + 1] = ramp[rampIndex * 4 + 1];
    data[index * 4 + 2] = ramp[rampIndex * 4 + 2];
    data[index * 4 + 3] = Math.round(
      clamp01(interpolateCurve(sortedAlphaRamp, curvedUnit)) * 255
    );
  }
  return data;
};

export const buildCutawayTransferData = (
  toneCurve: CurvePoint[] = DEFAULT_GEORADAR_TONE_CURVE
) =>
  buildTransferData(
    toneCurve,
    DEFAULT_GEORADAR_ALPHA_RAMP,
    DEFAULT_GEORADAR_CLAMP_RANGE,
    DEFAULT_GEORADAR_COLOR_RAMP,
    DEFAULT_GEORADAR_COLOR_RAMP_INVERTED
  );

export const decodeVariantBuffer = (
  buffer: ArrayBuffer,
  variant: VolumeVariant
): Uint16Array => {
  if (variant.dtype === "uint16-le") return new Uint16Array(buffer);

  const sampleCount =
    variant.shape.slice * variant.shape.trace * variant.shape.depth;
  const bytes = new Uint8Array(buffer);
  const values = new Uint16Array(sampleCount);
  let accumulator = 0;
  let availableBits = 0;
  let outputIndex = 0;

  for (const byte of bytes) {
    accumulator |= byte << availableBits;
    availableBits += 8;
    while (availableBits >= 10 && outputIndex < sampleCount) {
      values[outputIndex] = accumulator & 0x3ff;
      outputIndex += 1;
      accumulator >>>= 10;
      availableBits -= 10;
    }
  }

  if (outputIndex !== sampleCount) {
    throw new Error(
      `${variant.id} decoded ${outputIndex} samples, expected ${sampleCount}`
    );
  }
  return values;
};

const raymarchVolumeBox = (
  steps: ReturnType<typeof uniform>,
  callback: ({ positionRay }: { positionRay: ReturnType<typeof vec3> }) => void
) => {
  const origin = varying(
    vec3(modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)))
  );
  const direction = varying(positionGeometry.sub(origin));
  const rayDirection = vec3(direction.normalize()).toVar();
  // Axis-aligned views contain exact zero direction components. Keep the ray
  // unchanged and only make its reciprocal finite.
  const inverseDirection = vec3(
    rayDirection.x
      .abs()
      .lessThan(1e-6)
      .select(1e6, float(1).div(rayDirection.x)),
    rayDirection.y
      .abs()
      .lessThan(1e-6)
      .select(1e6, float(1).div(rayDirection.y)),
    rayDirection.z
      .abs()
      .lessThan(1e-6)
      .select(1e6, float(1).div(rayDirection.z))
  );
  const increments = vec3(inverseDirection.abs()).toVar();
  const delta = float(
    min(increments.x, min(increments.y, increments.z))
  ).toVar();
  delta.divAssign(float(steps));

  const marchFromSurface = (marchDirection: ReturnType<typeof vec3>) => {
    // Starting half a step away from the rasterized surface avoids sampling
    // exactly on the texture boundary. One of the two directions below exits
    // immediately; the other one necessarily traverses the convex unit box.
    const positionRay = vec3(
      positionLocal.add(marchDirection.mul(delta.mul(0.5)))
    ).toVar();

    Loop({ type: "float", start: 0, end: 1.75, update: delta }, () => {
      const outsideBox = positionRay.x
        .lessThan(-0.5)
        .or(positionRay.x.greaterThan(0.5))
        .or(positionRay.y.lessThan(-0.5))
        .or(positionRay.y.greaterThan(0.5))
        .or(positionRay.z.lessThan(-0.5))
        .or(positionRay.z.greaterThan(0.5));
      If(outsideBox, () => {
        Break();
      });
      // Advance before the callback: its clipping path uses Continue(), which
      // must not skip the ray-position update for the next iteration.
      positionRay.addAssign(marchDirection.mul(delta));
      callback({ positionRay });
    });
  };

  marchFromSurface(rayDirection);
  marchFromSurface(vec3(rayDirection.negate()));
};

const makeVolumeMaterial = (
  volumeTexture: THREE.Data3DTexture,
  transferTexture: THREE.DataTexture,
  shape: VolumeMetadata["data"]["shape"]
) => {
  const clipMin = uniform(new THREE.Vector3(0, 0, 0));
  const clipMax = uniform(new THREE.Vector3(1, 1, 1));
  const opacityScale = uniform(0.92);
  const renderMode = uniform(1);
  const axisProjection = uniform(0);
  const steps = uniform(240);
  const sampleOffset = uniform(new THREE.Vector3(0, 0, 0));

  const renderVolume = Fn(() => {
    const finalColor = vec4(0).toVar();
    const maximumColor = vec4(0).toVar();
    const maximumAlpha = float(0).toVar();

    raymarchVolumeBox(steps, ({ positionRay }) => {
      // Texture depth zero is the physical surface at the top of the box.
      const uvw = vec3(
        positionRay.x.add(0.5),
        positionRay.y.add(0.5),
        float(0.5).sub(positionRay.z)
      )
        .add(sampleOffset)
        .toVar();
      const outside = uvw.x
        .lessThan(clipMin.x)
        .or(uvw.x.greaterThan(clipMax.x))
        .or(uvw.y.lessThan(clipMin.y))
        .or(uvw.y.greaterThan(clipMax.y))
        .or(uvw.z.lessThan(clipMin.z))
        .or(uvw.z.greaterThan(clipMax.z));

      If(outside, () => {
        Continue();
      });
      const voxel = ivec3(
        vec3(
          min(uvw.x.mul(shape.slice), shape.slice - 1),
          min(uvw.y.mul(shape.trace), shape.trace - 1),
          min(uvw.z.mul(shape.depth), shape.depth - 1)
        )
      );
      const value = float(0).toVar();
      If(renderMode.lessThan(0.5).and(axisProjection.lessThan(0.5)), () => {
        value.assign(vec4(texture3D(volumeTexture).load(voxel)).r);
      }).Else(() => {
        value.assign(vec4(texture3D(volumeTexture).sample(uvw)).r);
      });
      const sample = vec4(texture(transferTexture, vec2(value, 0.5))).toVar();
      const transferAlpha = float(sample.a).toVar();

      If(renderMode.lessThan(0.5), () => {
        sample.a.assign(transferAlpha.mul(opacityScale));
      }).Else(() => {
        sample.a.assign(transferAlpha.mul(opacityScale).mul(0.25));
      });

      If(transferAlpha.greaterThan(maximumAlpha), () => {
        maximumAlpha.assign(transferAlpha);
        maximumColor.assign(sample);
        maximumColor.a.assign(transferAlpha.mul(opacityScale).min(1));
      });

      finalColor.rgb.addAssign(
        finalColor.a.oneMinus().mul(sample.a).mul(sample.rgb)
      );
      finalColor.a.addAssign(finalColor.a.oneMinus().mul(sample.a));

      If(finalColor.a.greaterThanEqual(0.985), () => {
        Break();
      });
    });

    If(renderMode.greaterThan(1.5).or(axisProjection.greaterThan(0.5)), () => {
      finalColor.assign(maximumColor);
    });

    return finalColor;
  });

  const material = new THREE.NodeMaterial();
  material.colorNode = renderVolume();
  material.side = THREE.FrontSide;
  material.transparent = true;
  material.depthWrite = false;

  return {
    material,
    clipMin,
    clipMax,
    opacityScale,
    renderMode,
    axisProjection,
    steps,
    sampleOffset,
  };
};

export type GeoradarVolumeObject = {
  group: THREE.Group;
  mesh: THREE.Mesh;
  depthDisplay: number;
  width: number;
  clipMin: ReturnType<typeof uniform>;
  clipMax: ReturnType<typeof uniform>;
  opacityScale: ReturnType<typeof uniform>;
  renderMode: ReturnType<typeof uniform>;
  axisProjection: ReturnType<typeof uniform>;
  steps: ReturnType<typeof uniform>;
  sampleOffset: ReturnType<typeof uniform>;
  transferTexture: THREE.DataTexture;
  setValues: (values: Float32Array) => void;
  setTransferData: (data: Uint8Array) => void;
  dispose: () => void;
};

export const createGeoradarVolumeObject = (
  metadata: VolumeMetadata,
  variant: VolumeVariant,
  values: Float32Array,
  transferData: Uint8Array,
  {
    depthExaggeration = 10,
    minimumDisplayDepth = 1.5,
    showBounds = true,
    acrossPaddingMeters = 0,
    depthTopPaddingMeters = 0,
    depthBottomPaddingMeters = 0,
  }: {
    depthExaggeration?: number;
    minimumDisplayDepth?: number;
    showBounds?: boolean;
    acrossPaddingMeters?: number;
    depthTopPaddingMeters?: number;
    depthBottomPaddingMeters?: number;
  } = {}
): GeoradarVolumeObject => {
  const shape = variant.shape;
  const volumeTexture = new THREE.Data3DTexture(
    values,
    shape.slice,
    shape.trace,
    shape.depth
  );
  volumeTexture.format = THREE.RedFormat;
  volumeTexture.type = THREE.FloatType;
  volumeTexture.minFilter = THREE.LinearFilter;
  volumeTexture.magFilter = THREE.LinearFilter;
  volumeTexture.generateMipmaps = false;
  volumeTexture.unpackAlignment = 1;
  volumeTexture.needsUpdate = true;

  const transferTexture = new THREE.DataTexture(
    transferData,
    TRANSFER_LUT_SIZE,
    1,
    THREE.RGBAFormat
  );
  transferTexture.minFilter = THREE.LinearFilter;
  transferTexture.magFilter = THREE.LinearFilter;
  transferTexture.generateMipmaps = false;
  transferTexture.needsUpdate = true;

  const dataWidth =
    metadata.axes.traceMeters.at(-1)! - metadata.axes.traceMeters.at(0)!;
  const depthMeters = metadata.axes.depthMillimeters.at(-1)! / 1000;
  const dataDepthDisplay = Math.max(
    minimumDisplayDepth,
    depthMeters * depthExaggeration
  );
  const width = dataWidth + acrossPaddingMeters * 2;
  const depthDisplay =
    dataDepthDisplay + depthTopPaddingMeters + depthBottomPaddingMeters;
  const controls = makeVolumeMaterial(volumeTexture, transferTexture, shape);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.Mesh(geometry, controls.material);
  mesh.scale.set(metadata.selection.actualLengthMeter, width, depthDisplay);
  mesh.position.z = -depthDisplay / 2;
  mesh.frustumCulled = false;

  const group = new THREE.Group();
  group.add(mesh);
  if (showBounds) {
    const bounds = new THREE.Box3(
      new THREE.Vector3(
        -metadata.selection.actualLengthMeter / 2,
        -width / 2,
        -depthDisplay
      ),
      new THREE.Vector3(metadata.selection.actualLengthMeter / 2, width / 2, 0)
    );
    group.add(new THREE.Box3Helper(bounds, 0x44727d));
  }

  return {
    group,
    mesh,
    depthDisplay,
    width,
    ...controls,
    transferTexture,
    setValues: (nextValues) => {
      volumeTexture.image.data.set(nextValues);
      volumeTexture.needsUpdate = true;
    },
    setTransferData: (data) => {
      transferTexture.image.data.set(data);
      transferTexture.needsUpdate = true;
    },
    dispose: () => {
      geometry.dispose();
      controls.material.dispose();
      volumeTexture.dispose();
      transferTexture.dispose();
    },
  };
};

const createVolumeScene = async (
  host: HTMLDivElement,
  metadata: VolumeMetadata,
  variant: VolumeVariant,
  values: Float32Array,
  transferData: Uint8Array,
  onBackend: (backend: string) => void
): Promise<VolumeScene> => {
  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x071014, 1);
  await renderer.init();
  host.appendChild(renderer.domElement);

  const backend = renderer.backend as unknown as { isWebGPUBackend?: boolean };
  onBackend(backend.isWebGPUBackend ? "WebGPU" : "WebGL2 fallback");

  const scene = new THREE.Scene();
  const orthographicCamera = new THREE.OrthographicCamera(
    -6,
    6,
    4,
    -4,
    0.01,
    100
  );
  const perspectiveCamera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
  const orthographicControls = new OrbitControls(
    orthographicCamera,
    renderer.domElement
  );
  const perspectiveControls = new OrbitControls(
    perspectiveCamera,
    renderer.domElement
  );
  for (const controls of [orthographicControls, perspectiveControls]) {
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
  }
  let activeCamera: THREE.OrthographicCamera | THREE.PerspectiveCamera =
    orthographicCamera;
  let activeControls = orthographicControls;
  perspectiveControls.enabled = false;

  const shape = variant.shape;
  const volume = createGeoradarVolumeObject(
    metadata,
    variant,
    values,
    transferData
  );
  const { mesh, width, depthDisplay, steps, sampleOffset, axisProjection } =
    volume;
  scene.add(volume.group);
  perspectiveControls.minDistance =
    Math.hypot(metadata.selection.actualLengthMeter, width, depthDisplay) *
    0.55;

  let currentView: VolumeView = "ortho3d";

  const resize = () => {
    const widthPixels = Math.max(1, host.clientWidth);
    const heightPixels = Math.max(1, host.clientHeight);
    renderer.setSize(widthPixels, heightPixels, false);
    const aspect = widthPixels / heightPixels;
    let projectedWidth = metadata.selection.actualLengthMeter;
    let projectedHeight = width;
    if (currentView === "side") {
      projectedHeight = depthDisplay;
    } else if (currentView === "end") {
      projectedWidth = width;
      projectedHeight = depthDisplay;
    } else if (currentView === "ortho3d") {
      projectedWidth = metadata.selection.actualLengthMeter * 0.9 + width * 0.5;
      projectedHeight =
        depthDisplay + metadata.selection.actualLengthMeter * 0.35;
    }
    const halfHeight =
      Math.max(projectedHeight / 2, projectedWidth / (2 * aspect)) * 1.18;
    orthographicCamera.left = -halfHeight * aspect;
    orthographicCamera.right = halfHeight * aspect;
    orthographicCamera.top = halfHeight;
    orthographicCamera.bottom = -halfHeight;
    orthographicCamera.updateProjectionMatrix();
    perspectiveCamera.aspect = aspect;
    perspectiveCamera.updateProjectionMatrix();
  };

  const setView = (view: VolumeView) => {
    currentView = view;
    const center = new THREE.Vector3(0, 0, -depthDisplay / 2);
    const distance = 18;
    activeControls.enabled = false;
    if (view === "perspective") {
      activeCamera = perspectiveCamera;
      activeControls = perspectiveControls;
    } else {
      activeCamera = orthographicCamera;
      activeControls = orthographicControls;
    }
    activeControls.enabled = true;
    if (view === "top") {
      orthographicCamera.position.set(0, 0, distance);
      orthographicCamera.up.set(0, 1, 0);
      steps.value = shape.depth;
      (sampleOffset.value as THREE.Vector3).set(0, 0, 0.5 / shape.depth);
    } else if (view === "side") {
      orthographicCamera.position.set(0, -distance, center.z);
      orthographicCamera.up.set(0, 0, 1);
      steps.value = shape.trace;
      (sampleOffset.value as THREE.Vector3).set(0, 0.5 / shape.trace, 0);
    } else if (view === "end") {
      orthographicCamera.position.set(-distance, 0, center.z);
      orthographicCamera.up.set(0, 0, 1);
      steps.value = shape.slice;
      (sampleOffset.value as THREE.Vector3).set(0.5 / shape.slice, 0, 0);
    } else if (view === "perspective") {
      perspectiveCamera.position.set(8.15, -7.3, 5.5);
      perspectiveCamera.up.set(0, 0, 1);
      steps.value = Math.ceil(
        Math.hypot(shape.slice, shape.trace, shape.depth) * 1.25
      );
      (sampleOffset.value as THREE.Vector3).set(
        0.5 / shape.slice,
        0.5 / shape.trace,
        0.5 / shape.depth
      );
    } else {
      orthographicCamera.position.set(8, -7, 5);
      orthographicCamera.up.set(0, 0, 1);
      steps.value = Math.ceil(
        Math.hypot(shape.slice, shape.trace, shape.depth)
      );
      (sampleOffset.value as THREE.Vector3).set(
        0.5 / shape.slice,
        0.5 / shape.trace,
        0.5 / shape.depth
      );
    }
    axisProjection.value = view === "ortho3d" || view === "perspective" ? 0 : 1;
    activeControls.enableRotate = view === "ortho3d" || view === "perspective";
    activeControls.target.copy(center);
    activeCamera.lookAt(center);
    activeCamera.updateProjectionMatrix();
    activeControls.update();
    resize();
  };

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  setView("ortho3d");
  renderer.setAnimationLoop(() => {
    activeControls.update();
    renderer.render(scene, activeCamera);
  });

  return {
    renderer,
    mesh,
    clipMin: volume.clipMin,
    clipMax: volume.clipMax,
    opacityScale: volume.opacityScale,
    renderMode: volume.renderMode,
    axisProjection: volume.axisProjection,
    steps: volume.steps,
    sampleOffset: volume.sampleOffset,
    transferTexture: volume.transferTexture,
    setVariant: (nextValues) => {
      volume.setValues(nextValues);
    },
    resize,
    setView,
    dispose: () => {
      observer.disconnect();
      renderer.setAnimationLoop(null);
      orthographicControls.dispose();
      perspectiveControls.dispose();
      volume.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
};

const RangePair = ({
  label,
  range,
  onChange,
  format,
}: {
  label: string;
  range: ClipRange;
  onChange: (range: ClipRange) => void;
  format: (value: number) => string;
}) => {
  const setMinimum = (value: string) =>
    onChange({
      min: Math.min(Number(value), range.max - 0.001),
      max: range.max,
    });
  const setMaximum = (value: string) =>
    onChange({
      min: range.min,
      max: Math.max(Number(value), range.min + 0.001),
    });

  return (
    <fieldset className="volume-range-pair">
      <legend>{label}</legend>
      <label>
        <span>min {format(range.min)}</span>
        <input
          aria-label={`${label} minimum`}
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={range.min}
          onInput={(event) => setMinimum(event.currentTarget.value)}
          onChange={(event) => setMinimum(event.currentTarget.value)}
        />
      </label>
      <label>
        <span>max {format(range.max)}</span>
        <input
          aria-label={`${label} maximum`}
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={range.max}
          onInput={(event) => setMaximum(event.currentTarget.value)}
          onChange={(event) => setMaximum(event.currentTarget.value)}
        />
      </label>
    </fieldset>
  );
};

export const TransferCurveEditor = ({
  histogram,
  points,
  onChange,
  ariaLabel,
  showMidpoint = false,
  axisLabel = "unit range",
  kind = "tone",
}: {
  histogram: number[];
  points: CurvePoint[];
  onChange: (points: CurvePoint[]) => void;
  ariaLabel: string;
  showMidpoint?: boolean;
  axisLabel?: string;
  kind?: "tone" | "opacity";
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragged, setDragged] = useState<number | null>(null);
  const width = 300;
  const height = 126;
  const maximum = Math.max(...histogram, 1);
  const histogramPath = histogram
    .map((count, index) => {
      const x = (index / (histogram.length - 1)) * width;
      const y = height - (Math.log1p(count) / Math.log1p(maximum)) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const curvePath = [...points]
    .sort((left, right) => left.x - right.x)
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${(point.x * width).toFixed(2)},${(
          height -
          point.y * height
        ).toFixed(2)}`
    )
    .join(" ");

  const updateDragged = useCallback(
    (clientX: number, clientY: number) => {
      if (dragged === null || !svgRef.current) return;
      const bounds = svgRef.current.getBoundingClientRect();
      const x = clamp01((clientX - bounds.left) / bounds.width);
      const y = clamp01(1 - (clientY - bounds.top) / bounds.height);
      const next = points.map((point, index) =>
        index === dragged
          ? {
              x:
                index === 0
                  ? 0
                  : index === points.length - 1
                  ? 1
                  : Math.max(
                      points[index - 1].x + 0.005,
                      Math.min(x, points[index + 1].x - 0.005)
                    ),
              y,
            }
          : point
      );
      onChange(next);
    },
    [dragged, onChange, points]
  );

  useEffect(() => {
    if (dragged === null) return;
    const move = (event: PointerEvent) =>
      updateDragged(event.clientX, event.clientY);
    const up = () => setDragged(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragged, updateDragged]);

  return (
    <div className={`volume-curve-editor is-${kind}`}>
      <div className="volume-curve-canvas">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          data-test-id="transfer-curve"
        >
          <path className="volume-histogram" d={histogramPath} />
          {showMidpoint ? (
            <line
              className="volume-zero-line"
              x1={width / 2}
              x2={width / 2}
              y1={0}
              y2={height}
            />
          ) : null}
          <path className="volume-curve" d={curvePath} />
        </svg>
        {points.map((point, index) => (
          <button
            key={index}
            type="button"
            className="volume-curve-point"
            style={{
              left: `${point.x * 100}%`,
              top: `${(1 - point.y) * 100}%`,
            }}
            role="slider"
            aria-label={`${ariaLabel} · Kontrollpunkt ${index + 1}`}
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={point.y}
            aria-valuetext={`x ${point.x.toFixed(3)}, y ${point.y.toFixed(3)}`}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragged(index);
            }}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 0.1 : 0.01;
              const deltaX =
                event.key === "ArrowLeft"
                  ? -step
                  : event.key === "ArrowRight"
                  ? step
                  : 0;
              const deltaY =
                event.key === "ArrowDown"
                  ? -step
                  : event.key === "ArrowUp"
                  ? step
                  : 0;
              if (deltaX === 0 && deltaY === 0) return;
              event.preventDefault();
              const next = points.map((candidate, candidateIndex) => {
                if (candidateIndex !== index) return candidate;
                const x =
                  index === 0
                    ? 0
                    : index === points.length - 1
                    ? 1
                    : Math.max(
                        points[index - 1].x + 0.005,
                        Math.min(
                          candidate.x + deltaX,
                          points[index + 1].x - 0.005
                        )
                      );
                return {
                  x,
                  y: clamp01(candidate.y + deltaY),
                };
              });
              onChange(next);
            }}
          />
        ))}
      </div>
      <div className="volume-curve-axis">
        <span>0</span>
        <span>{axisLabel}</span>
        <span>1</span>
      </div>
    </div>
  );
};

export const GeoradarVolumeExplorer = ({
  metadataUrl,
}: {
  metadataUrl: string;
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<VolumeScene | null>(null);
  const [metadata, setMetadata] = useState<VolumeMetadata | null>(null);
  const [variantValues, setVariantValues] = useState<Record<
    string,
    Uint16Array
  > | null>(null);
  const [variantId, setVariantId] = useState("raw16");
  const [status, setStatus] = useState("loading metadata…");
  const [backend, setBackend] = useState("");
  const [view, setView] = useState<VolumeView>("perspective");
  const [renderMode, setRenderMode] = useState<VolumeRenderMode>("composite");
  const [opacity, setOpacity] = useState(0.58);
  const [toneCurve, setToneCurve] = useState<CurvePoint[]>(
    DEFAULT_GEORADAR_TONE_CURVE
  );
  const [alphaRamp, setAlphaRamp] = useState<CurvePoint[]>(
    DEFAULT_GEORADAR_ALPHA_RAMP
  );
  const [clampRange, setClampRange] = useState<ClipRange>(
    DEFAULT_GEORADAR_CLAMP_RANGE
  );
  const [colorRamp, setColorRamp] = useState<RampName>(
    DEFAULT_GEORADAR_COLOR_RAMP
  );
  const [invertColorRamp, setInvertColorRamp] = useState(
    DEFAULT_GEORADAR_COLOR_RAMP_INVERTED
  );
  const [signalMode, setSignalMode] =
    useState<DirectSignalMode>(DEFAULT_SIGNAL_MODE);
  const [clipX, setClipX] = useState<ClipRange>({ min: 0, max: 1 });
  const [clipY, setClipY] = useState<ClipRange>({ min: 0, max: 0.58 });
  const [clipZ, setClipZ] = useState<ClipRange>({ min: 0, max: 1 });
  const variants = metadata
    ? metadata.variants?.length
      ? metadata.variants
      : [metadata.data]
    : [];
  const activeVariant =
    variants.find((variant) => variant.id === variantId) ?? variants[0];
  const directVolume = useMemo(() => {
    const values = activeVariant
      ? variantValues?.[activeVariant.id]
      : undefined;
    if (!activeVariant || !values) return null;
    return prepareDirectGeoradarVolume(
      values,
      activeVariant.signalOffset,
      activeVariant.maximumCode,
      signalMode
    );
  }, [activeVariant, signalMode, variantValues]);
  useEffect(() => {
    const abortController = new AbortController();
    const load = async () => {
      try {
        setStatus("loading metadata…");
        const metadataResponse = await fetch(metadataUrl, {
          signal: abortController.signal,
        });
        if (!metadataResponse.ok) {
          throw new Error(`metadata HTTP ${metadataResponse.status}`);
        }
        const loadedMetadata =
          (await metadataResponse.json()) as VolumeMetadata;
        if (loadedMetadata.format !== "carma-georadar-volume-v1") {
          throw new Error(`unsupported format ${loadedMetadata.format}`);
        }
        const loadedVariants = loadedMetadata.variants?.length
          ? loadedMetadata.variants
          : [loadedMetadata.data];
        const totalBytes = loadedVariants.reduce(
          (sum, variant) => sum + variant.byteLength,
          0
        );
        setStatus(
          `loading ${(totalBytes / 1_000_000).toFixed(2)} MB comparison…`
        );
        const loadedValues = await Promise.all(
          loadedVariants.map(async (variant) => {
            const dataUrl = new URL(variant.url, metadataResponse.url).href;
            const dataResponse = await fetch(dataUrl, {
              signal: abortController.signal,
            });
            if (!dataResponse.ok) {
              throw new Error(`${variant.id} HTTP ${dataResponse.status}`);
            }
            const buffer = await dataResponse.arrayBuffer();
            if (buffer.byteLength !== variant.byteLength) {
              throw new Error(
                `${variant.id} has ${buffer.byteLength} bytes, expected ${variant.byteLength}`
              );
            }
            return [variant.id, decodeVariantBuffer(buffer, variant)] as const;
          })
        );
        setMetadata(loadedMetadata);
        setVariantValues(Object.fromEntries(loadedValues));
        setVariantId((current) =>
          loadedVariants.some((variant) => variant.id === current)
            ? current
            : loadedVariants[0].id
        );
      } catch (error) {
        if (!abortController.signal.aborted) {
          setStatus(error instanceof Error ? error.message : String(error));
        }
      }
    };
    void load();
    return () => abortController.abort();
  }, [metadataUrl]);

  useEffect(() => {
    const initialVariant = variants[0];
    const initialValues = initialVariant
      ? variantValues?.[initialVariant.id]
      : undefined;
    if (!hostRef.current || !metadata || !initialVariant || !initialValues)
      return;
    let disposed = false;
    setStatus("initializing GPU volume…");
    const initialVolume = prepareDirectGeoradarVolume(
      initialValues,
      initialVariant.signalOffset,
      initialVariant.maximumCode,
      DEFAULT_SIGNAL_MODE
    );
    void createVolumeScene(
      hostRef.current,
      metadata,
      initialVariant,
      initialVolume.values,
      buildTransferData(
        IDENTITY_CURVE,
        DEFAULT_GEORADAR_ALPHA_RAMP,
        DEFAULT_GEORADAR_CLAMP_RANGE,
        DEFAULT_GEORADAR_COLOR_RAMP,
        DEFAULT_GEORADAR_COLOR_RAMP_INVERTED
      ),
      setBackend
    )
      .then((scene) => {
        if (disposed) {
          scene.dispose();
          return;
        }
        sceneRef.current = scene;
        setStatus("ready");
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : String(error));
      });
    return () => {
      disposed = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
    // The GPU scene owns a mutable transfer texture; curve changes update it below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metadata, variantValues]);

  useEffect(() => {
    if (!sceneRef.current || !directVolume || status !== "ready") return;
    sceneRef.current.setVariant(directVolume.values);
  }, [directVolume, status]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const data = buildTransferData(
      toneCurve,
      alphaRamp,
      clampRange,
      colorRamp,
      invertColorRamp
    );
    scene.transferTexture.image.data.set(data);
    scene.transferTexture.needsUpdate = true;
  }, [alphaRamp, clampRange, colorRamp, invertColorRamp, toneCurve]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    (scene.clipMin.value as THREE.Vector3).set(clipX.min, clipY.min, clipZ.min);
    (scene.clipMax.value as THREE.Vector3).set(clipX.max, clipY.max, clipZ.max);
  }, [clipX, clipY, clipZ]);

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.opacityScale.value = opacity;
  }, [opacity]);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.renderMode.value =
        renderMode === "voxel" ? 0 : renderMode === "composite" ? 1 : 2;
    }
  }, [renderMode, status]);

  useEffect(() => {
    if (sceneRef.current && status === "ready") {
      sceneRef.current.setView(view);
    }
  }, [status, view]);

  const viewButtons = useMemo(
    () =>
      (["top", "side", "end", "ortho3d", "perspective"] as const).map(
        (nextView) => (
          <button
            key={nextView}
            type="button"
            className={view === nextView ? "is-active" : ""}
            onClick={() => setView(nextView)}
          >
            {nextView === "ortho3d" || nextView === "perspective"
              ? nextView === "ortho3d"
                ? "3D ortho"
                : "perspective"
              : nextView === "side"
              ? "left"
              : nextView === "end"
              ? "right"
              : "top"}
          </button>
        )
      ),
    [view]
  );

  const lengthMeters = metadata?.selection.actualLengthMeter ?? 10;
  const widthMeters = metadata
    ? metadata.axes.traceMeters.at(-1)! - metadata.axes.traceMeters.at(0)!
    : 1.8;
  const depthMillimeters = metadata?.axes.depthMillimeters.at(-1) ?? 196.8;

  return (
    <div className="georadar-volume-explorer">
      <div className="volume-canvas-shell">
        <div
          ref={hostRef}
          className="volume-canvas"
          data-test-id="volume-canvas"
        />
        <div className="volume-view-buttons" aria-label="Orthographic views">
          {viewButtons}
        </div>
        <div
          className={`volume-status ${status === "ready" ? "is-ready" : ""}`}
          data-test-id="volume-status"
        >
          {status}
          {backend ? ` · ${backend}` : ""}
        </div>
      </div>

      <aside
        className="volume-panel"
        style={{
          ...buildStoryMasonryPanelStyle({ padding: 0, gap: 0 }),
          width: 348,
          maxWidth: "calc(100% - 28px)",
        }}
      >
        <header>
          <p>Georadar volume POC</p>
          <h1>Capture 026 · 10 m block</h1>
          <div className="volume-facts">
            <span>{activeVariant?.shape.slice ?? "—"} slices</span>
            <span>{activeVariant?.shape.trace ?? "—"} traces</span>
            <span>{activeVariant?.shape.depth ?? "—"} depth layers</span>
            <span>{activeVariant?.validBits ?? "—"}-bit signal</span>
            <span>anisotropic voxels</span>
          </div>
        </header>

        <section>
          <h2>Dataset comparison</h2>
          <div className="volume-segmented volume-variant-picker">
            {variants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                className={variant.id === activeVariant?.id ? "is-active" : ""}
                onClick={() => setVariantId(variant.id)}
              >
                {variant.label}
              </button>
            ))}
          </div>
          <p className="volume-help">
            {metadata?.noiseGate
              ? `Heuristic floor ±${
                  metadata.noiseGate.thresholdCodes
                } codes removes ${(
                  metadata.noiseGate.removedFraction * 100
                ).toFixed(1)}% of samples. `
              : ""}
            {metadata?.quantization10Bit
              ? `10-bit active-signal RMSE: ${metadata.quantization10Bit.activeRmseCodes16.toFixed(
                  1
                )} R16 codes.`
              : ""}
          </p>
        </section>

        <section>
          <h2>Signal</h2>
          <label className="volume-control-row">
            <span>scalar</span>
            <select
              value={signalMode}
              onChange={(event) =>
                setSignalMode(event.target.value as DirectSignalMode)
              }
            >
              <option value="signed">signed amplitude</option>
              <option value="amplitude">absolute amplitude</option>
            </select>
          </label>
          <p className="volume-help">
            Direct source samples only. No RMS window, axis smoothing or edge
            kernels are applied.
          </p>
        </section>

        <section>
          <h2>Clamp → curve → ramps</h2>
          <RangePair
            label="input clamp"
            range={clampRange}
            onChange={setClampRange}
            format={(value) => value.toFixed(3)}
          />
          <div className="volume-section-heading">
            <h2>Tone curve</h2>
            <select
              aria-label="Tone curve preset"
              defaultValue="structure"
              onChange={(event) =>
                setToneCurve(
                  GEORADAR_TONE_CURVE_PRESETS[event.target.value].map(
                    (point) => ({
                      ...point,
                    })
                  )
                )
              }
            >
              {Object.keys(GEORADAR_TONE_CURVE_PRESETS).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </div>
          <TransferCurveEditor
            histogram={directVolume?.histogram256 ?? new Array(256).fill(0)}
            points={toneCurve}
            onChange={setToneCurve}
            ariaLabel="Source signal histogram and editable unit tone curve"
            showMidpoint={signalMode === "signed"}
          />
          <div className="volume-ramp-row">
            <label>
              <span>color ramp</span>
              <select
                value={colorRamp}
                onChange={(event) =>
                  setColorRamp(event.target.value as RampName)
                }
              >
                {RAMP_NAMES.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <span
              className="volume-ramp-preview"
              style={{
                backgroundImage: rampCssGradient(colorRamp),
                transform: invertColorRamp ? "scaleX(-1)" : undefined,
              }}
              aria-hidden="true"
            />
            <label className="volume-ramp-invert">
              <input
                type="checkbox"
                checked={invertColorRamp}
                onChange={(event) =>
                  setInvertColorRamp(event.currentTarget.checked)
                }
              />
              invert
            </label>
          </div>
          <div className="volume-section-heading">
            <h2>Alpha ramp</h2>
            <select
              aria-label="Alpha ramp preset"
              defaultValue="structure"
              onChange={(event) =>
                setAlphaRamp(
                  GEORADAR_ALPHA_RAMP_PRESETS[event.target.value].map(
                    (point) => ({
                      ...point,
                    })
                  )
                )
              }
            >
              {Object.keys(GEORADAR_ALPHA_RAMP_PRESETS).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </div>
          <TransferCurveEditor
            histogram={directVolume?.histogram256 ?? new Array(256).fill(0)}
            points={alphaRamp}
            onChange={setAlphaRamp}
            ariaLabel="Editable alpha ramp over tone-mapped unit signal"
            axisLabel="signal → opacity"
            kind="opacity"
          />
          <p className="volume-help">
            The selected source signal is clamped and curved into 0…1. Color and
            alpha ramps consume only that display range; source samples remain
            untouched.
          </p>
          <label className="volume-control-row">
            <span>opacity {opacity.toFixed(2)}</span>
            <input
              aria-label="Volume opacity"
              type="range"
              min={0.02}
              max={2}
              step={0.01}
              value={opacity}
              onInput={(event) => setOpacity(Number(event.currentTarget.value))}
              onChange={(event) => setOpacity(Number(event.target.value))}
            />
          </label>
          <div className="volume-segmented">
            <button
              type="button"
              className={renderMode === "voxel" ? "is-active" : ""}
              onClick={() => setRenderMode("voxel")}
            >
              solid voxels
            </button>
            <button
              type="button"
              className={renderMode === "composite" ? "is-active" : ""}
              onClick={() => setRenderMode("composite")}
            >
              composite
            </button>
            <button
              type="button"
              className={renderMode === "maximum" ? "is-active" : ""}
              onClick={() => setRenderMode("maximum")}
            >
              max intensity
            </button>
          </div>
          <p className="volume-help">
            3D views raymarch from the viewer-facing box surface with ordered
            front-to-back accumulation. Top, left and right are direct trilinear
            maximum projections, so they remain flat image views.
          </p>
        </section>

        <section>
          <h2>Six clipping planes</h2>
          <RangePair
            label="along capture (X)"
            range={clipX}
            onChange={setClipX}
            format={(value) => `${(value * lengthMeters).toFixed(2)} m`}
          />
          <RangePair
            label="across array (Y)"
            range={clipY}
            onChange={setClipY}
            format={(value) => `${((value - 0.5) * widthMeters).toFixed(2)} m`}
          />
          <RangePair
            label="depth (Z)"
            range={clipZ}
            onChange={setClipZ}
            format={(value) => `${Math.round(value * depthMillimeters)} mm`}
          />
        </section>
      </aside>
    </div>
  );
};
