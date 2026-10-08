import { ImageLevelStackPool, type ImagePyramidSource, type ImageView } from "@carma-commons/image-pyramid";
import type { DevicePixels, Ratio } from "@carma-units";
import type { PreviewQualityLevel } from "../../core/constants";
import { getPreviewImageUrl } from "./imageUrls";

/** Navigation preparation and visible previews must share both source identity and tiles. */
export const nativePixelPool = new ImageLevelStackPool({ maxImages: 8 });
export type NativePreviewSource = {
  imageId: string;
  path?: string;
  sourceUrl: string;
  avifPyramidUrl?: string;
  avifOnly?: boolean;
  nativeSize: { width: DevicePixels; height: DevicePixels };
  minimumQualityLevel?: PreviewQualityLevel;
};
export const nativePreviewSource = (input: NativePreviewSource): ImagePyramidSource => {
  const { imageId, nativeSize, minimumQualityLevel = "0" } = input;
  const avif = !!(input.avifPyramidUrl || input.avifOnly);
  const url = avif ? input.avifPyramidUrl ?? input.sourceUrl : input.path
    ? getPreviewImageUrl(input.path, minimumQualityLevel, imageId) : input.sourceUrl;
  return {
    id: imageId, url: new URL(url, globalThis.window.location.href).href,
    kind: avif ? "avif" : "jpeg", nativeSize,
    ...(avif ? {} : { jpegLevels: [0, 1, 2, 3, 4, 5, 6].filter(level => level >= Number(minimumQualityLevel)) }),
  };
};

type PreviewView = { view: ImageView; pixels: number };
const visibleViews = new Map<string, PreviewView>();
export const rememberNativePreviewView = (source: ImagePyramidSource, view: ImageView, pixels: number) => {
  visibleViews.delete(source.url);
  visibleViews.set(source.url, { view, pixels });
  if (visibleViews.size > 8) visibleViews.delete(visibleViews.keys().next().value!);
};
export const lastNativePreviewView = (source: ImagePyramidSource) => visibleViews.get(source.url);

/** Same rotated whole-photo fit as flyToImage; density is physical pixels per native pixel. */
export const fitNativePreviewView = (
  source: ImagePyramidSource, width: number, height: number, roll: number, pixelRatio: number
): PreviewView => {
  const native = source.nativeSize!;
  const c = Math.abs(Math.cos(roll)), s = Math.abs(Math.sin(roll));
  const scale = 0.9 * Math.min(width / (c * native.width + s * native.height), height / (s * native.width + c * native.height));
  return { view: { visible: { x: 0 as DevicePixels, y: 0 as DevicePixels, ...native }, density: (scale * pixelRatio) as Ratio },
    pixels: Math.ceil(width * pixelRatio) * Math.ceil(height * pixelRatio) };
};
