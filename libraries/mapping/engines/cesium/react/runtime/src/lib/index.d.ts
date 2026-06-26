import type { Cartesian3, CesiumTerrainProvider } from "@carma-cesium";
import type {
  CesiumCustomShaderOptions,
  CesiumModelConfig,
  ColorConstructorArgs,
  ModelConfig,
} from "@carma-mapping/engines/cesium/core";

import type { CameraLimiterOptions } from "./camera-limiter-options";
import type { CesiumRuntime } from "./CesiumContext";
import type {
  MarkerModelAsset,
  ParsedMarkerModelAsset,
} from "./extensions/markers";
import type { CESIUM_RUNTIME_TRANSITION_STATE } from "./runtime-transition-state";
import type { ProviderConfig } from "./utils/cesiumProviders";
import type { TilesetConfigs } from "./utils/cesiumTilesetProviders";
export type {
  ImageryLayerConfig,
  ImageryLayerConfigs,
  ProviderConfig,
  TerrainProviderConfig,
  TerrainProviderConfigs,
} from "./utils/cesiumProviders";

export type CameraPositionAndOrientation = {
  position: Cartesian3;
  up: Cartesian3;
  direction: Cartesian3;
};

// MARKERS
export type {
  MarkerData,
  Marker3dData,
  MarkerPrimitiveData,
  MarkerModelAsset,
  ParsedMarkerModelAsset,
  PolylineConfig,
  MarkerOptions,
} from "./extensions/markers";

export type CesiumOptions = {
  markerAsset: MarkerModelAsset;
  selectionClassification: CesiumSelectionClassification;
  markerAnchorHeight?: number;
  pitchAdjustHeight?: number;
  withTerrainProvider: <T>(
    cb: (provider: CesiumTerrainProvider, runtime: CesiumRuntime) => T
  ) => T | undefined;
  withSurfaceProvider: <T>(
    cb: (provider: CesiumTerrainProvider, runtime: CesiumRuntime) => T
  ) => T | undefined;
};

export type CesiumSceneStyleChangeMode =
  | "live"
  | "resource-reload"
  | "runtime-reinit";

export type CesiumSceneStyleDiff = {
  mode: CesiumSceneStyleChangeMode;
  reasons: readonly string[];
};

export type CesiumSceneStyleChange = {
  path: string;
  mode: CesiumSceneStyleChangeMode;
  reason: string;
};

export type CesiumSceneStyleChangeSet = {
  mode: CesiumSceneStyleChangeMode;
  reasons: readonly string[];
  changes: readonly CesiumSceneStyleChange[];
};

export type CesiumSceneResourceInitSignatures = {
  terrainProviders?: Readonly<Record<string, string | undefined>>;
  tilesets?: Readonly<Record<string, string | undefined>>;
};

export type CesiumTerrainProviderMemberId = string;
export type CesiumImageryLayerMemberId = string;
export type CesiumSelectionClassification = "tileset" | "both";

export type CesiumGlobeTranslucencyStyle = {
  enabled?: boolean;
  frontFaceAlpha?: number;
  backFaceAlpha?: number;
};

export type CesiumGlobeLiveStyle = {
  baseColor?: ColorConstructorArgs;
  depthTestAgainstTerrain?: boolean;
  enableLighting?: boolean;
  translucency?: CesiumGlobeTranslucencyStyle;
};

export type CesiumSceneLiveStyle = {
  backgroundColor?: ColorConstructorArgs;
};

export type CesiumImageryLayerMember = {
  id: CesiumImageryLayerMemberId;
  opacity?: number;
};

export type Cesium3DTileStyleDescription = Record<string, unknown>;

export type CesiumTilesetAppearance =
  | {
      type?: "default";
    }
  | {
      type: "cesium-3d-tile-style";
      style: Cesium3DTileStyleDescription;
    }
  | {
      type: "custom-shader";
      shader: CesiumCustomShaderOptions;
    };

export type CesiumTilesetSceneMember = {
  id: string;
  appearance?: CesiumTilesetAppearance;
};

export type CesiumSceneMembers = {
  terrainProviderId?: CesiumTerrainProviderMemberId;
  surfaceProviderId?: CesiumTerrainProviderMemberId;
  imageryLayers?: readonly CesiumImageryLayerMember[];
  tilesets?: readonly CesiumTilesetSceneMember[];
};

export type CesiumScenePreset = {
  name?: string;
  runtimeProfileId?: string;
  members?: CesiumSceneMembers;
  live?: {
    scene?: CesiumSceneLiveStyle;
    globe?: CesiumGlobeLiveStyle;
  };
};

export type SceneStyle = CesiumScenePreset;
export type SceneStyleId = string;
export type SceneStyles = Record<SceneStyleId, SceneStyle>;

export type CesiumConfig = {
  transitions: {
    mapMode: {
      duration: number;
    };
  };
  camera: CameraLimiterOptions;
  markerKey?: string;
  markerAnchorHeight?: number;
  baseUrl: string;
  pathName: string;
  tilesetConfigs: TilesetConfigs;
  providerConfig: ProviderConfig;
  model?: CesiumModelConfig;
  models?: ModelConfig[];
};
export interface CesiumState {
  isAnimating?: boolean;
  currentTransition?: CESIUM_RUNTIME_TRANSITION_STATE;
  currentSceneStyle?: SceneStyleId;
  sceneSpaceCameraController: {
    enableCollisionDetection: boolean;
    minimumZoomDistance: number; // default is 1.0
    maximumZoomDistance: number; // default is Infinity
  };
  sceneStyles?: SceneStyles;
  // TODO move to per tileset styling
  styling: {
    tileset: {
      opacity: number;
    };
  };
  models?: Record<string, MarkerModelAsset | ParsedMarkerModelAsset>;
}

export type RootState = {
  cesium: CesiumState;
};

export type SceneStateDescription = {
  camera: {
    longitude?: number | null;
    latitude?: number | null;
    height?: number | null;
    heading?: number | null;
    pitch?: number | null;
  };
  zoom?: number | null;
  isAnimating?: boolean | null;
};

export type AppState = {
  isAnimating?: boolean;
  zoom?: number;
};
