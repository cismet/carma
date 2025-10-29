import { MutableRefObject } from "react";
import { LatLngZoom } from "../utils/leafletLikeMapUtils";
interface UseLeafletLikeChangeHandlerOptions {
  navMoveInProgressRef: MutableRefObject<boolean>;
  popstateTargetRef: MutableRefObject<LatLngZoom | null>;
  cesiumClearKeys?: string[];
  label?: string;
  pixelTolerance?: number;
  onAfterLocationChanged?: () => void;
}
/**
 * Hook that creates a handler for Leaflet-like map location changes that writes to the URL hash.
 * Implements tolerance-based deduplication to avoid writing nearly identical coordinates.
 */
export declare function useLeafletLikeChangeHandler({
  navMoveInProgressRef,
  popstateTargetRef,
  cesiumClearKeys,
  label,
  pixelTolerance,
  onAfterLocationChanged,
}: UseLeafletLikeChangeHandlerOptions): ({
  lat,
  lng,
  zoom,
}: LatLngZoom) => void;
export {};
