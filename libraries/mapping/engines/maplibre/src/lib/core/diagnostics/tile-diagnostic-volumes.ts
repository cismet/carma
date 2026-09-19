import * as THREE from "three";
import type { SharedThreeSceneTileVolume } from "../shared-three-scene-types";
import type { TileCameraSnapshot } from "../tile-camera-demand";
import type {
  Kind,
  OverlayModel,
  OverlayVolume,
} from "./tile-diagnostic-model";

export const frustumOf = (
  projectionMatrix: THREE.Matrix4,
  matrixWorld: THREE.Matrix4,
  coordinateSystem: THREE.Camera["coordinateSystem"],
  reversedDepth: boolean
) =>
  new THREE.Frustum().setFromProjectionMatrix(
    projectionMatrix.clone().multiply(matrixWorld.clone().invert()),
    coordinateSystem,
    reversedDepth
  );

const VOLUME_KINDS: Record<string, Kind> = {
  queued: "queued",
  loading: "loading",
  parsing: "parsing",
  failed: "failed",
};

/** A 2.5D tile is a box: its footprint over the elevation range it covers. */
export const projectDiagnosticVolumes = (
  volumes: readonly SharedThreeSceneTileVolume[],
  worldToOverview: THREE.Matrix4,
  toScreen: (x: number, z: number) => [number, number],
  mainFrustum: THREE.Frustum | null,
  shadowFrustum: THREE.Frustum | null
): OverlayVolume[] => {
  const world = new THREE.Box3();
  const overview = new THREE.Box3();
  const out: OverlayVolume[] = [];
  for (const volume of volumes) {
    world.min.fromArray(volume.minimum);
    world.max.fromArray(volume.maximum);
    if (
      !Number.isFinite(world.min.x + world.min.y + world.min.z) ||
      !Number.isFinite(world.max.x + world.max.y + world.max.z) ||
      world.isEmpty()
    )
      continue;
    const inView = mainFrustum ? mainFrustum.intersectsBox(world) : true;
    const inShadow = shadowFrustum ? shadowFrustum.intersectsBox(world) : false;
    overview.copy(world).applyMatrix4(worldToOverview);
    const [x0, y0] = toScreen(overview.min.x, overview.min.z);
    const [x1, y1] = toScreen(overview.max.x, overview.max.z);
    const state = volume.state ?? "loaded";
    out.push({
      id: volume.id,
      world: world.clone(),
      x: Math.min(x0, x1),
      y: Math.min(y0, y1),
      w: Math.abs(x1 - x0),
      h: Math.abs(y1 - y0),
      kind:
        VOLUME_KINDS[state] ??
        (volume.loadReason === "shadow" ? "resident" : "displayed"),
      phase:
        state === "loaded"
          ? "\u25cf"
          : state === "queued"
          ? "\u25cb"
          : "\u25d0",
      inView,
      inShadow,
      error: volume.errorPixels ?? NaN,
    });
  }
  return out;
};

export const frustumFromSnapshot = (
  camera: TileCameraSnapshot | null | undefined
): THREE.Frustum | null =>
  camera
    ? frustumOf(
        new THREE.Matrix4().fromArray(camera.projectionMatrix),
        new THREE.Matrix4().fromArray(camera.matrixWorld),
        camera.coordinateSystem,
        camera.reversedDepth
      )
    : null;

export type VolumeOverlayModelInput = {
  volumes: readonly SharedThreeSceneTileVolume[];
  camera: TileCameraSnapshot | null;
  shadowCamera: TileCameraSnapshot | null;
  width: number;
  height: number;
  target?: number;
};

/**
 * The overview of a source that has no tile tree to frame it: the union of the
 * volumes is the extent and the scene's own x/z plane is the overview plane, so
 * terrain alone can be inspected without a 3D Tiles runtime to attach to.
 */
export const buildVolumeOverlayModel = ({
  volumes,
  camera,
  shadowCamera,
  width,
  height,
  target = 1,
}: VolumeOverlayModelInput): OverlayModel | null => {
  if (width <= 48 || height <= 48) return null;
  const extent = new THREE.Box3();
  const box = new THREE.Box3();
  for (const volume of volumes) {
    box.min.fromArray(volume.minimum);
    box.max.fromArray(volume.maximum);
    if (
      !Number.isFinite(box.min.x + box.min.y + box.min.z) ||
      !Number.isFinite(box.max.x + box.max.y + box.max.z) ||
      box.isEmpty()
    )
      continue;
    extent.union(box);
  }
  if (extent.isEmpty()) return null;
  const margin = 24;
  const spanX = Math.max(extent.max.x - extent.min.x, 1e-6);
  const spanZ = Math.max(extent.max.z - extent.min.z, 1e-6);
  const scale = Math.min(
    (width - 2 * margin) / spanX,
    (height - 2 * margin) / spanZ
  );
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanZ * scale) / 2;
  const toScreen = (x: number, z: number): [number, number] => [
    offsetX + (x - extent.min.x) * scale,
    offsetY + (z - extent.min.z) * scale,
  ];
  const worldToOverview = new THREE.Matrix4();
  const projected = projectDiagnosticVolumes(
    volumes,
    worldToOverview,
    toScreen,
    frustumFromSnapshot(camera),
    frustumFromSnapshot(shadowCamera)
  );
  const [ex0, ey0] = toScreen(extent.min.x, extent.min.z);
  const [ex1, ey1] = toScreen(extent.max.x, extent.max.z);
  return {
    width,
    height,
    extent: { x: ex0, y: ey0, w: ex1 - ex0, h: ey1 - ey0 },
    intersectionEdges: null,
    centerHit: null,
    footprintBounds: null,
    rects: [],
    volumes: projected,
    viewportBasis: {
      bounds: [...extent.min.toArray(), ...extent.max.toArray()],
      worldToOverview: worldToOverview.toArray(),
      screen: [
        scale,
        offsetX - extent.min.x * scale,
        offsetY - extent.min.z * scale,
      ],
      width,
      height,
    },
    target,
  };
};
