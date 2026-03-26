import {
  HASH_ZOOM_CONVENTION,
  readFromShareableViewState,
} from "@carma-mapping/engines-interop/view-state";

import { DEFAULT_HOME_VIEW_REF } from "../config/view.config";

export const DEFAULT_HOME_VIEW_STATE = readFromShareableViewState(
  DEFAULT_HOME_VIEW_REF,
  {
    sourceId: "floodingmap/default-home",
    zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
  }
);
