import { BRUECKENENTWURF_GLB } from "@carma-commons/resources";
import type { AdhocFeature } from "@carma-appframeworks/portals";

export const ADHOC_TEST_MODEL: AdhocFeature = {
  id: "carma-adhoc-test-model",
  kind: "model",
  data: {
    url: BRUECKENENTWURF_GLB.model.uri,
    position: {
      lon: BRUECKENENTWURF_GLB.position.longitude,
      lat: BRUECKENENTWURF_GLB.position.latitude,
      height: BRUECKENENTWURF_GLB.position.altitude,
    },
    heading: BRUECKENENTWURF_GLB.orientation?.heading,
    pitch: BRUECKENENTWURF_GLB.orientation?.pitch,
    roll: BRUECKENENTWURF_GLB.orientation?.roll,
  },
  properties: BRUECKENENTWURF_GLB.properties,
  metadata: {
    title: BRUECKENENTWURF_GLB.name,
  },
};
