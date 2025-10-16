import type { SearchResultItem } from "@carma/types";
import type { MarkerPrimitiveData } from "../extensions/markers";
import type { CesiumOptions } from "../types/options";
import type { CesiumContextType } from "../CesiumContext";

import { cesiumHandleSelection } from "./cesiumHandleSelection";
import { getDerivedGeometries } from "./getDerivedGeometries";

export type HitTriggerOptions = {
  mapOptions: CesiumOptions;
  useCameraHeight?: boolean;
  duration: number;
  durationFactor?: number;
  selectedPolygonId?: string;
  invertedSelectedPolygonId?: string;
  skipFlyTo?: boolean;
  skipMarkerUpdate?: boolean;
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
