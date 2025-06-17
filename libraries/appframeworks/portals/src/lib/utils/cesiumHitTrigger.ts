import { Viewer } from "cesium";

import {
  type CesiumOptions,
  type EntityData,
} from "@carma-mapping/cesium-engine";

import { cesiumHandleSelection } from "./cesiumHandleSelection";
import { MutableRefObject } from "react";
import { getDerivedGeometries } from "./getDerivedGeometries";
import { SearchResultItem } from "@carma-commons/types";

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
  mapRef: MutableRefObject<Viewer | null>,
  shouldFlyToRef: MutableRefObject<boolean>,
  entityData: null | EntityData,
  setEntityData: (data: EntityData | null) => void,
  options: HitTriggerOptions
) => {
  if (hit !== undefined && hit.length !== undefined && hit.length > 0) {
    const derivedGeometries = getDerivedGeometries(hit[0]);
    if (
      mapRef.current instanceof Viewer &&
      !mapRef.current.isDestroyed() &&
      options
    ) {
      cesiumHandleSelection(
        mapRef.current,
        shouldFlyToRef,
        entityData,
        setEntityData,
        derivedGeometries,
        options
      );
    } else {
      console.warn("Unsupported map or map not ready", mapRef.current);
    }
  } else {
    console.info("unhandled hit:", hit);
  }
};

export default cesiumHitTrigger;
