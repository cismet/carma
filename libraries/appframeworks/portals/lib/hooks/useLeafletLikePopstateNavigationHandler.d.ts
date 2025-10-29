import { MutableRefObject } from "react";
import { LeafletLikeMap, LatLngZoom } from "../utils/leafletLikeMapUtils";
interface UseLeafletLikePopstateNavigationHandlerOptions {
  enabled: boolean;
  leafletLikeMap: LeafletLikeMap;
  navMoveInProgressRef: MutableRefObject<boolean>;
  popstateTargetRef: MutableRefObject<LatLngZoom | null>;
}
/**
 * Handles browser back/forward navigation by restoring the 2D map to historical locations
 * without writing new hash entries. Prevents feedback loops during popstate-driven navigation.
 */
export declare function useLeafletLikePopstateNavigationHandler({
  enabled,
  leafletLikeMap,
  navMoveInProgressRef,
  popstateTargetRef,
}: UseLeafletLikePopstateNavigationHandlerOptions): void;
export {};
