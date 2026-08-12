import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

import { isLayerGroup, type LayerStackEntry } from "@carma-mapping/layers";
import {
  getBoundsCenter,
  isPointBounds,
  type LngLatBounds,
} from "@carma-mapping/utils";

import { nameMap } from "react-cismap/commons/Icon";

import type { AddonTrigger } from "../lib/registry";

export type ZoomToExtentConfig = {
  label?: string;
  bounds?: LngLatBounds;
  pointZoom?: number;
};

const DEFAULT_LABEL = "optimale Ansicht";
const DEFAULT_POINT_ZOOM = 20;

const searchLocationIcon: IconDefinition = nameMap["search-location"];

const boundsOf = (
  config: ZoomToExtentConfig | undefined,
  target: LayerStackEntry | null
): LngLatBounds | undefined => {
  if (config?.bounds) {
    return config.bounds;
  }
  if (!target || isLayerGroup(target)) {
    return undefined;
  }
  return target.featureBounds;
};

export const zoomToExtentTrigger: AddonTrigger<"zoomToExtent"> = {
  icon: searchLocationIcon,
  label: ({ config }) => config?.label ?? DEFAULT_LABEL,
  isApplicable: ({ config, target }) => Boolean(boundsOf(config, target)),
  onClick: ({ config, target, carma }) => {
    const bounds = boundsOf(config, target);
    if (!bounds) {
      return;
    }
    if (isPointBounds(bounds)) {
      const { lng, lat } = getBoundsCenter(bounds);
      carma.mapping2D.flyTo(lat, lng, config?.pointZoom ?? DEFAULT_POINT_ZOOM);
      return;
    }
    carma.mapping2D.fitBounds(bounds[0], bounds[1], bounds[2], bounds[3]);
  },
};
