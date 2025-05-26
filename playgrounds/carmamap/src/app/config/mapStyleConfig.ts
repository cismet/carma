import type { MapStyleConfig } from "@carma-apps/portals";
import { MapStyleKeys } from "../constants/MapStyleKeys";

export const carmaMapStyleConfig: MapStyleConfig = {
  initialStyle: MapStyleKeys.TOPO,
  availableStyles: [
    MapStyleKeys.TOPO,
    MapStyleKeys.AERIAL,
  ] as const,
};
