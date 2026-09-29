import * as THREE from "three";

import type { SharedThreeSceneRuntime } from "@carma-mapping/engines/maplibre";

import { SHADOW_SCENE_USER_DATA } from "./shadow-types";

/** Maximum radius represented by the fitted shadow buffer. */
const MAX_RECEIVER_DISTANCE_METERS = 4_000;

export const getVisibleSceneElevationRange = (
  scene: THREE.Scene,
  fallbackElevation: number,
  viewCamera?: THREE.Camera
): readonly [number, number] => {
  scene.updateMatrixWorld(true);
  viewCamera?.updateMatrixWorld(true);
  const viewFrustum = viewCamera
    ? new THREE.Frustum().setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(
          viewCamera.projectionMatrix,
          viewCamera.matrixWorldInverse
        ),
        viewCamera.coordinateSystem,
        viewCamera.reversedDepth
      )
    : null;
  let minimum = fallbackElevation;
  let maximum = fallbackElevation;
  const worldBounds = new THREE.Box3();
  scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (
      mesh.userData[SHADOW_SCENE_USER_DATA.OVERLAY] ||
      (!mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh) ||
      !mesh.geometry?.getAttribute("position")?.count
    ) {
      return;
    }
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    if (!mesh.geometry.boundingBox) return;
    worldBounds.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
    if (viewFrustum && !viewFrustum.intersectsBox(worldBounds)) return;
    minimum = Math.min(minimum, worldBounds.min.y);
    maximum = Math.max(maximum, worldBounds.max.y);
  });
  return [minimum, maximum];
};

export const getViewElevationRange = (
  scene: THREE.Scene,
  runtimes: readonly SharedThreeSceneRuntime[],
  camera: THREE.Camera,
  fallbackElevation: number
): readonly [number, number] => {
  const surfaceRanges = runtimes
    .filter((runtime) => runtime.providesTerrain)
    .flatMap((runtime) => {
      const range = runtime.getViewElevationRange?.(camera);
      return range ? [range] : [];
    });
  // Terrain-owning runtimes know their visible cut. Scanning the whole scene
  // also includes retained ancestor/caster meshes with city-wide bounding boxes.
  if (surfaceRanges.length > 0)
    return [
      Math.min(...surfaceRanges.map((range) => range[0])),
      Math.max(...surfaceRanges.map((range) => range[1])),
    ];
  let [minimum, maximum] = getVisibleSceneElevationRange(
    scene,
    fallbackElevation,
    camera
  );
  for (const runtime of runtimes) {
    const range = runtime.getViewElevationRange?.(camera);
    if (!range) continue;
    minimum = Math.min(minimum, range[0]);
    maximum = Math.max(maximum, range[1]);
  }
  return [minimum, maximum];
};

const VIEWPORT_NDC_CORNERS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const;

const FRUSTUM_EDGE_VERTEX_INDICES = [
  [0, 1],
  [1, 3],
  [3, 2],
  [2, 0],
  [4, 5],
  [5, 7],
  [7, 6],
  [6, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
] as const;

export const getViewportElevationEnvelopePoints = (
  camera: THREE.Camera,
  minimumElevationMeters: number,
  maximumElevationMeters: number,
  anchor: THREE.Vector3
): THREE.Vector3[] => {
  camera.updateMatrixWorld(true);
  const minimumElevation = Math.min(
    minimumElevationMeters,
    maximumElevationMeters
  );
  const maximumElevation = Math.max(
    minimumElevationMeters,
    maximumElevationMeters
  );
  const frustumVertices = [-1, 1].flatMap((z) =>
    VIEWPORT_NDC_CORNERS.map(([x, y]) =>
      new THREE.Vector3(x, y, z).unproject(camera)
    )
  );
  const points = frustumVertices
    .filter(
      (point) => point.y >= minimumElevation && point.y <= maximumElevation
    )
    .map((point) => point.clone());

  for (const [startIndex, endIndex] of FRUSTUM_EDGE_VERTEX_INDICES) {
    const start = frustumVertices[startIndex];
    const end = frustumVertices[endIndex];
    const elevationDelta = end.y - start.y;
    if (Math.abs(elevationDelta) <= Number.EPSILON) continue;
    for (const elevation of [minimumElevation, maximumElevation]) {
      const interpolation = (elevation - start.y) / elevationDelta;
      if (interpolation < 0 || interpolation > 1) continue;
      points.push(start.clone().lerp(end, interpolation));
    }
  }

  for (const point of points) {
    const offset = point.clone().sub(anchor);
    const horizontalDistance = Math.hypot(offset.x, offset.z);
    if (horizontalDistance <= MAX_RECEIVER_DISTANCE_METERS) continue;
    const scale = MAX_RECEIVER_DISTANCE_METERS / horizontalDistance;
    offset.x *= scale;
    offset.z *= scale;
    point.copy(anchor).add(offset);
  }

  return points;
};
