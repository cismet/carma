import { createNamespace } from "./create-namespace";

/** x, y, z in ECEF (EPSG:4978): meters from the earth's centre. */
export type EcefVector = [number, number, number];

/** A camera in ECEF: position (m), unit direction, unit screen-up (roll), vertical fov (rad). */
export type CameraPose = {
  position: EcefVector;
  direction: EcefVector;
  up: EcefVector;
  /** vertical field of view in radians */
  fovY: number;
};

export type CameraFlightOptions = {
  /** 0 jumps; default 1500 */
  durationMs?: number;
};

export type CameraLookAtOptions = CameraFlightOptions & {
  /** vertical field of view in radians; the current one when omitted */
  fovY?: number;
};

/** Registered by the mounted 3D view; the facade no-ops without one. */
export interface CameraAdapter {
  getPose?: () => CameraPose | null;
  setPose?: (pose: CameraPose) => boolean;
  flyToPose?: (
    pose: CameraPose,
    options?: CameraFlightOptions
  ) => Promise<boolean>;
  lookAt?: (
    eye: EcefVector,
    target: EcefVector,
    options?: CameraLookAtOptions
  ) => Promise<boolean>;
  stop?: () => void;
}

/** The 3D camera as one ECEF pose that can be stored, shared between engines and morphed. */
export interface CameraFacade {
  isAvailable: () => boolean;
  /** the camera as the last frame drew it; null without a 3D view */
  getPose: () => CameraPose | null;
  /** jump there; false when the view cannot place the pose */
  setPose: (pose: CameraPose) => boolean;
  /** Morph position (along the ellipsoid), orientation and fov; true on arrival. */
  flyToPose: (
    pose: CameraPose,
    options?: CameraFlightOptions
  ) => Promise<boolean>;
  /** an upright pose at the eye looking at the target, flown to or jumped to */
  lookAt: (
    eye: EcefVector,
    target: EcefVector,
    options?: CameraLookAtOptions
  ) => Promise<boolean>;
  /** stop a running flight where it is */
  stop: () => void;
}

export const { facade: camera, register: registerCamera } = createNamespace<
  CameraAdapter,
  CameraFacade
>((get) => ({
  isAvailable: () => get() !== null,
  getPose: () => get()?.getPose?.() ?? null,
  setPose: (pose) => get()?.setPose?.(pose) ?? false,
  flyToPose: (pose, options) =>
    get()?.flyToPose?.(pose, options) ?? Promise.resolve(false),
  lookAt: (eye, target, options) =>
    get()?.lookAt?.(eye, target, options) ?? Promise.resolve(false),
  stop: () => get()?.stop?.(),
}));
