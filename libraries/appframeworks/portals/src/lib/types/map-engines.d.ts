// Base type for uninitialized engines
type BaseEngineRecord = {
  engine: MapEngine;
  isReady: false;
  isSuspended: true;
};

// Leaflet engine record (initialized)
type LeafletEngineRecord = {
  engine: "leaflet2d";
  isReady: true;
  isSuspended: boolean;
  zoomOut: (onComplete?: () => void) => void;
  zoomIn: (onComplete?: () => void) => void;
  flyHome: (onComplete?: () => void) => void;
  setView: (position: MapView) => void;
  id: string;
  debug: {
    config: LeafletConfig;
    timestamp: number;
  };
};

// Cesium engine record (initialized)
type CesiumEngineRecord = {
  engine: "cesium3d";
  isReady: true;
  isSuspended: boolean;
  zoomOut: (onComplete?: () => void) => void;
  zoomIn: (onComplete?: () => void) => void;
  fovZoomOut?: (onComplete?: () => void) => void;
  fovZoomIn?: (onComplete?: () => void) => void;
  flyHome: (onComplete?: () => void) => void;
  setCamera: (camera: CameraState) => void;
  setStyle: (styleId: string) => void;
  debug: {
    config: CesiumConfig;
    timestamp: number;
  };
};

// All possible engine records (including uninitialized)
export type MapEngineRecord =
  | BaseEngineRecord
  | LeafletEngineRecord
  | CesiumEngineRecord;

// Helper type for active engines (ready and not suspended)
export type ManagedEngineRecord = LeafletEngineRecord | CesiumEngineRecord;
