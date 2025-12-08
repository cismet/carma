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
import { SceneAnimationMap } from "./utils/sceneAnimationMap";

export interface CesiumContextType {
  viewerRef: MutableRefObject<Viewer | null>;
  sceneAnimationMapRef: MutableRefObject<SceneAnimationMap | null>;
  shouldSuspendPitchLimiterRef: MutableRefObject<boolean>;
  shouldSuspendCameraLimitersRef: MutableRefObject<boolean>;
  isViewerReady: boolean;
  setIsViewerReady: (flag: boolean) => void;
  providersReady: boolean;
  // null: not started determining; false: determining/applying; true: settled
  initialCameraSettled: boolean | null;
  setInitialCameraSettled: (flag: boolean | null) => void;
  // Monotonic counter that increments each time an initial camera apply sequence starts
  initialCameraEpoch: number;
  bumpInitialCameraEpoch: () => void;
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
    cb: (imageryLayer: ImageryLayer, scene: Scene) => void
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
  // Direct getters for terrain providers (don't require viewer)
  getTerrainProvider: () => CesiumTerrainProvider | null;
  getSurfaceProvider: () => CesiumTerrainProvider | null;
  getImageryLayer: () => ImageryLayer | null;
  getScene: () => Scene | null;
}

export const CesiumContext = createContext<CesiumContextType | null>(null);
