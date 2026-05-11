import {
  CARMA_ZOOM_DEFAULTS,
  getMaplibreZoomFromSourceZoom,
  getMaplibreZoomRangeFromSourceZoomRange,
} from "@carma-appframeworks/portals";
import { getZoomConventionTileSize } from "@carma-geo/utils";

export interface CarmaMaplibreMapDefaults {
  tileSize: number;
  zoomMin: number;
  zoomMax: number;
  zoomDefault: number;
}

export const CARMA_MAPLIBRE_MAP_DEFAULTS = {
  ...getMaplibreZoomRangeFromSourceZoomRange(
    CARMA_ZOOM_DEFAULTS,
    CARMA_ZOOM_DEFAULTS
  ),
  tileSize: getZoomConventionTileSize(CARMA_ZOOM_DEFAULTS.maplibreZoom),
  zoomDefault: getMaplibreZoomFromSourceZoom(
    CARMA_ZOOM_DEFAULTS.zoomDefault,
    CARMA_ZOOM_DEFAULTS
  ),
} as const satisfies CarmaMaplibreMapDefaults;
