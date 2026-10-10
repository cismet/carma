import type { Map as MaplibreMap } from "maplibre-gl";
import type { ThreeImageLevels } from "@carma-commons/image-pyramid";
import type { WebGLRenderer } from "three";
import {
  ImageLevelStackPool,
  type ImagePyramidSource,
  type ImageView,
} from "@carma-commons/image-pyramid";
import type { Matrix3 } from "three";
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
  avifFormat?: "native";
  avifPyramidFallbackUrl?: string;
  avifOnly?: boolean;
  nativeSize: { width: DevicePixels; height: DevicePixels };
  minimumQualityLevel?: PreviewQualityLevel;
};
export const nativePreviewSource = (
  input: NativePreviewSource
): ImagePyramidSource => {
  const { imageId, nativeSize, minimumQualityLevel = "0" } = input;
  const avif = !!(input.avifPyramidUrl || input.avifOnly);
  const url = avif
    ? input.avifPyramidUrl ?? input.sourceUrl
    : input.path
    ? getPreviewImageUrl(input.path, minimumQualityLevel, imageId)
    : input.sourceUrl;
  const absolute = (value: string) =>
    new URL(value, globalThis.window.location.href).href;
  const fallbacks: NonNullable<ImagePyramidSource["fallbacks"]>[number][] = [];
  if (avif && input.avifFormat === "native") {
    if (input.avifPyramidFallbackUrl && input.avifPyramidFallbackUrl !== url)
      fallbacks.push({
        url: absolute(input.avifPyramidFallbackUrl),
        kind: "avif",
        nativeSize,
      });
    if (!input.avifOnly && input.path)
      fallbacks.push({
        url: absolute(
          getPreviewImageUrl(input.path, minimumQualityLevel, imageId)
        ),
        kind: "jpeg",
        nativeSize,
        jpegLevels: [0, 1, 2, 3, 4, 5, 6].filter(
          (level) => level >= Number(minimumQualityLevel)
        ),
      });
  }
  return {
    id: imageId,
    url: absolute(url),
    kind: avif ? "avif" : "jpeg",
    ...(avif && input.avifFormat
      ? { format: input.avifFormat, fallbacks }
      : {}),
    nativeSize,
    ...(avif
      ? {}
      : {
          jpegLevels: [0, 1, 2, 3, 4, 5, 6].filter(
            (level) => level >= Number(minimumQualityLevel)
          ),
        }),
  };
};

type PreviewView = {
  view: ImageView;
  pixels: number;
  viewportToImage?: Matrix3;
};
const visibleViews = new Map<string, PreviewView>();
export const rememberNativePreviewView = (
  source: ImagePyramidSource,
  view: ImageView,
  pixels: number,
  viewportToImage?: Matrix3
) => {
  visibleViews.delete(source.url);
  visibleViews.set(source.url, {
    view,
    pixels,
    viewportToImage: viewportToImage?.clone(),
  });
  if (visibleViews.size > 8)
    visibleViews.delete(visibleViews.keys().next().value!);
};
export const lastNativePreviewView = (source: ImagePyramidSource) =>
  visibleViews.get(source.url);

/** Same rotated whole-photo fit as flyToImage; density is physical pixels per native pixel. */
export const fitNativePreviewView = (
  source: ImagePyramidSource,
  width: number,
  height: number,
  roll: number,
  pixelRatio: number
): PreviewView => {
  const native = source.nativeSize!;
  const c = Math.abs(Math.cos(roll)),
    s = Math.abs(Math.sin(roll));
  const scale =
    0.9 *
    Math.min(
      width / (c * native.width + s * native.height),
      height / (s * native.width + c * native.height)
    );
  return {
    view: {
      visible: { x: 0 as DevicePixels, y: 0 as DevicePixels, ...native },
      density: (scale * pixelRatio) as Ratio,
    },
    pixels: Math.ceil(width * pixelRatio) * Math.ceil(height * pixelRatio),
  };
};

type PreparedComposer = {
  renderer: WebGLRenderer;
  composer: ThreeImageLevels;
  claimed: boolean;
  disposed: boolean;
};
const preparedComposers = new WeakMap<
  MaplibreMap,
  Map<string, PreparedComposer>
>();
/** Ownership moves once from the readiness bridge to the same map's visible preview. */
export const handoffNativePreviewComposer = (
  map: MaplibreMap,
  source: ImagePyramidSource,
  renderer: WebGLRenderer,
  composer: ThreeImageLevels
): (() => void) => {
  let entries = preparedComposers.get(map);
  if (!entries) {
    entries = new Map();
    preparedComposers.set(map, entries);
  }
  const previous = entries.get(source.url);
  if (previous && !previous.claimed && !previous.disposed) {
    previous.disposed = true;
    previous.composer.dispose();
  }
  const entry = { renderer, composer, claimed: false, disposed: false };
  entries.set(source.url, entry);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (entries!.get(source.url) === entry) entries!.delete(source.url);
    if (!entry.claimed && !entry.disposed) {
      entry.disposed = true;
      composer.dispose();
    }
  };
};
export const takeNativePreviewComposer = (
  map: MaplibreMap,
  source: ImagePyramidSource,
  renderer: WebGLRenderer
): ThreeImageLevels | undefined => {
  const entries = preparedComposers.get(map),
    entry = entries?.get(source.url);
  if (!entry || entry.renderer !== renderer) return;
  entries!.delete(source.url);
  entry.claimed = true;
  return entry.composer;
};
