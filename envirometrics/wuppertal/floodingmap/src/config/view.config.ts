import type { ShareableViewState } from "@carma-mapping/engines-interop/view-state";

export const DEFAULT_HOME_VIEW_REF = {
  lat: 51.2677,
  lng: 7.19163,
  altitude: 200,
  zoom: 17,
  pitch: 45,
} satisfies ShareableViewState;
