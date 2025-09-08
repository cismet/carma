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
  isValidViewer: () => boolean;
  withViewer: (cb: (viewer: Viewer) => void) => void;
  withCamera: (cb: (camera: Camera) => void) => void;
  withCanvas: (cb: (canvas: HTMLCanvasElement) => void) => void;
  withScene: (cb: (scene: Scene) => void) => void;
  withEntities: (
    cb: (entities: NonNullable<Viewer["entities"]>) => void
  ) => void;
}

export const CesiumContext = createContext<CesiumContextType | null>(null);
