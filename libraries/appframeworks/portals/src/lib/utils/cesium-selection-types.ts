import type { CesiumOptions } from "@carma-mapping/engines/cesium/legacy";

export type HitTriggerOptions = {
  mapOptions: CesiumOptions;
  duration: number; // duration for flyTo
  durationFactor?: number; // dynamic flyTo duration factor,
  selectedPolygonId?: string;
  invertedSelectedPolygonId?: string;
  skipFlyTo?: boolean;
  skipMarkerUpdate?: boolean;
  flyToCameraHeight?: number | null;
};
