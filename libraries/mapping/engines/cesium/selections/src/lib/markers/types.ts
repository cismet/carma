import type { Matrix4, Model, PolylineCollection } from "@carma/cesium";
import type { Radians } from "@carma/units/types";

export interface PolylineConfig {
  gap?: number;
  width?: number;
  color?: [number, number, number, number];
  glow?: boolean;
}

export interface MarkerModelAsset {
  url?: string;
  uri?: string;
  scale?: number;
  heading?: Radians;
  pitch?: Radians;
  roll?: Radians;
  animationSpeed?: number;
  anchorOffset?: { x?: number; y?: number; z?: number };
  fixedScale?: boolean;
  rotation?: boolean | number;
  isCameraFacing?: boolean;
}

export interface ParsedMarkerModelAsset extends MarkerModelAsset {
  scale: number;
  heading: Radians;
  pitch: Radians;
  roll: Radians;
  animationSpeed: number;
}

export interface MarkerOptions {
  model?: Model | null;
  id?: string;
  stemline?: PolylineConfig;
}

export interface MarkerPrimitiveData {
  id: string;
  modelMatrix: Matrix4 | null;
  animatedModelMatrix: Matrix4 | null;
  animationSpeed: number;
  modelConfig: ParsedMarkerModelAsset | null;
  model: Model | null;
  stemline: PolylineCollection | null;
  onPreUpdate?: () => void;
  cleanup?: () => void;
  lastRenderTime?: number;
  // selection meta
  selectionKey?: string | number | null;
  selectionTimestamp?: number | null;
}
