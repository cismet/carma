import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Vector3,
} from "three";
import type { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import type { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { MapLibreAnnotationScene } from "./maplibre-annotation-scene.types";

type LineBufferGeometry = LineGeometry | LineSegmentsGeometry;

/** Keeps the position and distance buffers while topology is unchanged. */
export const updateSceneLineBuffers = (
  geometry: LineBufferGeometry,
  positions: Float32Array,
  segmentPairs: boolean
): void => {
  const count = segmentPairs ? positions.length / 6 : positions.length / 3 - 1;
  let start = geometry.getAttribute("instanceStart") as
    | InterleavedBufferAttribute
    | undefined;
  if (!start || start.count !== count) {
    geometry.setPositions(positions);
    start = geometry.getAttribute(
      "instanceStart"
    ) as InterleavedBufferAttribute;
    start.data.setUsage(DynamicDrawUsage);
    const distances = new InstancedInterleavedBuffer(
      new Float32Array(count * 2),
      2,
      1
    );
    distances.setUsage(DynamicDrawUsage);
    geometry.setAttribute(
      "instanceDistanceStart",
      new InterleavedBufferAttribute(distances, 1, 0)
    );
    geometry.setAttribute(
      "instanceDistanceEnd",
      new InterleavedBufferAttribute(distances, 1, 1)
    );
  }
  const data = start.data;
  const array = data.array as Float32Array;
  let positionsChanged = false;
  for (let index = 0; index < count; index++) {
    const input = index * (segmentPairs ? 6 : 3);
    for (let axis = 0; axis < 6; axis++) {
      const value = positions[input + axis]!;
      const offset = index * 6 + axis;
      if (array[offset] !== value) {
        array[offset] = value;
        positionsChanged = true;
      }
    }
  }
  if (positionsChanged) {
    data.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  const distances = (
    geometry.getAttribute("instanceDistanceStart") as InterleavedBufferAttribute
  ).data;
  const distanceArray = distances.array as Float32Array;
  let cumulative = 0;
  let distancesChanged = false;
  for (let index = 0; index < count; index++) {
    const offset = index * 6;
    const dx = array[offset + 3]! - array[offset]!;
    const dy = array[offset + 4]! - array[offset + 1]!;
    const dz = array[offset + 5]! - array[offset + 2]!;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const beginning = segmentPairs ? 0 : cumulative;
    const end = beginning + length;
    if (distanceArray[index * 2] !== Math.fround(beginning)) {
      distanceArray[index * 2] = beginning;
      distancesChanged = true;
    }
    if (distanceArray[index * 2 + 1] !== Math.fround(end)) {
      distanceArray[index * 2 + 1] = end;
      distancesChanged = true;
    }
    cumulative = Math.fround(end);
  }
  if (distancesChanged) distances.needsUpdate = true;
};

/** Every disjoint dash uses the CSS-pixel scale its individual line used. */
export const updateSegmentDashScales = (
  geometry: LineBufferGeometry,
  scene: MapLibreAnnotationScene,
  positions: Float32Array
): void => {
  const count = positions.length / 6;
  let attribute = geometry.getAttribute("instanceDashScale") as
    | InstancedBufferAttribute
    | undefined;
  if (!attribute || attribute.count !== count) {
    attribute = new InstancedBufferAttribute(new Float32Array(count), 1);
    attribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute("instanceDashScale", attribute);
  }
  const array = attribute.array as Float32Array;
  const midpoint = new Vector3();
  let changed = false;
  for (let index = 0; index < count; index++) {
    const offset = index * 6;
    midpoint.set(
      (positions[offset]! + positions[offset + 3]!) / 2,
      (positions[offset + 1]! + positions[offset + 4]!) / 2,
      (positions[offset + 2]! + positions[offset + 5]!) / 2
    );
    const measuredScale = scene.getPixelsPerMeterAtScene(midpoint);
    // Each old dash kept its last world-size uniforms when projection had no scale.
    const scale =
      Number.isFinite(measuredScale) && measuredScale > 0
        ? Math.fround(measuredScale)
        : array[index]! > 0
        ? array[index]!
        : 1;
    if (array[index] !== scale) {
      array[index] = scale;
      changed = true;
    }
  }
  if (changed) attribute.needsUpdate = true;
};

/**
 * The depth-fail pattern resets at each old dash's start. The visible caps
 * and depth tests stay those of LineSegments2/LineMaterial; only the per-dash
 * conversion of world distance to CSS pixels is instanced.
 */
export const prepareSegmentDashMaterial = (
  material: LineMaterial
): LineMaterial => {
  const beforeCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = function (shader, renderer) {
    beforeCompile.call(this, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace(
        "uniform float dashScale;",
        "uniform float dashScale; attribute float instanceDashScale;"
      )
      .replace(
        "dashScale * instanceDistanceStart",
        "dashScale * instanceDashScale * instanceDistanceStart"
      )
      .replace(
        "dashScale * instanceDistanceEnd",
        "dashScale * instanceDashScale * instanceDistanceEnd"
      );
  };
  material.customProgramCacheKey = () => previousKey() + ":segment-dash-scale";
  return material;
};
