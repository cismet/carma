import * as THREE from "three";

import { radToDegNumeric } from "@carma-units";

import type { DzbPrmModelCollection } from "../ModelCollection/dzb-prm-collection";

/** The print uses 0.5 mm of vertical relief per real metre (WUPP #4123). */
export const PRINTED_HEIGHT_SCALE = 2_000;
export const DEFAULT_CAPTURE_HEIGHT_METERS = 2.3;
export const PROJECTOR_ASPECT_RATIO = 16 / 9;
export const PRINTED_BOARD_LONG_EDGE_METERS = 1.8;

/** Physical lens angle; GLB Y/X use different coordinate scales. */
export const getPrintedProjectorVerticalFov = (
  cameraHeightMeters: number
): number =>
  2 *
  Math.atan(
    PRINTED_BOARD_LONG_EDGE_METERS /
      (2 * PROJECTOR_ASPECT_RATIO * cameraHeightMeters)
  );

export const getPrintedBoardBounds = (
  collection: DzbPrmModelCollection
): THREE.Box3 => {
  const [west, south, east, north] = collection.boardBounds3857;
  const [anchorX, anchorY] = collection.anchor3857;
  const bottom = collection.boardBottomHeightMeters;
  return new THREE.Box3(
    new THREE.Vector3(west - anchorX, bottom, anchorY - north),
    new THREE.Vector3(east - anchorX, bottom, anchorY - south)
  );
};

/** Expand the board footprint to full 16:9; never insert letterbox pixels. */
export const fitPrintedCaptureBounds = (bounds: THREE.Box3): THREE.Box3 => {
  const fitted = bounds.clone();
  const size = fitted.getSize(new THREE.Vector3());
  if (size.x / size.z > PROJECTOR_ASPECT_RATIO) {
    fitted.expandByVector(
      new THREE.Vector3(0, 0, (size.x / PROJECTOR_ASPECT_RATIO - size.z) / 2)
    );
  } else {
    fitted.expandByVector(
      new THREE.Vector3((size.z * PROJECTOR_ASPECT_RATIO - size.x) / 2, 0, 0)
    );
  }
  return fitted;
};

/** Nadir perspective whose rays meet the board edges at the board-bottom plane. */
export const createPrintedModelCaptureCamera = (
  bounds: THREE.Box3,
  boardBottomHeightMeters: number,
  cameraHeightMeters: number
): THREE.PerspectiveCamera => {
  const fitted = fitPrintedCaptureBounds(bounds);
  const size = fitted.getSize(new THREE.Vector3());
  const center = fitted.getCenter(new THREE.Vector3());
  const worldHeight = cameraHeightMeters * PRINTED_HEIGHT_SCALE;
  const camera = new THREE.PerspectiveCamera(
    radToDegNumeric(2 * Math.atan(size.z / (2 * worldHeight))),
    PROJECTOR_ASPECT_RATIO,
    0.1,
    worldHeight + Math.max(size.y, 100) + 100
  );
  camera.up.set(0, 0, -1);
  camera.position.set(center.x, boardBottomHeightMeters + worldHeight, center.z);
  camera.lookAt(center.x, boardBottomHeightMeters, center.z);
  camera.updateMatrixWorld(true);
  return camera;
};
