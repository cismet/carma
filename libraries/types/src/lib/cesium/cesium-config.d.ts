// MARKERS
export type {
  MarkerData,
  Marker3dData,
  MarkerPrimitiveData,
  MarkerModelAsset,
  ParsedMarkerModelAsset,
  PolylineConfig,
  MarkerOptions,
} from "./lib/extensions/markers";

export type TerrainProviderRecord = {
  key: string;
  type: TerrainType;
  config: TerrainProviderConfig;
};

export type ImageryProviderRecord = {
  key: string;
  config: ImageryProviderConfig;
};

export type TilesetRecord = {
  key: string;
  config: TilesetConfig;
};

export type CesiumConfig = {
  transitions: {
    mapMode: {
      duration: number;
    };
  };
  camera: {
    minPitch: number;
    minPitchRange: number;
  };
  markerKey?: string;
  markerAnchorHeight?: number;
  baseUrl: string;
  pathName: string;

  imageryProviders?: ImageryProviderRecord[];
  terrainProviders?: TerrainProviderRecord[];
  tilesets?: TilesetRecord[];
  sceneStyles?: SceneStyleConfig[] | SceneStyles;

  markers?: CesiumMarkerOptions[];
  models?: ModelConfig[];
  homePosition?: { x: number; y: number; z: number };
  homeOffset?: { x: number; y: number; z: number };
  cameraController?: {
    enableCollisionDetection?: boolean;
    maximumZoomDistance?: number;
    minimumZoomDistance?: number;
  };
  modelAssets?: Record<string, MarkerModelAsset | ParsedMarkerModelAsset>;
};
