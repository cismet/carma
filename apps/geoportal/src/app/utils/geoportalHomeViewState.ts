import {
  HASH_ZOOM_CONVENTION,
  readFromShareableViewState,
} from "@carma-mapping/engines-interop/view-state";
import type { ShareableViewState } from "@carma-mapping/engines-interop/view-state";

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

const HOME_CLICK_SHAREABLE_VIEW_STATE: ShareableViewState = {
  ...DEFAULT_HOME_VIEW_REF,
  ...(typeof DEFAULT_HOME_VIEW_REF.zoom === "number"
    ? { zoom: DEFAULT_HOME_VIEW_REF.zoom + 1 }
    : {}),
};

export const HOME_CLICK_VIEW_STATE = readFromShareableViewState(
  HOME_CLICK_SHAREABLE_VIEW_STATE,
  {
    sourceId: "geoportal/home-click",
    ...GEO_PORTAL_HOME_VIEW_STATE_OPTIONS,
  }
);
