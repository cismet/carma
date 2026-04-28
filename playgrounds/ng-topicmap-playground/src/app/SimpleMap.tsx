import { CarmaMap } from "@carma-mapping/core";

export function SimpleMap() {
  return <CarmaMap appKey="ng-topicmap-playground-simple" mapEngine="maplibre" exposeMapToWindow />;
}
