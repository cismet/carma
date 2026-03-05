import type { AnnotationProviderOptions } from "@carma-mapping/annotations/cesium";

import { APP_KEY } from "./index";

export const CESIUM_ANNOTATIONS_OPTIONS: AnnotationProviderOptions = {
  pointQueries: { enabled: true, radius: 1 },
  moveGizmo: {
    markerSizeScale: 0.5,
    labelDistanceScale: 2,
    snapPlaneDragToGround: true,
    showRotationHandle: false,
  },
  persistenceKey: `@${APP_KEY}.app.measurements.geoportal`,
};
