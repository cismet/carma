import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
} from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import type { PreviewQualityLevel } from "../core/constants";
import { usePreviewResolution } from "./hooks/usePreviewResolution";
import { usePreviewSizeSync } from "./hooks/usePreviewSizeSync";
import { useProgressivePreviewSource } from "./hooks/useProgressivePreviewSource";
import type {
  InteriorOrientationOffset,
  ObliqueBackdropLook,
  ObliqueImagePreviewStyle,
} from "../core/types";
import { getPreviewImageUrl } from "./utils/imageUrls";
import { Backdrop } from "./ObliqueImagePreview.Backdrop";
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
  imageId: string;
  qualityLevel: PreviewQualityLevel;
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
  imageId,
  qualityLevel,
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
  const [isVertical, setIsVertical] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState(1);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [shouldFadeIn, setShouldFadeIn] = useState(false);
  const [contrast, setContrast] = useState(backdropLook.contrast);
  const [saturation, setSaturation] = useState(backdropLook.saturation);

  const [loadedImage, setLoadedImage] = useState<{
    url: string;
    width: number;
    height: number;
  } | null>(null);
  const requestedQuality = usePreviewResolution({
    map,
    rootRef,
    previewPath,
    imageId,
    qualityLevel,
    loadedImage,
  });
  const finalPreviewUrl = useMemo(
    () => getPreviewImageUrl(previewPath, requestedQuality, imageId),
    [previewPath, requestedQuality, imageId]
  );
  const progressiveSrc = useProgressivePreviewSource({
    finalPreviewUrl,
    previewPath,
    imageId,
    onError,
  });

  // the source is shown only once the browser has it, and its shape is read
  // off it then
  useEffect(() => {
    if (!progressiveSrc) return undefined;
    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (cancelled) return;
      setIsVertical(img.naturalWidth < img.naturalHeight);
      setImageAspectRatio(img.naturalWidth / img.naturalHeight);
      setLoadedSrc(progressiveSrc);
      setLoadedImage({
        url: progressiveSrc,
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.onerror = () => {
      if (!cancelled && progressiveSrc === finalPreviewUrl) onError?.();
    };
    img.src = progressiveSrc;
    return () => {
      cancelled = true;
    };
  }, [progressiveSrc, finalPreviewUrl, onError]);

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
  const translate = `translate(${(xOffset - 0.5) * 100}%, ${
    (yOffset - 0.5) * 100
  }%)`;

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
        color={style?.backdropColor}
        contrast={contrast}
        brightness={backdropLook.brightness}
        saturation={saturation}
        interactive
        onClick={onClose}
      />
      {loadedSrc && (
        <PreviewImage
          src={loadedSrc}
          alt={imageId}
          shown={!dimImage}
          fadeIn={shouldFadeIn && !dimImage}
          borderStyle={style?.border}
          boxShadowStyle={style?.boxShadow}
          translate={translate}
          rollDeg={PREVIEW_ROLL_SIGN * rollDeg}
        />
      )}
    </div>
  );
};
