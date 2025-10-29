import type { SearchResultItem } from "@carma/types";
import type { MarkerPrimitiveData, MarkerModelAsset } from "./markers";
import { ClassificationType } from "@carma/cesium";

import {
  cesiumHandleSelection,
  type HitTriggerOptions,
  type DerivedGeometries,
} from "./cesiumHandleSelection";
import { getDerivedGeometries } from "@carma-mapping/appframeworks/portals";

export const cesiumHitTrigger = async (
  hit: SearchResultItem[],
  markerData: null | MarkerPrimitiveData,
  setMarkerData: (data: MarkerPrimitiveData | null) => void,
  options: HitTriggerOptions
) => {
  if (hit !== undefined && hit.length !== undefined && hit.length > 0) {
    const derivedGeometries = getDerivedGeometries(hit[0]);
    cesiumHandleSelection(
      markerData,
      setMarkerData,
      derivedGeometries,
      options
    );
  } else {
    console.info("unhandled hit:", hit);
  }
};

export default cesiumHitTrigger;
