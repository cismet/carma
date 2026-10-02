import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
} from "react";
import type { DevicePixels } from "@carma-units";
import type { Map as MaplibreMap } from "maplibre-gl";

import { PREVIEW_QUALITY, type PreviewQualityLevel } from "../core/constants";
import { usePreviewResolution } from "./hooks/usePreviewResolution";
import { usePreviewSizeSync } from "./hooks/usePreviewSizeSync";
import { useProgressivePreviewSource } from "./hooks/useProgressivePreviewSource";
import type {
  InteriorOrientationOffset,
  ObliqueBackdropLook,
  ObliqueImagePreviewStyle,
} from "../core/types";
import { getPreviewImageUrl, loadPreviewImage } from "./utils/imageUrls";
import { Backdrop } from "./ObliqueImagePreview.Backdrop";
import { NativePixels } from "./ObliqueImagePreview.NativePixels";
import { useScenePreviewImage } from "./hooks/useScenePreviewImage";
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
  map: MaplibreMap;
  onRootChange?: (root: HTMLDivElement | null) => void;
  previewPath: string;
  originalPixelPreviewPath?: string;
  nativePixelSize: { width: DevicePixels; height: DevicePixels };
  imageId: string;
  qualityLevel: PreviewQualityLevel;
  minimumQualityLevel?: PreviewQualityLevel;
  halfFovTan: number;
  /** a flight to the next image is running: the image is hidden until it lands */
  dimImage: boolean;
  /** the image's roll against a level camera, degrees */
  rollDeg: number;
  interiorOrientationOffsets?: InteriorOrientationOffset;
  style?: ObliqueImagePreviewStyle;
  backdropLook: ObliqueBackdropLook;
  onClose?: () => void;
  onError?: () => void;
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
  previewPath,
  originalPixelPreviewPath,
  nativePixelSize,
  imageId,
  qualityLevel,
  minimumQualityLevel = "0",
  halfFovTan,
  dimImage,
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

  const sourceKey = `${previewPath}/${imageId}`;
  const [decodedImage, setDecodedImage] = useState<{
    sourceKey: string;
    url: string;
    width: number;
    height: number;
    element?: HTMLImageElement;
  } | null>(null);
  const loadedImage =
    decodedImage?.sourceKey === sourceKey ? decodedImage : null;
  const loadedSrc = loadedImage?.url ?? null;
  const workerPreview =
    typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined";
  const thumbnail = usePrefetchedPreviewThumbnail(
    previewPath,
    imageId,
    !!loadedImage && !workerPreview
  );
  const requestedQuality = usePreviewResolution({
    map,
    rootRef,
    previewPath,
    imageId,
    qualityLevel,
    loadedImage,
    minimumLevel: originalPixelPreviewPath ? "1" : minimumQualityLevel,
  });
  const finalPreviewUrl = useMemo(
    () => getPreviewImageUrl(previewPath, requestedQuality, imageId),
    [previewPath, requestedQuality, imageId]
  );
  const loadingOptions = useRef({ finalPreviewUrl, onError });
  loadingOptions.current = { finalPreviewUrl, onError };
  const reportLoadingError = useCallback(
    () => loadingOptions.current.onError?.(),
    []
  );
  const progressiveSrc = useProgressivePreviewSource({
    finalPreviewUrl: workerPreview ? null : finalPreviewUrl,
    previewPath: workerPreview ? undefined : previewPath,
    imageId: workerPreview ? undefined : imageId,
    onError: reportLoadingError,
  });
  // The progressive hook can expose its preceding key until its source-change effect runs.
  const currentProgressiveSrc =
    progressiveSrc &&
    Object.values(PREVIEW_QUALITY).some(
      (level) =>
        progressiveSrc === getPreviewImageUrl(previewPath, level, imageId)
    )
      ? progressiveSrc
      : null;

  // Keep the decoded progressive source while its next resolution loads.
  useEffect(() => {
    if (workerPreview || !currentProgressiveSrc) return undefined;
    let cancelled = false;
    void loadPreviewImage(currentProgressiveSrc)
      .then((img) => {
        if (cancelled) return;
        setDecodedImage({
          sourceKey,
          url: currentProgressiveSrc,
          width: img.naturalWidth,
          height: img.naturalHeight,
          element: img,
        });
      })
      .catch(() => {
        if (
          !cancelled &&
          currentProgressiveSrc === loadingOptions.current.finalPreviewUrl
        )
          loadingOptions.current.onError?.();
      });
    return () => {
      cancelled = true;
    };
  }, [currentProgressiveSrc, sourceKey, workerPreview]);

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
    source: loadedImage?.element ?? thumbnail?.bitmap ?? null,
    shown: !dimImage,
    halfFovTan,
    nativeSize: nativePixelSize,
    principal: interiorOrientationOffsets,
    rollDeg: PREVIEW_ROLL_SIGN * rollDeg,
    backdropLook: { contrast, brightness: backdropLook.brightness, saturation },
    backdropTint,
  });
  const translate = `translate(${(xOffset - 0.5) * 100}%, ${
    (yOffset - 0.5) * 100
  }%)`;
  const displaySrc =
    !sceneImage && !workerPreview
      ? loadedSrc ?? thumbnail?.blobUrl ?? null
      : null;
  const onSourceLoaded = useCallback(
    (url: string, width: number, height: number) => {
      setDecodedImage((previous) =>
        previous?.sourceKey === sourceKey && previous.url === url
          ? previous
          : { sourceKey, url, width, height }
      );
    },
    [sourceKey]
  );

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
    >
      <Backdrop
        color={sceneImage ? undefined : style?.backdropColor}
        contrast={sceneImage ? 100 : contrast}
        brightness={sceneImage ? 100 : backdropLook.brightness}
        saturation={sceneImage ? 100 : saturation}
        interactive
        filterEnabled={!sceneImage}
        onClick={onClose}
      />
      {(displaySrc || workerPreview) && (
        <PreviewImage
          src={displaySrc}
          alt={imageId}
          shown={!dimImage && !sceneImage}
          fadeIn={shouldFadeIn && !dimImage}
          borderStyle={style?.border}
          boxShadowStyle={style?.boxShadow}
          translate={translate}
          rollDeg={PREVIEW_ROLL_SIGN * rollDeg}
        >
          {(originalPixelPreviewPath || workerPreview) && (
            <NativePixels
              map={map}
              rootRef={rootRef}
              path={originalPixelPreviewPath ?? previewPath}
              sourceUrl={originalPixelPreviewPath ? undefined : finalPreviewUrl}
              onSourceLoaded={onSourceLoaded}
              onError={reportLoadingError}
              backdropLook={{
                contrast,
                brightness: backdropLook.brightness,
                saturation,
              }}
              backdropTint={backdropTint}
              imageId={imageId}
              nativeSize={nativePixelSize}
              halfFovTan={halfFovTan}
              principal={interiorOrientationOffsets}
              rollDeg={PREVIEW_ROLL_SIGN * rollDeg}
              dimImage={dimImage}
            />
          )}
        </PreviewImage>
      )}
    </div>
  );
};
