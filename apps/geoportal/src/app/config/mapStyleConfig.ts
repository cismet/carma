import type { MapStyleConfig } from "@carma-appframeworks/portals";
import { MapStyleKeys } from "../constants/MapStyleKeys";

export const geoportalMapStyleConfig: MapStyleConfig = {
  defaultStyle: MapStyleKeys.TOPO,
  availableStyles: [MapStyleKeys.TOPO, MapStyleKeys.AERIAL] as const,
};

export { MapStyleKeys };
