import {
  AnimationClip,
  AnimationMixer,
  CatmullRomCurve3,
  LoopOnce,
  NumberKeyframeTrack,
  Vector3,
  type PerspectiveCamera,
} from "three";

/** Three-native, serializable path + animation. Coordinates are scene metres. */
export type CameraFlightPath = {
  curve: CatmullRomCurve3;
  /** May animate .quaternion, .fov and other camera properties. */
  clip: AnimationClip;
  target?: Vector3;
  duration: number;
};

export type CameraFlightPlayer = {
  sample: (seconds: number, manualFov?: number) => void;
  sampleAhead: (
    seconds: number,
    aheadMs: number,
    manualFov?: number
  ) => PerspectiveCamera;
  dispose: () => void;
};

/** Arc-length spline position; keyframes own lens/pose, or a fixed/tangent look target. */
export const createCameraFlightPlayer = (
  camera: PerspectiveCamera,
  path: CameraFlightPath
): CameraFlightPlayer => {
  if (!(path.duration > 0) || path.curve.points.length < 2)
    throw new Error("A camera flight needs a positive duration and two points");
  const mixer = new AnimationMixer(camera);
  const action = mixer.clipAction(path.clip);
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  const tangent = new Vector3();
  const target = new Vector3();
  let aheadCamera: PerspectiveCamera | undefined;
  let aheadPlayer: CameraFlightPlayer | undefined;
  const hasOrientation = path.clip.tracks.some((track) =>
    track.name.endsWith(".quaternion")
  );
  return {
    sample(seconds: number, manualFov?: number) {
      // Open routes return smoothly instead of teleporting at the loop boundary.
      const phase =
        ((seconds % (path.duration * 2)) + path.duration * 2) %
        (path.duration * 2);
      const u = (1 - Math.cos((phase * Math.PI) / path.duration)) / 2;
      action.paused = false;
      mixer.setTime(u * path.duration);
      path.curve.getPointAt(u, camera.position);
      if (!hasOrientation) {
        if (path.target) camera.lookAt(path.target);
        else {
          path.curve.getTangentAt(u, tangent);
          camera.lookAt(target.copy(camera.position).add(tangent));
        }
      }
      if (manualFov !== undefined) camera.fov = manualFov;
      camera.fov = Math.min(120, Math.max(5, camera.fov));
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
    },
    sampleAhead(seconds: number, aheadMs: number, manualFov?: number) {
      if (!Number.isFinite(seconds) || !Number.isFinite(aheadMs) || aheadMs < 0)
        throw new Error(
          "Camera flight sample times must be finite and aheadMs must be non-negative"
        );
      if (!aheadCamera) {
        aheadCamera = camera.clone();
        aheadPlayer = createCameraFlightPlayer(aheadCamera, path);
      }
      aheadCamera.copy(camera, false);
      aheadCamera.fov = camera.fov;
      aheadCamera.aspect = camera.aspect;
      aheadCamera.near = camera.near;
      aheadCamera.far = camera.far;
      aheadCamera.up.copy(camera.up);
      aheadCamera.zoom = camera.zoom;
      aheadCamera.filmGauge = camera.filmGauge;
      aheadCamera.filmOffset = camera.filmOffset;
      aheadCamera.view = camera.view ? { ...camera.view } : null;
      aheadPlayer!.sample(seconds + aheadMs / 1000, manualFov);
      return aheadCamera;
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(camera);
      aheadPlayer?.dispose();
      aheadCamera = undefined;
      aheadPlayer = undefined;
    },
  };
};

export const createCameraLensClip = (
  duration: number,
  values: readonly number[]
) =>
  new AnimationClip("camera-lens", duration, [
    new NumberKeyframeTrack(
      ".fov",
      values.map((_, i) => (i * duration) / Math.max(1, values.length - 1)),
      [...values]
    ),
  ]);
