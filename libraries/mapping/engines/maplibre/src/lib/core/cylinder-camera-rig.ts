import { OrthographicCamera, PerspectiveCamera, Plane, Vector3 } from "three";
import { radToDegNumeric } from "@carma-units";
import {
  type CameraRigView,
  finitePositive,
  assertFiniteVector,
} from "./camera-rig-contract";

export const CYLINDER_CAMERA_RIG_MODE = {
  PANORAMA: "panorama",
  OBJECT_COVER: "object-cover",
} as const;

export type CylinderCameraRigMode =
  (typeof CYLINDER_CAMERA_RIG_MODE)[keyof typeof CYLINDER_CAMERA_RIG_MODE];

export const createCylinderCameraRig = ({
  center,
  radius,
  height,
  count,
  mode,
  aspect,
  near,
  far,
  verticalFieldOfView,
  pitch = 0,
  referenceDepth,
}: Readonly<{
  center: Vector3;
  radius: number;
  height: number;
  count: number;
  mode: CylinderCameraRigMode;
  aspect: number;
  near: number;
  far: number;
  /**
   * Nominal symmetric vertical field of view in radians, before lens shift.
   * With pitch, the angular endpoints are asymmetric around the shifted horizon.
   */
  verticalFieldOfView?: number;
  /** Vertical lens shift expressed as a horizon angle in radians. */
  pitch?: number;
  /** Inward orthographic reference wall depth from the camera cylinder.
   * Defaults to half the radius. Perspective panoramas use their tangent wall. */
  referenceDepth?: number;
}>): CameraRigView[] => {
  assertFiniteVector(center, "Center");
  if (
    !Number.isInteger(count) ||
    count < 3 ||
    ![radius, height, aspect, near, far].every(finitePositive) ||
    far <= near ||
    !Number.isFinite(pitch) ||
    Math.abs(pitch) >= Math.PI / 2 ||
    (verticalFieldOfView !== undefined &&
      (!finitePositive(verticalFieldOfView) ||
        verticalFieldOfView >= Math.PI)) ||
    (mode !== CYLINDER_CAMERA_RIG_MODE.PANORAMA &&
      mode !== CYLINDER_CAMERA_RIG_MODE.OBJECT_COVER)
  )
    throw new Error("Invalid cylinder camera rig options");

  const horizontalFieldOfView = (Math.PI * 2) / count;
  const objectDepth = referenceDepth ?? radius / 2;
  if (
    mode === CYLINDER_CAMERA_RIG_MODE.OBJECT_COVER &&
    (!Number.isFinite(objectDepth) ||
      objectDepth <= near ||
      objectDepth >= Math.min(radius, far))
  )
    throw new Error(
      "Object reference wall must be inside the camera cylinder and its depth range"
    );
  // The inward wall's apothem is radius-depth, not radius. Using the outer
  // cylinder width at the centre made all image planes cross one another.
  const width = 2 * (radius - objectDepth) * Math.tan(Math.PI / count);
  return Array.from({ length: count }, (_, index) => {
    const angle = index * horizontalFieldOfView;
    const outward = new Vector3(Math.cos(angle), 0, Math.sin(angle));
    const tangentPoint = center.clone().addScaledVector(outward, radius);
    let camera: PerspectiveCamera | OrthographicCamera;
    let clipPlane: Plane;
    if (mode === CYLINDER_CAMERA_RIG_MODE.PANORAMA) {
      const verticalFov =
        verticalFieldOfView ??
        2 * Math.atan(Math.tan(horizontalFieldOfView / 2) / aspect);
      const sliceAspect =
        Math.tan(horizontalFieldOfView / 2) / Math.tan(verticalFov / 2);
      camera = new PerspectiveCamera(
        radToDegNumeric(verticalFov)!,
        sliceAspect,
        near,
        far
      );
      camera.position.copy(center);
      camera.lookAt(center.clone().add(outward));
      // Decision: shift parallel vertical image planes, rather than tilting
      // each segment independently and opening seams above/below the horizon.
      if (pitch !== 0)
        camera.setViewOffset(
          sliceAspect,
          1,
          0,
          -Math.tan(pitch) / (2 * Math.tan(verticalFov / 2)),
          sliceAspect,
          1
        );
      clipPlane = new Plane().setFromNormalAndCoplanarPoint(
        outward,
        tangentPoint
      );
    } else {
      camera = new OrthographicCamera(
        -width / 2,
        width / 2,
        height / 2,
        -height / 2,
        near,
        far
      );
      camera.position.copy(tangentPoint);
      camera.lookAt(center);
      clipPlane = new Plane().setFromNormalAndCoplanarPoint(
        outward.clone().negate(),
        tangentPoint
      );
    }
    camera.updateProjectionMatrix();
    camera.updateWorldMatrix(true, false);
    return {
      id: `cylinder-${mode}-${index}`,
      camera,
      clipPlanes: [clipPlane],
      distance:
        mode === CYLINDER_CAMERA_RIG_MODE.PANORAMA ? radius : objectDepth,
      imagePlaneVerticalOffset:
        mode === CYLINDER_CAMERA_RIG_MODE.PANORAMA
          ? radius * Math.tan(pitch)
          : 0,
    };
  });
};
