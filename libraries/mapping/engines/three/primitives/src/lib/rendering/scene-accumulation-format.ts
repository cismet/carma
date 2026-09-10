import {
  FloatType,
  HalfFloatType,
  RedFormat,
  RGBAFormat,
  UnsignedByteType,
} from "three";

export const SCENE_ACCUMULATION_FORMATS = {
  rgba16f: {
    type: HalfFloatType,
    accumulationType: HalfFloatType,
    format: RGBAFormat,
    bytesPerPixel: 8,
    accumulationBytesPerPixel: 8,
  },
  "rgba16f-32f": {
    type: HalfFloatType,
    accumulationType: FloatType,
    format: RGBAFormat,
    bytesPerPixel: 8,
    accumulationBytesPerPixel: 16,
  },
  rgba32f: {
    type: FloatType,
    accumulationType: FloatType,
    format: RGBAFormat,
    bytesPerPixel: 16,
    accumulationBytesPerPixel: 16,
  },
  rgba8: {
    type: UnsignedByteType,
    accumulationType: UnsignedByteType,
    format: RGBAFormat,
    bytesPerPixel: 4,
    accumulationBytesPerPixel: 4,
  },
  r16f: {
    type: HalfFloatType,
    accumulationType: HalfFloatType,
    format: RedFormat,
    bytesPerPixel: 2,
    accumulationBytesPerPixel: 2,
  },
  "r16f-32f": {
    type: HalfFloatType,
    accumulationType: FloatType,
    format: RedFormat,
    bytesPerPixel: 2,
    accumulationBytesPerPixel: 4,
  },
  r32f: {
    type: FloatType,
    accumulationType: FloatType,
    format: RedFormat,
    bytesPerPixel: 4,
    accumulationBytesPerPixel: 4,
  },
  r8: {
    type: UnsignedByteType,
    accumulationType: UnsignedByteType,
    format: RedFormat,
    bytesPerPixel: 1,
    accumulationBytesPerPixel: 1,
  },
} as const;

export type SceneAccumulationFormat = keyof typeof SCENE_ACCUMULATION_FORMATS;
export type SceneAccumulationOptions = Readonly<{
  format?: SceneAccumulationFormat;
  /** Requested samples; the renderer clamps to its supported sample count. */
  msaaSamples?: number;
}>;

export const DEFAULT_SCENE_ACCUMULATION_OPTIONS = {
  format: "rgba16f-32f",
  msaaSamples: 4,
} as const satisfies SceneAccumulationOptions;

export const resolveSceneAccumulationFormat = (
  format: SceneAccumulationFormat = DEFAULT_SCENE_ACCUMULATION_OPTIONS.format
) =>
  SCENE_ACCUMULATION_FORMATS[format] ??
  SCENE_ACCUMULATION_FORMATS[DEFAULT_SCENE_ACCUMULATION_OPTIONS.format];
