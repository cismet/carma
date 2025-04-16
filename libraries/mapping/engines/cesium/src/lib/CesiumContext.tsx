import { createContext, MutableRefObject } from "react";

import {
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  ImageryLayer,
  Viewer,
  Cesium3DTileset,
} from "cesium";
import { ViewerAnimationMap } from "./utils/viewerAnimationMap";

export interface CesiumContextType {
  viewerRef: MutableRefObject<Viewer | null>;
  viewerAnimationMapRef: MutableRefObject<ViewerAnimationMap | null>;
  terrainProviderRef: MutableRefObject<CesiumTerrainProvider | null>;
  surfaceProviderRef: MutableRefObject<CesiumTerrainProvider | null>;
  imageryLayerRef: MutableRefObject<ImageryLayer | null>;
  ellipsoidTerrainProviderRef: MutableRefObject<EllipsoidTerrainProvider | null>;
  tilesetsRefs: {
    primaryRef: MutableRefObject<Cesium3DTileset | null>;
    secondaryRef: MutableRefObject<Cesium3DTileset | null>;
  };
  shouldSuspendPitchLimiterRef: MutableRefObject<boolean>;
  isViewerReady: boolean;
  setIsViewerReady: (flag: boolean) => void;
}

export const CesiumContext = createContext<CesiumContextType | null>(null);
