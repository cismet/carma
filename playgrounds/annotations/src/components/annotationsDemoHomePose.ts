import {
  readSceneStateFromMapLibrePlusElevationHashValues,
  type SceneStateHashSnapshot,
} from "@carma-providers/hash-state";

const FALLBACK_VIEWPORT_WIDTH_PX = 1920;
const FALLBACK_VIEWPORT_HEIGHT_PX = 1080;

const ANNOTATIONS_DEMO_HOME_POSE_VALUES = {
  lat: 51.2696499,
  lng: 7.1960888,
  zoom: 16.994,
  bearing: 3.23,
  pitch: 58.73,
  altitude: 149.95,
} as const;

export const readAnnotationsDemoHomeSnapshot = ({
  viewportWidthPx,
  viewportHeightPx,
}: {
  viewportWidthPx?: number;
  viewportHeightPx?: number;
} = {}): SceneStateHashSnapshot | null =>
  readSceneStateFromMapLibrePlusElevationHashValues({
    values: ANNOTATIONS_DEMO_HOME_POSE_VALUES,
    viewportWidthPx:
      typeof viewportWidthPx === "number" && Number.isFinite(viewportWidthPx)
        ? viewportWidthPx
        : FALLBACK_VIEWPORT_WIDTH_PX,
    viewportHeightPx:
      typeof viewportHeightPx === "number" && Number.isFinite(viewportHeightPx)
        ? viewportHeightPx
        : FALLBACK_VIEWPORT_HEIGHT_PX,
  });
