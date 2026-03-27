import {
  HASH_ZOOM_CONVENTION,
  readFromShareableViewState,
} from "@carma-mapping/engines-interop/view-state";

import { DEFAULT_CAMERA_FOV_DEG } from "../config/app.config";
import { DEFAULT_HOME_VIEW_REF } from "../config/view.config";

const GEO_PORTAL_HOME_VIEW_STATE_OPTIONS = {
  defaultFovDeg: DEFAULT_CAMERA_FOV_DEG,
  zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
} as const;

export const DEFAULT_HOME_VIEW_STATE = readFromShareableViewState(
  DEFAULT_HOME_VIEW_REF,
  {
    sourceId: "geoportal/default-home",
    ...GEO_PORTAL_HOME_VIEW_STATE_OPTIONS,
  }
);
