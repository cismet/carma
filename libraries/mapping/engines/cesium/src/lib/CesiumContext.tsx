import { createContext, MutableRefObject } from "react";

import type {
  Camera,
  Cesium3DTileset,
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  EntityCollection,
  ImageryLayer,
  Scene,
  Viewer,
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
  withViewer: (cb: (viewer: Viewer) => void) => boolean;
  withCamera: (cb: (camera: Camera, viewer: Viewer) => void) => boolean;
  withCanvas: (
    cb: (canvas: HTMLCanvasElement, viewer: Viewer) => void
  ) => boolean;
  withScene: (cb: (scene: Scene, viewer: Viewer) => void) => boolean;
  withEntities: (
    cb: (entities: EntityCollection, viewer: Viewer) => void
  ) => boolean;
  withImageryLayer: (
    cb: (imageryLayer: ImageryLayer, viewer: Viewer) => void
  ) => boolean;
  withPrimaryTileset: (
    cb: (tileset: Cesium3DTileset, viewer: Viewer) => void
  ) => boolean;
  withSecondaryTileset: (
    cb: (tileset: Cesium3DTileset, viewer: Viewer) => void
  ) => boolean;
  withEllipsoidTerrainProvider: (
    cb: (provider: EllipsoidTerrainProvider, viewer: Viewer) => void
  ) => boolean;
  withTerrainProvider: (
    cb: (provider: CesiumTerrainProvider, viewer: Viewer) => void
  ) => boolean;
  withSurfaceProvider: (
    cb: (provider: CesiumTerrainProvider, viewer: Viewer) => void
  ) => boolean;
}

export const CesiumContext = createContext<CesiumContextType | null>(null);
