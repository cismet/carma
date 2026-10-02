import { Vector3 } from "three";
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
  xOffset: 0.5 - camera.principalPointPx[0] / camera.widthPx,
  yOffset: 0.5 - camera.principalPointPx[1] / camera.heightPx,
});
