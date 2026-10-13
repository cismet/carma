import { isAvailable, type Availability } from "@carma-commons/utils";

import { availabilityContext } from "./availability";

/** Where the 3D measurement addon runs; the live geoportal keeps its dev behaviour. */
export const MEASUREMENT3D_AVAILABILITY: Availability = {
  deployments: ["localDev", "dev", "pr"],
};

/**
 * The switch for everything the 3D measurement adds outside the addon: shared
 * measurements, the MapLibre view's saved sets and the addon state writes.
 */
export const IS_MEASUREMENT3D_AVAILABLE = isAvailable(
  MEASUREMENT3D_AVAILABILITY,
  availabilityContext
);
