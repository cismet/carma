import { createContext, type MutableRefObject } from "react";

import type {
  Camera,
  Cesium3DTileset,
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  EntityCollection,
  ImageryLayer,
  Scene,
  CesiumWidget,
} from "cesium";
import type { AnimationMap } from "./utils/animationMap";

export interface CesiumContextType {
  widgetRef: MutableRefObject<CesiumWidget | null>;
  AnimationMapRef: MutableRefObject<AnimationMap | null>;
  shouldSuspendPitchLimiterRef: MutableRefObject<boolean>;
  shouldSuspendCameraLimitersRef: MutableRefObject<boolean>;
  isReady: boolean;
  setisReady: (flag: boolean) => void;
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
  // Shorthands for widget validation
  isValidWidget: () => boolean;
  // Deprecated alias during migration; prefer isValidWidget
  isValidWidget: () => boolean;
  withWidget: (cb: (widget: CesiumWidget) => void) => boolean;
  withCamera: (cb: (camera: Camera, widget: CesiumWidget) => void) => boolean;
  withCanvas: (
    cb: (canvas: HTMLCanvasElement, widget: CesiumWidget) => void
  ) => boolean;
  withScene: (cb: (scene: Scene, widget: CesiumWidget) => void) => boolean;
  withEntities: (
    cb: (entities: EntityCollection, widget: CesiumWidget) => void
  ) => boolean;
  withImageryLayer: (
    cb: (imageryLayer: ImageryLayer, widget: CesiumWidget) => void
  ) => boolean;
  withPrimaryTileset: (
    cb: (tileset: Cesium3DTileset, widget: CesiumWidget) => void
  ) => boolean;
  withSecondaryTileset: (
    cb: (tileset: Cesium3DTileset, widget: CesiumWidget) => void
  ) => boolean;
  withEllipsoidTerrainProvider: (
    cb: (provider: EllipsoidTerrainProvider, widget: CesiumWidget) => void
  ) => boolean;
  withTerrainProvider: (
    cb: (provider: CesiumTerrainProvider, widget: CesiumWidget) => void
  ) => boolean;
  withSurfaceProvider: (
    cb: (provider: CesiumTerrainProvider, widget: CesiumWidget) => void
  ) => boolean;
}

export const CesiumContext = createContext<CesiumContextType | null>(null);
