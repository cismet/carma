import type { MapStyleConfig } from "@carma-appframeworks/portals";
import type { SceneStyleId } from "@carma-mapping/engines/cesium/react/runtime";

import { MapStyleKeys } from "../constants/MapStyleKeys";
import { geoportalBackgroundConfig } from "./backgroundConfig";

export const geoportalMapStyleConfig: MapStyleConfig = {
  defaultStyle: geoportalBackgroundConfig.defaultCategory,
  availableStyles: geoportalBackgroundConfig.categories.map(
    (category) => category.id
  ),
};

/**
 * Cesium scene per category id. A category without its own scene style keeps
 * the identity mapping so a scene registered under the category id is found.
 */
export const geoportalCesiumSceneStyleByMapStyle: Record<string, SceneStyleId> =
  Object.fromEntries(
    geoportalBackgroundConfig.categories.map((category) => [
      category.id,
      category.cesiumSceneStyle ?? category.id,
    ])
  );

export { MapStyleKeys };
