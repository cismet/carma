import { createContext, MutableRefObject } from "react";

import {
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  ImageryLayer,
  Viewer,
  Cesium3DTileset,
} from "cesium";
import { ViewerAnimationMap } from "./utils/viewerAnimationMap";
import { TilesetConfig } from "@carma-commons/resources";

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
  switchPrimaryTileset?: (index: number) => Promise<void>;
  primaryTilesetOptions?: Array<{
    index: number;
    displayName: string;
    displayNameShort: string;
    key: string;
  }>;
}

export const CesiumContext = createContext<CesiumContextType | null>(null);
