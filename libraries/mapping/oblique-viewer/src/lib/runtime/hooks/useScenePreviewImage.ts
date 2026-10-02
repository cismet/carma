import { useEffect, useId, useRef, useState, type RefObject } from "react";
import {
  CanvasTexture,
  SRGBColorSpace,
  Texture,
  LinearFilter,
  Matrix3,
} from "three";
import type { Map as MaplibreMap } from "maplibre-gl";
import { acquireSharedThreeScene } from "@carma-mapping/engines/maplibre";
import {
  degToRad,
  type CssPixels,
  type DevicePixels,
  type Degrees,
  type Ratio,
} from "@carma-units";
import {
  nativePreviewTextureTransform,
  type NativePreviewWindow,
} from "../../core/utils/native-preview-window";
import type { ObliqueBackdropLook } from "../../core/types";
import type { PreviewBackdropTint } from "../utils/preview-backdrop";

type PreviewTextureSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap;
export type ScenePreviewImageContent = Readonly<{
  source: PreviewTextureSource;
  revision?: number;
  crop?: NativePreviewWindow["source"];
}>;
export type ScenePreviewImageGeometry = Readonly<{
  viewport: { width: CssPixels; height: CssPixels };
  image: { width: CssPixels; height: CssPixels };
  offset: { x: CssPixels; y: CssPixels };
  pixelRatio: Ratio;
}>;

/** Sample the shared camera immediately before its mesh draw; content publication never waits for React. */
export const useScenePreviewImage = ({
  map,
  source = null,
  contentRef,
  revision = 0,
  shown,
  halfFovTan,
  nativeSize,
  principal,
  rollDeg,
  crop,
  priority = 0,
  backdropLook,
  backdropTint,
  onBeforeRender,
}: {
  map: MaplibreMap;
  source?: PreviewTextureSource | null;
  contentRef?: RefObject<ScenePreviewImageContent | null>;
  revision?: number;
  shown: boolean;
  halfFovTan: number;
  nativeSize: { width: DevicePixels; height: DevicePixels };
  principal: { xOffset: number; yOffset: number };
  rollDeg: number;
  crop?: NativePreviewWindow["source"];
  priority?: number;
  backdropLook?: ObliqueBackdropLook;
  backdropTint?: PreviewBackdropTint;
  onBeforeRender?: (geometry: ScenePreviewImageGeometry) => void;
}): boolean => {
  const id = useId();
  const current = useRef({
    source,
    contentRef,
    revision,
    shown,
    halfFovTan,
    nativeSize,
    principal,
    rollDeg,
    crop,
    priority,
    backdropLook,
    backdropTint,
    onBeforeRender,
  });
  current.current = {
    source,
    contentRef,
    revision,
    shown,
    halfFovTan,
    nativeSize,
    principal,
    rollDeg,
    crop,
    priority,
    backdropLook,
    backdropTint,
    onBeforeRender,
  };
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const lease = acquireSharedThreeScene(map);
    const layer = lease.layer;
    const supported =
      !!layer.setMapStyleScreenOverlay && !!layer.addBeforeRenderCallback;
    setAvailable(supported);
    if (!supported) return () => lease.release();

    let texture: Texture | null = null;
    let textureSource: PreviewTextureSource | null = null;
    let textureRevision = -1;
    let textureCrop: NativePreviewWindow["source"] | undefined;
    let pendingReplacement = false;
    let opacity = 0;
    let fade: { start: number; from: number } | null = null;
    let geometry: ScenePreviewImageGeometry | null = null;
    let previousView: number[] = [];
    let matrix = new Matrix3();
    let imageMatrix = matrix;
    let matrixGeometry: ScenePreviewImageGeometry | null = null;
    let matrixCrop: NativePreviewWindow["source"] | undefined;
    let applied: {
      texture: Texture;
      version: number;
      matrix: Matrix3;
      imageMatrix: Matrix3;
      opacity: number;
      priority: number;
      backdropLook?: ObliqueBackdropLook;
      backdropTint?: PreviewBackdropTint;
    } | null = null;
    const clear = () => {
      if (applied) layer.setMapStyleScreenOverlay?.(id, null);
      applied = null;
    };

    const remove = layer.addBeforeRenderCallback!((frame) => {
      const options = current.current;
      const width = frame.cssViewport?.x ?? 0;
      const height = frame.cssViewport?.y ?? 0;
      const projection = frame.renderCamera.projectionMatrix.elements;
      // MapLibre's composite projection carries a uniform metres/pixel scale.
      const projectionScale = -projection[11];
      const focus = ((projection[5] / projectionScale) * height) / 2;
      const x = ((-projection[8] / projectionScale) * width) / 2;
      const y = ((projection[9] / projectionScale) * height) / 2;
      const pixelRatio = Math.max(
        frame.viewport.x / width,
        frame.viewport.y / height
      );
      const view = [
        width,
        height,
        focus,
        x,
        y,
        pixelRatio,
        options.halfFovTan,
        options.nativeSize.width,
        options.nativeSize.height,
        options.principal.xOffset,
        options.principal.yOffset,
        options.rollDeg,
      ];
      if (
        !geometry ||
        view.some((value, index) => value !== previousView[index])
      ) {
        previousView = view;
        const edge = 2 * focus * options.halfFovTan;
        const aspect = options.nativeSize.width / options.nativeSize.height;
        if (
          !(width > 0 && height > 0 && edge > 0 && pixelRatio > 0) ||
          !view.every(Number.isFinite)
        ) {
          geometry = null;
          clear();
          return;
        }
        geometry = {
          viewport: { width: width as CssPixels, height: height as CssPixels },
          image: {
            width: (aspect >= 1 ? edge : edge * aspect) as CssPixels,
            height: (aspect >= 1 ? edge / aspect : edge) as CssPixels,
          },
          offset: { x: x as CssPixels, y: y as CssPixels },
          pixelRatio: pixelRatio as Ratio,
        };
      }
      // Cancellation sees the final camera before a completed bitmap can be uploaded.
      options.onBeforeRender?.(geometry);
      const content = options.contentRef?.current;
      const nextSource = options.contentRef
        ? content?.source ?? null
        : options.source;
      const nextRevision = options.contentRef
        ? content?.revision ?? 0
        : options.revision;
      const nextCrop = options.contentRef ? content?.crop : options.crop;
      if (!options.shown || !nextSource) {
        pendingReplacement = false;
        opacity = 0;
        fade = null;
        clear();
        if (!nextSource) {
          texture?.dispose();
          texture = null;
          textureSource = null;
          textureRevision = -1;
          textureCrop = undefined;
        }
        return;
      }
      const sourceWidth =
        "naturalWidth" in nextSource
          ? nextSource.naturalWidth
          : nextSource.width;
      const sourceHeight =
        "naturalHeight" in nextSource
          ? nextSource.naturalHeight
          : nextSource.height;
      const replacement =
        nextSource !== textureSource ||
        nextRevision !== textureRevision ||
        nextCrop?.x !== textureCrop?.x ||
        nextCrop?.y !== textureCrop?.y ||
        nextCrop?.width !== textureCrop?.width ||
        nextCrop?.height !== textureCrop?.height;
      pendingReplacement =
        replacement &&
        Math.max(sourceWidth, sourceHeight) > 512 &&
        !!map.isMoving?.();
      // Keep the admitted source/crop pair while moving, but still update its camera matrix below.
      if (!pendingReplacement && replacement) {
        if (nextSource !== textureSource) {
          texture?.dispose();
          texture =
            nextSource instanceof HTMLCanvasElement
              ? new CanvasTexture(nextSource)
              : new Texture(nextSource);
          texture.colorSpace = SRGBColorSpace;
          texture.minFilter = LinearFilter;
          texture.generateMipmaps = false;
          texture.needsUpdate = true;
          textureSource = nextSource;
          textureRevision = nextRevision;
        } else if (texture && nextRevision !== textureRevision) {
          texture.needsUpdate = true;
          textureRevision = nextRevision;
        }
        textureCrop = nextCrop ? { ...nextCrop } : undefined;
      }
      if (!texture) return;
      if (options.priority > 0) opacity = 1;
      else if (opacity < 1) {
        const now = performance.now();
        fade ??= { start: now, from: opacity };
        const progress = Math.min(1, (now - fade.start) / 250);
        opacity = fade.from + (1 - fade.from) * progress;
        if (progress < 1) map.triggerRepaint();
        else fade = null;
      }
      if (matrixGeometry !== geometry || matrixCrop !== textureCrop) {
        matrix = nativePreviewTextureTransform(
          geometry.viewport,
          geometry.image,
          options.nativeSize,
          geometry.offset,
          options.principal,
          degToRad(options.rollDeg as Degrees),
          textureCrop
        );
        // A native crop changes sampling bounds, while decoration follows the complete sensor frame.
        imageMatrix = textureCrop
          ? nativePreviewTextureTransform(
              geometry.viewport,
              geometry.image,
              options.nativeSize,
              geometry.offset,
              options.principal,
              degToRad(options.rollDeg as Degrees)
            )
          : matrix;
        matrixGeometry = geometry;
        matrixCrop = textureCrop;
      }
      if (
        applied?.texture === texture &&
        applied.version === texture.version &&
        applied.matrix === matrix &&
        applied.imageMatrix === imageMatrix &&
        applied.opacity === opacity &&
        applied.priority === options.priority &&
        applied.backdropLook?.contrast === options.backdropLook?.contrast &&
        applied.backdropLook?.brightness === options.backdropLook?.brightness &&
        applied.backdropLook?.saturation === options.backdropLook?.saturation &&
        applied.backdropTint?.[0] === options.backdropTint?.[0] &&
        applied.backdropTint?.[1] === options.backdropTint?.[1] &&
        applied.backdropTint?.[2] === options.backdropTint?.[2] &&
        applied.backdropTint?.[3] === options.backdropTint?.[3]
      )
        return;
      layer.setMapStyleScreenOverlay?.(id, {
        texture,
        viewportToTexture: matrix,
        opacity,
        priority: options.priority,
        border: {
          viewportToImage: imageMatrix,
          imageSize: geometry.image,
          width: 2,
          opacity: 0.9,
          feather: 50,
          featherOpacity: 0.8,
        },
        backdropLook: options.backdropLook
          ? {
              contrast: options.backdropLook.contrast / 100,
              brightness: options.backdropLook.brightness / 100,
              saturation: options.backdropLook.saturation / 100,
            }
          : undefined,
        backdropTint: options.backdropTint,
      });
      applied = {
        texture,
        version: texture.version,
        matrix,
        imageMatrix,
        opacity,
        priority: options.priority,
        backdropLook: options.backdropLook
          ? { ...options.backdropLook }
          : undefined,
        backdropTint: options.backdropTint
          ? [...options.backdropTint]
          : undefined,
      };
    });
    const admitPendingSource = () => {
      if (pendingReplacement) map.triggerRepaint();
    };
    map.on("moveend", admitPendingSource);
    map.triggerRepaint();
    return () => {
      map.off("moveend", admitPendingSource);
      remove();
      clear();
      texture?.dispose();
      lease.release();
    };
  }, [map, id]);

  // Prop changes invalidate content, while camera changes are sampled by the same-frame callback.
  useEffect(() => {
    map.triggerRepaint();
  }, [
    map,
    source,
    revision,
    shown,
    halfFovTan,
    nativeSize.width,
    nativeSize.height,
    principal.xOffset,
    principal.yOffset,
    rollDeg,
    crop,
    priority,
    backdropLook?.contrast,
    backdropLook?.brightness,
    backdropLook?.saturation,
    backdropTint?.[0],
    backdropTint?.[1],
    backdropTint?.[2],
    backdropTint?.[3],
  ]);
  return available;
};
