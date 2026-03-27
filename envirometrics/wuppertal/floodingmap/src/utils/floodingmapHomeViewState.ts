import {
  HASH_ZOOM_CONVENTION,
  readFromShareableViewState,
} from "@carma-mapping/engines-interop/view-state";

import { DEFAULT_HOME_VIEW_REF } from "../config/view.config";

const FLOODINGMAP_HOME_VIEW_STATE_OPTIONS = {
  zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
} as const;

export const DEFAULT_HOME_VIEW_STATE = readFromShareableViewState(
  DEFAULT_HOME_VIEW_REF,
  {
    sourceId: "floodingmap/default-home",
    ...FLOODINGMAP_HOME_VIEW_STATE_OPTIONS,
  }
);
