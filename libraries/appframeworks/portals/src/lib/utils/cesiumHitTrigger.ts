import type { SearchResultItem } from "@carma/types";
import type {
  CesiumOptions,
  MarkerPrimitiveData,
  CesiumContextType,
} from "@carma-mapping/engines/cesium";

import { cesiumHandleSelection } from "./cesiumHandleSelection";
import { getDerivedGeometries } from "./getDerivedGeometries";

export type HitTriggerOptions = {
  mapOptions: CesiumOptions;
  useCameraHeight?: boolean;
  duration: number; // duration for flyTo
  durationFactor?: number; // dynamic flyTo duration factor,
  selectedPolygonId?: string;
  invertedSelectedPolygonId?: string;
  skipFlyTo?: boolean;
};

export const cesiumHitTrigger = async (
  hit: SearchResultItem[],
  ctx: CesiumContextType,
  markerData: null | MarkerPrimitiveData,
  setMarkerData: (data: MarkerPrimitiveData | null) => void,
  options: HitTriggerOptions
) => {
  if (hit !== undefined && hit.length !== undefined && hit.length > 0) {
    const derivedGeometries = getDerivedGeometries(hit[0]);
    cesiumHandleSelection(
      ctx,
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
