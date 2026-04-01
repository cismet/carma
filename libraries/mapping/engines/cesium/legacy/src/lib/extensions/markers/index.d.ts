import type { ModelConfig } from "@carma-mapping/engines/cesium/core";
import {
  type Model,
  type Matrix4,
  type PolylineCollection,
} from "@carma-cesium";
import { type ColorConstructorArgs } from "@carma-mapping/engines/cesium/core";
export type PolylineConfig = {
  color?: ColorConstructorArgs;
  width?: number;
  gap?: number;
  glow?: boolean;
};

export type MarkerModelAsset = {
  uri: string;
  scale?: number;
  isCameraFacing?: boolean;
  rotation?: boolean | number;
  fixedScale?: boolean;
  anchorOffset?: { x?: number; y?: number; z?: number };
  hasAnimation?: boolean;
  stemline?: Partial<PolylineConfig>;
};

export interface MarkerData {
  position: [number, number] | [number, number, number];
  image?: string;
  scale?: number;
  model?: MarkerModelAsset;
}

export interface Marker3dData extends Omit<MarkerData, "model"> {
  model: MarkerModelAsset;
  modelMatrix: Matrix4;
  animatedModelMatrix?: Matrix4;
}

export type MarkerPrimitiveData = {
  id: string;
  modelMatrix: Matrix4 | null;
  animatedModelMatrix: Matrix4 | null;
  modelConfig: MarkerModelAsset | null;
  stemline?: PolylineCollection | null;
  lastRenderTime?: number;
  animationSpeed?: number;
  model: Model | null;
  onCameraChanged?: () => void;
  onPreUpdate?: () => void;
  cleanup?: () => void;
  selectionId?: number | string | null;
  selectionTimestamp?: number | null;
};

export type MarkerOptions = {
  markerAsset: MarkerModelAsset;
  markerAnchorHeight?: number;
};

export type ParsedMarkerModelAsset = ModelConfig &
  MarkerModelAsset & {
    isParsed: true;
    model: Model;
  };
