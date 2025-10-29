import { LeafletLikeMap, LatLngZoom } from "../utils/leafletLikeMapUtils";
interface UseMapHashRoutingLeafletLikeOptions {
  leafletLikeMap: LeafletLikeMap;
  cesiumClearKeys?: string[];
  label?: string;
  pixelTolerance?: number;
  onAfterLocationChanged?: () => void;
}
export declare function useMapHashRoutingLeafletLike(
  enabled: boolean,
  {
    leafletLikeMap,
    cesiumClearKeys,
    label,
    pixelTolerance,
    onAfterLocationChanged,
  }: UseMapHashRoutingLeafletLikeOptions
): ({ lat, lng, zoom }: LatLngZoom) => void;
export {};
