// use when not initialized
type BasicEngineRecord = {
  engine: MapEngine;
  isReady: false;
  isSuspended: true;
};

type LeafletEngineRecord = BasicEngineRecord & {
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

type CesiumEngineRecord = BasicEngineRecord & {
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

export type MapEngineRecord =
  | LeafletEngineRecord
  | CesiumEngineRecord
  | BasicEngineRecord;
