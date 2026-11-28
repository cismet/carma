import type { MapStyleConfig } from "@carma-appframeworks/portals";

import { MapStyleKeys } from "../constants/MapStyleKeys";
import { backgroundConfig } from "./backgroundConfig";

export const geoportalMapStyleConfig: MapStyleConfig = {
  defaultStyle: backgroundConfig.defaultCategory,
  availableStyles: backgroundConfig.categories.map(
    (category) => category.id
  ),
};

export { MapStyleKeys };
