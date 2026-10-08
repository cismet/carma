import type { EaseToOptions, Map as MapLibreMap } from "maplibre-gl";

/** One native camera flight, including FOV, with one motion event lifecycle. */
export const easeMapLibreCameraWithFov = (
  map: MapLibreMap,
  options: EaseToOptions,
  targetFovDeg: number
): { done: Promise<void>; cancel: () => void } => {
  map.stop();
  const fromFov = map.getVerticalFieldOfView();
  const previousUpdate = map.transformCameraUpdate;
  const easing = options.easing ?? ((t: number) => t);
  // Immediate/reduced-motion eases bypass the easing callback and apply the end frame.
  let progress = 1;
  let finished = false;
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  // MapLibre passes an ITransform clone here and applies it after this hook.
  // Its public callback type exposes only the camera fields, not setFov.
  // Updating that clone avoids setVerticalFieldOfView's extra start/end events.
  const update: NonNullable<MapLibreMap["transformCameraUpdate"]> = (next) => {
    const result = previousUpdate?.call(map, next) ?? {};
    if (!finished)
      (next as MapLibreMap["transform"]).setFov(
        fromFov + (targetFovDeg - fromFov) * progress
      );
    return result;
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    map.off("moveend", finish);
    map.off("remove", finish);
    if (map.transformCameraUpdate === update)
      map.transformCameraUpdate = previousUpdate;
    resolveDone();
  };
  map.transformCameraUpdate = update;
  map.on("moveend", finish);
  map.on("remove", finish);
  try {
    map.easeTo({
      ...options,
      easing: (t) => {
        progress = easing(t);
        return progress;
      },
    });
  } catch (error) {
    finish();
    throw error;
  }
  return {
    done,
    cancel: () => {
      if (finished) return;
      finish();
      map.stop();
    },
  };
};
