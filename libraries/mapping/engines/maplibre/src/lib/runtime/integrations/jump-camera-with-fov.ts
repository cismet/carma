import type { JumpToOptions, Map as MapLibreMap } from "maplibre-gl";

/** Apply one complete camera frame without a separate FOV event lifecycle. */
export const jumpMapLibreCameraWithFov = (
  map: MapLibreMap,
  options: JumpToOptions,
  fovDeg: number,
  eventData?: Record<string, unknown>
): void => {
  const previousUpdate = map.transformCameraUpdate;
  const update: NonNullable<MapLibreMap["transformCameraUpdate"]> = (next) => {
    const result = previousUpdate?.call(map, next) ?? {};
    (next as MapLibreMap["transform"]).setFov(fovDeg);
    return result;
  };
  map.transformCameraUpdate = update;
  try {
    map.jumpTo(options, eventData);
  } finally {
    if (map.transformCameraUpdate === update)
      map.transformCameraUpdate = previousUpdate;
  }
};
