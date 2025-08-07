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
  shouldSuspendPitchLimiterRef: MutableRefObject<boolean>;
  isViewerReady: boolean;
  setIsViewerReady: (flag: boolean) => void;
  primaryTilesetsRef: MutableRefObject<(Cesium3DTileset | null)[]>;
  secondaryTilesetsRef: MutableRefObject<(Cesium3DTileset | null)[]>;
  shouldSelectPrimaryTileset?: (index: number) => Promise<void>;
  shouldSelectSecondaryTileset?: (index: number) => Promise<void>;
  primaryTilesetConfigs?: TilesetConfig[];
  secondaryTilesetConfigs?: TilesetConfig[];
  selectedPrimaryTilesetIndex?: number;
  selectedSecondaryTilesetIndex?: number;
  tilesetsLoadedCounter?: number;
}

export const CesiumContext = createContext<CesiumContextType | null>(null);
