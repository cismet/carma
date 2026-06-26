import type { MapStyleConfig } from "@carma-appframeworks/portals";
import { MapStyleKeys } from "../constants/MapStyleKeys";

export const geoportalMapStyleConfig: MapStyleConfig = {
  defaultStyle: MapStyleKeys.TOPO,
  availableStyles: [MapStyleKeys.TOPO, MapStyleKeys.AERIAL] as const,
};

export const geoportalCesiumSceneStyleByMapStyle: Record<
  MapStyleKeys,
  MapStyleKeys
> = {
  [MapStyleKeys.TOPO]: MapStyleKeys.TOPO,
  [MapStyleKeys.AERIAL]: MapStyleKeys.AERIAL,
};

export { MapStyleKeys };
