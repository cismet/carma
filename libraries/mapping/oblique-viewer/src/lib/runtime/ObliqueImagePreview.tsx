import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type RefObject,
} from "react";
import type { DevicePixels } from "@carma-units";
import type { Map as MaplibreMap } from "maplibre-gl";

import type { PreviewQualityLevel } from "../core/constants";
import { usePreviewSizeSync } from "./hooks/usePreviewSizeSync";
import type {
  InteriorOrientationOffset,
  ObliqueBackdropLook,
  ObliqueImagePreviewStyle,
} from "../core/types";
import { Backdrop } from "./ObliqueImagePreview.Backdrop";
import { NativePixels } from "./ObliqueImagePreview.NativePixels";
import {
  useScenePreviewImage,
  type ScenePreviewPhoto,
  type ScenePreviewImageContent,
  type ScenePreviewImageMapping,
} from "./hooks/useScenePreviewImage";
import { usePrefetchedPreviewThumbnail } from "./hooks/usePrefetchedPreviewThumbnail";
import { previewBackdropTint } from "./utils/preview-backdrop";
import { PreviewImage } from "./ObliqueImagePreview.PreviewImage";

/**
 * Which way the image turns for a positive roll. Set against a building
 * edge in the browser; flip if the image turns away from the map.
 */
const PREVIEW_ROLL_SIGN = 1;

/** how long after the map comes to rest the backdrop fades to its calm look */
const CALM_DELAY_MS = 800;
const CALM_CONTRAST = 50;
const CALM_SATURATION = 50;

type ObliqueImagePreviewProps = {
  photo?: ScenePreviewPhoto;
  map: MaplibreMap;
  onRootChange?: (root: HTMLDivElement | null) => void;
  onImageMapping?: (mapping: ScenePreviewImageMapping | null) => void;
  onOutlineReady?: () => void;
  onDisplayReady?: () => void;
  previewPath: string;
  avifPyramidUrl?: string;
  avifOnly?: boolean;
  nativePixelSize: { width: DevicePixels; height: DevicePixels };
  imageId: string;
  minimumQualityLevel?: PreviewQualityLevel;
  halfFovTan: number;
  /** a flight to the next image is running: the image is hidden until it lands */
  dimImage: boolean;
  panEnabled?: boolean;
  /** Seamless photos have no frame or shaded surroundings. */
  seamless?: boolean;
  /** Hide the frame while the independent scene backdrop covers the transition. */
  transitioning?: boolean;
  opacityRef?: RefObject<number>;
  showBasemapLabels?: boolean;
  /** the image's roll against a level camera, degrees */
  rollDeg: number;
  interiorOrientationOffsets?: InteriorOrientationOffset;
  style?: ObliqueImagePreviewStyle;
  backdropLook: ObliqueBackdropLook;
  onClose?: () => void;
  onError?: (
    imageId: string,
    details?: { message: string; missing: boolean }
  ) => void;
};

/**
 * The preview: the image over the map, exactly where the camera sees it.
 *
 * The map underneath has been flown to the image's own pose, so the image
 * drawn at the camera's focal length and centred on the principal point
 * covers the same ground the map shows. The backdrop between them tints the
 * map and takes the click that closes the preview. The image comes in low
 * quality first and fades once the real one is there; while a flight to a
 * sibling runs it is hidden at once and fades in again on landing.
 */
export const ObliqueImagePreview: FC<ObliqueImagePreviewProps> = ({
  map,
  onRootChange,
  onImageMapping,
  onOutlineReady,
  onDisplayReady,
  previewPath,
  avifPyramidUrl,
  avifOnly = false,
  nativePixelSize,
  imageId,
  minimumQualityLevel = "0",
  photo,
  halfFovTan,
  dimImage,
  panEnabled = true,
  seamless = false,
  transitioning = false,
  opacityRef,
  showBasemapLabels = true,
  rollDeg,
  interiorOrientationOffsets = { xOffset: 0, yOffset: 0 },
  style,
  backdropLook,
  onClose,
  onError,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const attachRoot = useCallback(
    (root: HTMLDivElement | null) => {
      rootRef.current = root;
      onRootChange?.(root);
    },
    [onRootChange]
  );
  const isVertical = nativePixelSize.width < nativePixelSize.height;
  const imageAspectRatio = nativePixelSize.width / nativePixelSize.height;
  const [shouldFadeIn, setShouldFadeIn] = useState(false);
  const [contrast, setContrast] = useState(backdropLook.contrast);
  const [saturation, setSaturation] = useState(backdropLook.saturation);
  const backdropTint = useMemo(
    () => previewBackdropTint(style?.backdropColor),
    [style?.backdropColor]
  );
  // Controlled transitions hide the complete flat overlay through opacity.
  // Keep its mask configured so the ready frame can take over the drape's
  // backdrop without waiting for React to clear the transitioning flag.
  const sceneDecorations = !seamless && (!transitioning || !!opacityRef);

  const sourceKey = `${previewPath}/${imageId}`;
  const fullWorkerImageRef = useRef<{
    key: string;
    bitmap: ImageBitmap;
  } | null>(null);
  const fullContentRef = useRef<ScenePreviewImageContent | null>(null);
  const fullCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fullWorkerImageKey, setFullWorkerImageKey] = useState<string | null>(
    null
  );
  const workerPreview = true;
  const fullImageKey = `${sourceKey}/${avifPyramidUrl ?? ""}`;
  const thumbnail = usePrefetchedPreviewThumbnail(
    previewPath,
    imageId,
    fullWorkerImageKey === fullImageKey,
    {
      avifOnly,
      avifPyramidUrl,
      nativeSize: nativePixelSize,
      minimumQualityLevel,
    }
  );
  // A coarse whole photograph fills newly exposed pixels until a full substitute exists.
  const usableThumbnail = thumbnail?.bitmap ? thumbnail : null;
  const fullWorkerImage =
    fullWorkerImageRef.current?.key === fullImageKey
      ? fullWorkerImageRef.current.bitmap
      : null;
  const wholeSource = fullWorkerImage ?? usableThumbnail?.bitmap ?? null;
  fullContentRef.current = wholeSource ? { source: wholeSource } : null;
  useEffect(
    () => () => {
      const owned = fullWorkerImageRef.current;
      if (owned?.key !== fullImageKey) return;
      owned.bitmap.close();
      fullWorkerImageRef.current = null;
      if (fullCanvasRef.current)
        fullCanvasRef.current.width = fullCanvasRef.current.height = 1;
      if (fullContentRef.current?.source === owned.bitmap)
        fullContentRef.current = null;
    },
    [fullImageKey]
  );
  const loadingOptions = useRef({ onError });
  loadingOptions.current = { onError };
  const reportLoadingError = useCallback(
    (
      failedImageId = imageId,
      details = { message: "Preview loading failed", missing: false }
    ) => loadingOptions.current.onError?.(failedImageId, details),
    [imageId]
  );
  usePreviewSizeSync({
    map,
    rootRef,
    enabled: true,
    isVertical,
    imageAspectRatio,
    halfFovTan,
  });

  // a tick after mounting, so the first appearance is a fade rather than a cut
  useEffect(() => {
    const timer = window.setTimeout(() => setShouldFadeIn(true), 50);
    return () => window.clearTimeout(timer);
  }, []);

  // the backdrop is lively while the map moves and calms down once it rests
  useEffect(() => {
    if (dimImage) {
      setContrast(backdropLook.contrast);
      setSaturation(backdropLook.saturation);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setContrast(CALM_CONTRAST);
      setSaturation(CALM_SATURATION);
    }, CALM_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [dimImage, backdropLook.contrast, backdropLook.saturation]);

  const { xOffset, yOffset } = interiorOrientationOffsets;
  const sceneImage = useScenePreviewImage({
    map,
    photo,
    contentRef: fullContentRef,
    shown: !dimImage,
    opacityRef,
    onOutlineReady,
    onImageMapping: workerPreview ? undefined : onImageMapping,
    halfFovTan,
    nativeSize: nativePixelSize,
    principal: interiorOrientationOffsets,
    rollDeg: PREVIEW_ROLL_SIGN * rollDeg,
    backdropLook: seamless
      ? undefined
      : { contrast, brightness: backdropLook.brightness, saturation },
    backdropTint: seamless ? undefined : backdropTint,
    decorations: sceneDecorations,
    showBasemapLabels,
  });
  const onFullImage = useCallback(
    (bitmap: ImageBitmap) => {
      const previous = fullWorkerImageRef.current;
      fullWorkerImageRef.current = { key: fullImageKey, bitmap };
      fullContentRef.current = { source: bitmap };
      if (!sceneImage && fullCanvasRef.current) {
        const canvas = fullCanvasRef.current;
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      }
      if (previous?.bitmap !== bitmap) previous?.bitmap.close();
      setFullWorkerImageKey((key) =>
        key === fullImageKey ? key : fullImageKey
      );
      map.triggerRepaint();
    },
    [fullImageKey, map, sceneImage]
  );
  const translate = `translate(${(xOffset - 0.5) * 100}%, ${
    (yOffset - 0.5) * 100
  }%)`;
  const displaySrc = !sceneImage ? usableThumbnail?.blobUrl ?? null : null;

  return (
    <div
      ref={attachRoot}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        touchAction: "none",
      }}
      data-test-id="oblique-image-preview"
      data-oblique-preview-surface="true"
    >
      <Backdrop
        color={
          sceneImage || seamless || transitioning
            ? undefined
            : style?.backdropColor
        }
        contrast={sceneImage ? 100 : contrast}
        brightness={sceneImage ? 100 : backdropLook.brightness}
        saturation={sceneImage ? 100 : saturation}
        interactive
        panEnabled={panEnabled}
        filterEnabled={!sceneImage && !seamless && !transitioning}
        onClick={onClose}
      />
      {(displaySrc || workerPreview) && (
        <PreviewImage
          src={displaySrc}
          alt={imageId}
          onOutlineReady={onOutlineReady}
          shown={!dimImage && !sceneImage}
          fadeIn={shouldFadeIn && !dimImage}
          borderStyle={seamless || transitioning ? undefined : style?.border}
          boxShadowStyle={
            seamless || transitioning ? undefined : style?.boxShadow
          }
          translate={translate}
          rollDeg={PREVIEW_ROLL_SIGN * rollDeg}
        >
          {workerPreview && !sceneImage && (
            <canvas
              ref={fullCanvasRef}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
          )}
          {workerPreview && (
            <NativePixels
              map={map}
              photo={photo}
              rootRef={rootRef}
              path={previewPath}
              sourceUrl={avifPyramidUrl ?? ""}
              avifPyramidUrl={avifPyramidUrl}
              avifOnly={avifOnly}
              minimumQualityLevel={minimumQualityLevel}
              onFullImage={onFullImage}
              retainWholeImage
              onImageMapping={onImageMapping}
              onOutlineReady={onOutlineReady}
              onDisplayReady={onDisplayReady}
              onError={reportLoadingError}
              backdropLook={
                seamless
                  ? undefined
                  : {
                      contrast,
                      brightness: backdropLook.brightness,
                      saturation,
                    }
              }
              backdropTint={seamless ? undefined : backdropTint}
              decorations={sceneDecorations}
              showBasemapLabels={showBasemapLabels}
              imageId={imageId}
              nativeSize={nativePixelSize}
              halfFovTan={halfFovTan}
              principal={interiorOrientationOffsets}
              rollDeg={PREVIEW_ROLL_SIGN * rollDeg}
              dimImage={dimImage}
              opacityRef={opacityRef}
            />
          )}
        </PreviewImage>
      )}
    </div>
  );
};
