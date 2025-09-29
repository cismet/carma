import type { SearchResultItem } from "@carma/types";
import type {
  CesiumOptions,
  EntityData,
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
};

export const cesiumHitTrigger = async (
  hit: SearchResultItem[],
  ctx: CesiumContextType,
  entityData: null | EntityData,
  setEntityData: (data: EntityData | null) => void,
  options: HitTriggerOptions
) => {
  if (hit !== undefined && hit.length !== undefined && hit.length > 0) {
    const derivedGeometries = getDerivedGeometries(hit[0]);
    cesiumHandleSelection(
      ctx,
      entityData,
      setEntityData,
      derivedGeometries,
      options
    );
  } else {
    console.info("unhandled hit:", hit);
  }
};

export default cesiumHitTrigger;
