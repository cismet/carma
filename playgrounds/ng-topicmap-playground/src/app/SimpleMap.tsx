import { CarmaMap } from "@carma-mapping/core";

export function SimpleMap() {
  return <CarmaMap mapEngine="maplibre" exposeMapToWindow />;
}
