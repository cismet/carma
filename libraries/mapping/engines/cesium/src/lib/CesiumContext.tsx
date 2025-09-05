import { createContext, MutableRefObject } from "react";

import {
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  ImageryLayer,
  Viewer,
  Cesium3DTileset,
  Scene,
  Camera,
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
  shouldSuspendCameraLimitersRef: MutableRefObject<boolean>;
  isViewerReady: boolean;
  setIsViewerReady: (flag: boolean) => void;
  requestRender: (opts?: {
    delay?: number; // ms
    repeat?: number; // times
    repeatInterval?: number; // ms
  }) => void;
  // Shorthands for viewer validation
  isViewerValid: () => boolean;
  validateViewer: () =>
    | { viewer: Viewer; camera: Camera; scene: Scene }
    | null;
  withViewer: (
    cb: (ctx: { viewer: Viewer; camera: Camera; scene: Scene }) => void
  ) => void;
  // Also expose as a top-level helper for convenience in components
  removeEntityById: (id: string) => boolean;
}

export const CesiumContext = createContext<CesiumContextType | null>(null);
