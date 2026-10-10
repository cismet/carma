import { Vector3 } from "three";
import type { Radians } from "@carma-units";
import type {
  InteriorOrientationOffset,
  ObliqueCameraCalibration,
  ObliqueDataset,
  ObliqueMetadataCamera,
} from "../types";

/** Source mounting rotation is retained; the affine already defines delivered pixels. */
export const calibrationFromMetadata = (
  camera: ObliqueMetadataCamera
): ObliqueCameraCalibration => {
  const { widthPx, heightPx, focalLengthMm, imageMmToPixelAffine } = camera;
  const [[a, b, cx], [d, e, cy]] = imageMmToPixelAffine;
  const determinant = a * e - b * d;
  if (
    ![
      widthPx,
      heightPx,
      focalLengthMm,
      a,
      b,
      cx,
      d,
      e,
      cy,
      camera.mountRotationDeg,
    ].every(Number.isFinite) ||
    widthPx <= 0 ||
    heightPx <= 0 ||
    focalLengthMm <= 0 ||
    Math.abs(determinant) < 1e-12
  ) {
    throw new Error(
      "Invalid image-mm calibration affine or sensor dimensions."
    );
  }
  // Inverse linear affine applied to the top-of-image pixel vector (0, -1).
  const up = new Vector3(b / determinant, -a / determinant, 0).normalize();
  const dominantRow = Math.abs(up.x) > Math.abs(up.y) ? 0 : 1;
  const dominantComponent = dominantRow === 0 ? up.x : up.y;
  return {
    ...camera,
    principalPointPx: [cx, cy],
    halfFovTan: Math.max(
      widthPx / (2 * focalLengthMm * Math.hypot(a, b)),
      heightPx / (2 * focalLengthMm * Math.hypot(d, e))
    ),
    upMapping: { rowIndex: dominantRow, negate: dominantComponent > 0 },
    imageUpInCamera: up.toArray() as [number, number, number],
  };
};

export const getCameraCalibration = (
  dataset: ObliqueDataset,
  cameraId: string
): ObliqueCameraCalibration => {
  const camera = dataset.cameras[cameraId];
  if (!camera)
    throw new Error(`Unknown camera ${cameraId} in series ${dataset.id}.`);
  return camera;
};

export const calibrationImageOffset = (
  camera: ObliqueCameraCalibration
): InteriorOrientationOffset => ({
  xOffset: 0.5 - (camera.principalPointPx[0] + 0.5) / camera.widthPx,
  yOffset: 0.5 - (camera.principalPointPx[1] + 0.5) / camera.heightPx,
});

/**
 * Pitch from the optical axis to the ray through the delivered image centre,
 * for a level camera. Shifted sensors (2026 left/right) look about 4 degrees
 * steeper at their image centre than along their axis; browsing must match
 * the image centres, not the axes, or footprints appear visibly draped.
 */
export const imageCenterPitchOffsetRad = (
  camera: ObliqueCameraCalibration
): Radians => {
  // Partial calibrations carry no offset information; keep their axis pitch.
  if (!camera.principalPointPx || !(camera.widthPx > 0 && camera.heightPx > 0))
    return 0 as Radians;
  const [cx, cy] = camera.principalPointPx;
  // Pixel-centre coordinates: the delivered image centre is ((w - 1) / 2, (h - 1) / 2).
  const dx = (camera.widthPx - 1) / 2 - cx,
    dy = (camera.heightPx - 1) / 2 - cy;
  const affine = camera.imageMmToPixelAffine;
  if (affine && camera.imageUpInCamera) {
    const [[a, b], [d, e]] = affine;
    const determinant = a * e - b * d;
    const [upX, upY] = camera.imageUpInCamera;
    const xMm = (e * dx - b * dy) / determinant,
      yMm = (-d * dx + a * dy) / determinant;
    return Math.atan2(xMm * upX + yMm * upY, camera.focalLengthMm) as Radians;
  }
  if (!(camera.halfFovTan > 0)) return 0 as Radians;
  // Legacy calibrations: pixel rows grow downwards from the image top.
  const focalPx =
    Math.max(camera.widthPx, camera.heightPx) / (2 * camera.halfFovTan);
  return Math.atan2(-dy, focalPx) as Radians;
};
