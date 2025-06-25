import type { MapStyleConfig } from "@carma-apps/portals";
import { MapStyleKeys } from "../constants/MapStyleKeys";

export const geoportalMapStyleConfig: MapStyleConfig = {
  defaultStyle: MapStyleKeys.TOPO,
  availableStyles: [MapStyleKeys.TOPO, MapStyleKeys.AERIAL] as const,
};

export { MapStyleKeys };
