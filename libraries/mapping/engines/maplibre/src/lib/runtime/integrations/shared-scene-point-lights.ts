import * as THREE from "three";

import { TILE_CAMERA_ROLE } from "../../core/tile-camera-demand";
import type { SharedThreeSceneLayer } from "../../core/shared-three-scene-types";

export type SharedScenePointLightsOptions = Readonly<{
  positions: readonly THREE.Vector3[];
  colors?: readonly THREE.ColorRepresentation[];
  intensity: number;
  range: number;
  shadowMapSize: number;
  errorTargetPixels: number;
  normalBias: number;
  maxShadowLights?: number;
}>;

export type PointLightOrbitOptions = Readonly<{
  radius: number;
  minHeight: number;
  maxHeight: number;
  periodSeconds: number;
}>;

export type SharedScenePointLights = Readonly<{
  setPosition: (index: number, position: THREE.Vector3) => void;
  invalidateShadows: () => void;
  getCameras: () => readonly Readonly<{
    id: string;
    camera: THREE.PerspectiveCamera;
  }>[];
  getShadowLightCount: () => number;
  dispose: () => void;
}>;

const CUBE_FACES: ReadonlyArray<{
  name: string;
  direction: readonly [number, number, number];
  up: readonly [number, number, number];
}> = [
  { name: "px", direction: [1, 0, 0], up: [0, -1, 0] },
  { name: "nx", direction: [-1, 0, 0], up: [0, -1, 0] },
  { name: "py", direction: [0, 1, 0], up: [0, 0, 1] },
  { name: "ny", direction: [0, -1, 0], up: [0, 0, -1] },
  { name: "pz", direction: [0, 0, 1], up: [0, -1, 0] },
  { name: "nz", direction: [0, 0, -1], up: [0, -1, 0] },
] as const;

let nextInstanceId = 0;

const isFiniteVector = (value: THREE.Vector3): boolean =>
  [value.x, value.y, value.z].every(Number.isFinite);

const requireFinite = (name: string, value: number): void => {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
};

/** Four lights produce 24 geometry-demand faces; these are also real preview cameras. */
export const createSharedScenePointLights = (
  layer: SharedThreeSceneLayer,
  options: SharedScenePointLightsOptions
): SharedScenePointLights => {
  requireFinite("intensity", options.intensity);
  requireFinite("range", options.range);
  requireFinite("shadowMapSize", options.shadowMapSize);
  requireFinite("errorTargetPixels", options.errorTargetPixels);
  requireFinite("normalBias", options.normalBias);
  if (options.maxShadowLights !== undefined)
    requireFinite("maxShadowLights", options.maxShadowLights);
  if (options.intensity < 0)
    throw new RangeError("intensity must be non-negative");
  if (options.range <= 0.5)
    throw new RangeError("range must be greater than the 0.5 near plane");
  if (options.shadowMapSize <= 0)
    throw new RangeError("shadowMapSize must be positive");
  if (options.errorTargetPixels <= 0)
    throw new RangeError("errorTargetPixels must be positive");
  if (options.normalBias < 0)
    throw new RangeError("normalBias must be non-negative");
  if (options.maxShadowLights !== undefined && options.maxShadowLights < 0)
    throw new RangeError("maxShadowLights must be non-negative");
  if (!options.positions.every(isFiniteVector))
    throw new RangeError("positions must be finite");

  const shadowMapSize = Math.max(1, Math.floor(options.shadowMapSize));
  const requestedShadowLights = Math.floor(options.maxShadowLights ?? 4);
  const rendererMaxTextures = layer.getRenderer()?.capabilities.maxTextures;
  const hardwareShadowCapacity =
    typeof rendererMaxTextures === "number" &&
    Number.isFinite(rendererMaxTextures)
      ? Math.max(0, Math.floor(rendererMaxTextures) - 8)
      : 4;
  const shadowLightCount = Math.min(
    options.positions.length,
    requestedShadowLights,
    hardwareShadowCapacity
  );
  const instancePrefix = `shared-scene-point-lights-${++nextInstanceId}`;
  const group = new THREE.Group();
  group.name = instancePrefix;
  const markerGeometry = new THREE.SphereGeometry(
    Math.max(0.25, options.range * 0.01),
    12,
    8
  );
  const lights: THREE.PointLight[] = [];
  const markers: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] =
    [];
  const cameras: { id: string; camera: THREE.PerspectiveCamera }[] = [];
  const camerasByLight: {
    id: string;
    camera: THREE.PerspectiveCamera;
  }[][] = options.positions.map(() => []);

  const updatePose = (index: number, position: THREE.Vector3): void => {
    lights[index].position.copy(position);
    markers[index].position.copy(position);
    for (
      let faceIndex = 0;
      faceIndex < camerasByLight[index].length;
      faceIndex += 1
    ) {
      const { direction, up } = CUBE_FACES[faceIndex];
      const camera = camerasByLight[index][faceIndex].camera;
      camera.position.copy(position);
      camera.up.set(...up);
      camera.lookAt(
        position.x + direction[0],
        position.y + direction[1],
        position.z + direction[2]
      );
      camera.updateMatrixWorld(true);
    }
  };

  options.positions.forEach((position, lightIndex) => {
    const color = options.colors?.length
      ? options.colors[lightIndex % options.colors.length]
      : 0xffffff;
    const light = new THREE.PointLight(color, options.intensity, options.range);
    light.castShadow = lightIndex < shadowLightCount;
    if (light.castShadow) {
      light.shadow.mapSize.set(shadowMapSize, shadowMapSize);
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = true;
      light.shadow.normalBias = options.normalBias;
      light.shadow.camera.near = 0.5;
      light.shadow.camera.far = options.range;
      light.shadow.camera.updateProjectionMatrix();
    }
    lights.push(light);
    group.add(light);

    const marker = new THREE.Mesh(
      markerGeometry,
      new THREE.MeshBasicMaterial({ color })
    );
    marker.name = `${instancePrefix}-marker-${lightIndex}`;
    marker.castShadow = false;
    marker.receiveShadow = false;
    markers.push(marker);
    group.add(marker);

    if (light.castShadow) {
      CUBE_FACES.forEach(({ name }) => {
        const id = `${instancePrefix}-${lightIndex}-${name}`;
        const camera = new THREE.PerspectiveCamera(90, 1, 0.5, options.range);
        const entry = { id, camera };
        cameras.push(entry);
        camerasByLight[lightIndex].push(entry);
        layer.setTileCameraView({
          id,
          camera,
          viewport: [shadowMapSize, shadowMapSize],
          errorTargetPixels: options.errorTargetPixels,
          role: TILE_CAMERA_ROLE.GEOMETRY,
        });
      });
    }
    updatePose(lightIndex, position);
  });

  layer.getScene().add(group);
  let disposed = false;

  return {
    setPosition(index, position) {
      if (disposed) return;
      if (!Number.isInteger(index) || index < 0 || index >= lights.length)
        throw new RangeError(`Invalid point-light index: ${index}`);
      if (!isFiniteVector(position))
        throw new RangeError("position must be finite");
      if (lights[index].position.equals(position)) return;
      updatePose(index, position);
      if (lights[index].castShadow) lights[index].shadow.needsUpdate = true;
    },
    invalidateShadows() {
      if (disposed) return;
      lights.forEach((light) => {
        if (light.castShadow) light.shadow.needsUpdate = true;
      });
    },
    getCameras: () => cameras,
    getShadowLightCount: () => shadowLightCount,
    dispose() {
      if (disposed) return;
      disposed = true;
      cameras.forEach(({ id }) => layer.removeTileCameraView(id));
      group.removeFromParent();
      lights.forEach((light) => light.shadow.dispose());
      markers.forEach((marker) => marker.material.dispose());
      markerGeometry.dispose();
    },
  };
};

export const sampleOrbitLightPosition = (
  center: THREE.Vector3,
  index: number,
  count: number,
  timeSeconds: number,
  options: PointLightOrbitOptions
): THREE.Vector3 => {
  if (!isFiniteVector(center)) throw new RangeError("center must be finite");
  [
    index,
    count,
    timeSeconds,
    options.radius,
    options.minHeight,
    options.maxHeight,
    options.periodSeconds,
  ].forEach((value, valueIndex) =>
    requireFinite(`orbit argument ${valueIndex}`, value)
  );
  if (!Number.isInteger(index) || index < 0)
    throw new RangeError("index must be a non-negative integer");
  if (!Number.isInteger(count) || count <= 0 || index >= count)
    throw new RangeError("count must contain index");
  if (options.radius <= 0) throw new RangeError("radius must be positive");
  if (options.periodSeconds <= 0)
    throw new RangeError("periodSeconds must be positive");
  if (options.maxHeight < options.minHeight)
    throw new RangeError("maxHeight must not be below minHeight");

  const phase = (index / count) * Math.PI * 2;
  const angle = (timeSeconds / options.periodSeconds) * Math.PI * 2 + phase;
  const middleHeight = (options.minHeight + options.maxHeight) / 2;
  const heightAmplitude = (options.maxHeight - options.minHeight) / 2;
  return new THREE.Vector3(
    center.x + Math.cos(angle) * options.radius,
    center.y + middleHeight + Math.sin(angle) * heightAmplitude,
    center.z + Math.sin(angle) * options.radius
  );
};
