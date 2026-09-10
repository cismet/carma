import * as THREE from "three";

import { shadowReceiverCorners } from "./shadow-page-plan";

export type ShadowReceiverCapturePlan = Readonly<{
  camera: THREE.OrthographicCamera;
  width: number;
  height: number;
  key: string;
  limited: boolean;
}>;

const captureKey = (camera: THREE.Camera, width: number, height: number) =>
  JSON.stringify([
    camera.matrixWorldInverse.elements,
    camera.projectionMatrix.elements,
    width,
    height,
  ]);

/** Admit the complete visible set, not N independently affordable captures.
 * Quantized screen-area weights prefer pages with more actual screen coverage;
 * stable ID ties avoid arrival-order changes. Only scalar/depth capture buffers
 * shrink; receiver geometry, projection and the display framebuffer are intact.
 */
export const budgetShadowReceiverCaptures = (
  entries: readonly Readonly<{
    id: string;
    plan: ShadowReceiverCapturePlan;
    screenArea: number;
  }>[],
  maximumBytes: number
): ReadonlyMap<string, ShadowReceiverCapturePlan> => {
  if (!Number.isFinite(maximumBytes) || maximumBytes < entries.length * 8)
    throw new RangeError(
      "Capture budget must fit at least one scalar/depth pixel per page"
    );
  const allocations = [...entries]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(({ id, plan, screenArea }) => ({
      id,
      plan,
      width: plan.width,
      height: plan.height,
      weight:
        2 **
        Math.floor(Math.log2(Math.max(1 / 65536, Math.min(1, screenArea)))),
    }));
  let pixels = allocations.reduce(
    (sum, page) => sum + page.width * page.height,
    0
  );
  while (pixels * 8 > maximumBytes) {
    let selected: (typeof allocations)[number] | undefined;
    for (const page of allocations) {
      if (page.width === 1 && page.height === 1) continue;
      if (
        !selected ||
        (page.width * page.height) / page.weight >
          (selected.width * selected.height) / selected.weight
      )
        selected = page;
    }
    if (!selected) break;
    const previousPixels = selected.width * selected.height;
    if (selected.width >= selected.height && selected.width > 1)
      selected.width /= 2;
    else selected.height /= 2;
    pixels -= previousPixels - selected.width * selected.height;
  }
  return new Map(
    allocations.map(({ id, plan, width, height }) => [
      id,
      width === plan.width && height === plan.height
        ? plan
        : {
            ...plan,
            width,
            height,
            limited: true,
            key: captureKey(plan.camera, width, height),
          },
    ])
  );
};

/** A complete receiver, projected independently of the observer's translation.
 * Direction changes are real capture dependencies: one depth layer cannot
 * invent newly visible walls. The live presentation rejects disoccluded pixels
 * until this new direction is published; never mark the old capture complete.
 */
export const fitShadowReceiverCapture = (
  bounds: THREE.Box3,
  orientation: THREE.Quaternion,
  options: Readonly<{
    groundTexelTargetMeters: number;
    maximumDimension: number;
    maximumPixels: number;
  }>
): ShadowReceiverCapturePlan => {
  const { groundTexelTargetMeters, maximumDimension, maximumPixels } = options;
  if (
    bounds.isEmpty() ||
    ![
      ...bounds.min.toArray(),
      ...bounds.max.toArray(),
      ...orientation.toArray(),
    ].every(Number.isFinite) ||
    !(
      groundTexelTargetMeters > 0 && Number.isFinite(groundTexelTargetMeters)
    ) ||
    !(maximumDimension >= 1 && Number.isFinite(maximumDimension)) ||
    !(maximumPixels >= 1 && Number.isFinite(maximumPixels))
  )
    throw new RangeError(
      "Receiver capture requires finite bounds and positive allocation limits"
    );

  const center = bounds.getCenter(new THREE.Vector3());
  const radius = bounds.getSize(new THREE.Vector3()).length() * 0.5;
  const padding = Math.max(0.001, radius * 0.001);
  const camera = new THREE.OrthographicCamera();
  camera.quaternion.copy(orientation).normalize();
  camera.position
    .copy(center)
    .add(
      new THREE.Vector3(0, 0, radius + padding + 1).applyQuaternion(
        camera.quaternion
      )
    );
  camera.updateMatrixWorld(true);
  const localBounds = new THREE.Box3().setFromPoints(
    shadowReceiverCorners(bounds).map((point) =>
      point.applyMatrix4(camera.matrixWorldInverse)
    )
  );
  camera.left = localBounds.min.x - padding;
  camera.right = localBounds.max.x + padding;
  camera.bottom = localBounds.min.y - padding;
  camera.top = localBounds.max.y + padding;
  camera.near = Math.max(0.001, -localBounds.max.z - padding);
  camera.far = Math.max(camera.near + 0.001, -localBounds.min.z + padding);
  camera.updateProjectionMatrix();

  const sizeClass = (extent: number) =>
    2 ** Math.ceil(Math.log2(Math.max(1, extent / groundTexelTargetMeters)));
  const requestedWidth = sizeClass(camera.right - camera.left);
  const requestedHeight = sizeClass(camera.top - camera.bottom);
  const dimensionLimit = 2 ** Math.floor(Math.log2(maximumDimension));
  let width = Math.min(requestedWidth, dimensionLimit);
  let height = Math.min(requestedHeight, dimensionLimit);
  while (width * height > maximumPixels) {
    if (width >= height && width > 1) width /= 2;
    else height /= 2;
  }
  return {
    camera,
    width,
    height,
    limited: width < requestedWidth || height < requestedHeight,
    key: captureKey(camera, width, height),
  };
};

/** Use the camera basis only, never its translated position. */
export const shadowReceiverCaptureOrientation = (
  camera: THREE.Camera
): THREE.Quaternion =>
  new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().extractRotation(camera.matrixWorld)
  );
