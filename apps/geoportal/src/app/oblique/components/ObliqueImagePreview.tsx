import {
  useEffect,
  useState,
  useRef,
  type FC,
  type CSSProperties,
} from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faExternalLink,
  faFileArrowDown,
} from "@fortawesome/free-solid-svg-icons";
import { Tooltip, Radio, type RadioChangeEvent } from "antd";

import { useCesiumContext } from "@carma-mapping/engines/cesium";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { PREVIEW_IMAGE_BASE_SCALE_FACTOR } from "../config";
import type { ObliqueImagePreviewStyle } from "../types";
import {
  type BlendMode,
  PreviewImage,
} from "./ObliqueImagePreview.PreviewImage";
import { Backdrop } from "./ObliqueImagePreview.Backdrop";
import { ContactMailButton } from "@carma-appframeworks/portals";
import { ObliqueDirectionControlsCompact } from "./ObliqueDirectionControls.Compact";
import type { CardinalDirectionEnum } from "../utils/orientationUtils";
import { getViewerSyncedDimensions } from "../utils/getViewerSyncedDimensions";
import { useProgressivePreviewSource } from "../hooks/useProgressivePreviewSource";
import { useForwardZoomEventsToCesium } from "../hooks/useForwardZoomEventsToCesium";

interface ObliqueImagePreviewProps {
  // Base path for progressive preview levels (for level 6 initial load)
  previewPath: string;
  imageId: string;
  isVisible: boolean;
  isDebugMode?: boolean;
  onOpenImageLink?: () => void;
  onDirectDownload?: () => void;
  onClose?: () => void;
  // When true, only the image element should fade out (overlay stays visible)
  dimImage?: boolean;
  // Called when current active image source has finished loading
  onImageLoaded?: () => void;
  // Incremented by parent when fly-to animation completes; gates showing next image
  flyCompletionTick?: number;
  // Called once next image has been swapped into current buffer
  onSwapComplete?: () => void;
  interiorOrientationOffsets?: {
    xOffset: number;
    yOffset: number;
  };
  style?: ObliqueImagePreviewStyle;
  // Base brightness for backdrop filter to brighten the 3D mesh
  brightnessBase?: number;
  // Base contrast for backdrop filter after movement settles
  contrastBase?: number;
  // Base saturation for backdrop filter
  saturationBase?: number;
  // Show compact direction controls between download and report
  showCompactDirectionControls?: boolean;
  // Direction controls inputs (optional)
  rotateCamera?: (clockwise: boolean) => void;
  rotateToDirection?: (d: CardinalDirectionEnum) => void;
  activeDirection?: CardinalDirectionEnum;
  siblingCallbacks?: Partial<Record<CardinalDirectionEnum, () => void>>;
  isDirectionLoading?: boolean;
  // When true, allow preloading the next buffer image
  preloadNextEnabled?: boolean;
}

type ImageQuality = "REGULAR" | "HQ" | "BEST";

// Note: backdrop dimming hole logic removed per latest requirement.

const defaultStyle: ObliqueImagePreviewStyle = {
  backdropColor: "rgba(0, 0, 0, 0.13)",
  border: "2px solid rgba(255, 255, 255, 0.9)",
  boxShadow: "0 0 50px rgba(255, 255, 255, 0.8)",
};

const ControlsContainerStyle: CSSProperties = {
  position: "absolute",
  bottom: "50px",
  width: "100%",
  maxWidth: "800px",
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  flexDirection: "row",
  justifyContent: "center",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "10px",
  zIndex: 1300,
  pointerEvents: "auto",
};

export const ObliqueImagePreview: FC<ObliqueImagePreviewProps> = ({
  previewPath,
  imageId,
  isVisible,
  isDebugMode = false,
  onOpenImageLink,
  onDirectDownload,
  onClose,
  dimImage = false,
  onImageLoaded,
  flyCompletionTick,
  onSwapComplete,
  style,
  interiorOrientationOffsets = { xOffset: 0, yOffset: 0 },
  brightnessBase = 100,
  contrastBase = 85,
  saturationBase = 100,
  showCompactDirectionControls = true,
  rotateCamera,
  rotateToDirection,
  activeDirection,
  siblingCallbacks,
  isDirectionLoading = false,
  preloadNextEnabled = false,
}) => {
  const [shouldFadeIn, setShouldFadeIn] = useState(false);
  const [isVertical, setIsVertical] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState(1);
  const [blendMode, setBlendMode] = useState<BlendMode>("normal");
  const [currentQuality, setCurrentQuality] = useState<ImageQuality>("REGULAR");
  // activeSource now derived from progressive hook, starting at level 6 then upgrading
  const [activeSource, setActiveSource] = useState<string | null>(null);
  // Double buffer sources
  const [currentSrc, setCurrentSrc] = useState<string | null>(null);
  const [nextSrc, setNextSrc] = useState<string | null>(null);
  const [nextLoaded, setNextLoaded] = useState(false);
  const [canShowNext, setCanShowNext] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [currentLoaded, setCurrentLoaded] = useState(false);
  // Merge style with defaults
  const mergedStyle = { ...defaultStyle, ...(style ?? {}) };
  const { backdropColor, border, boxShadow } = mergedStyle;

  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);

  const ctx = useCesiumContext();
  const { rootRef, onWheel, fovOverride } = useForwardZoomEventsToCesium();

  const { xOffset, yOffset } = interiorOrientationOffsets;

  // Quality can be controlled via debug UI; default is REGULAR

  // Progressive: resolve target quality *final* source
  const [finalPreviewSrc, setFinalPreviewSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!previewPath || !imageId) {
      setFinalPreviewSrc(null);
      return;
    }
    // Map quality selection to preview level
    // REGULAR -> LEVEL_3, HQ -> LEVEL_2, BEST -> LEVEL_1 (might be missing)
    const base = previewPath;
    const level =
      currentQuality === "HQ" ? "2" : currentQuality === "BEST" ? "1" : "3";
    setFinalPreviewSrc(`${base}/${level}/${imageId}.jpg`);
  }, [previewPath, imageId, currentQuality]);

  // Hook to get progressive low-quality-first source
  // Import locally to avoid side-effects if not used elsewhere
  // (kept inline import style consistent with existing ordering rules for local modules)
  const progressiveSrc = useProgressivePreviewSource({
    finalPreviewUrl: finalPreviewSrc || null,
    previewPath,
    imageId,
    resetKey: finalPreviewSrc,
  });

  // Update activeSource and seed buffers when progressive src changes
  useEffect(() => {
    // Only handle when progressiveSrc changes to a new url
    if (!progressiveSrc || progressiveSrc === currentSrc) return;
    setActiveSource(progressiveSrc);
    setCurrentLoaded(false);
    setCurrentSrc(progressiveSrc);
  }, [progressiveSrc, currentSrc]);
  // Preload currentSrc before rendering
  useEffect(() => {
    if (!currentSrc) return;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => setCurrentLoaded(true);
    img.src = currentSrc;
  }, [currentSrc]);

  // On opening preview, reset buffers and gating state to avoid stale/null image
  const prevVisibleRef = useRef(false);
  const prevImageIdRef = useRef<string | null>(null);
  useEffect(() => {
    const imageChanged =
      prevImageIdRef.current && prevImageIdRef.current !== imageId;
    if ((isVisible && !prevVisibleRef.current) || imageChanged) {
      // Clear buffers; progressive effect will seed new image
      setCurrentSrc(null);
      setNextSrc(null);
      setNextLoaded(false);
      setShowNext(false);
      setCanShowNext(false);
    }
    prevVisibleRef.current = isVisible;
    prevImageIdRef.current = imageId;
  }, [isVisible, imageId]);

  // If preview is shown again and image buffer was cleared, initialize from active source
  useEffect(() => {
    if (isVisible && !currentSrc && activeSource) {
      setCurrentSrc(activeSource);
    }
  }, [isVisible, currentSrc, activeSource]);

  // Backdrop filter dynamics: while moving, use base values; on static, fade down to 50
  useEffect(() => {
    if (dimImage) {
      setContrast(contrastBase);
      setSaturation(saturationBase);
      return;
    }
    const t = window.setTimeout(() => {
      setContrast(50);
      setSaturation(50);
    }, 800);
    return () => window.clearTimeout(t);
  }, [dimImage, contrastBase, saturationBase]);

  // Prepare next buffer when activeSource changes
  useEffect(() => {
    if (!activeSource) return;
    // Guard: if imageId changed after nextSrc set, discard it
    if (nextSrc && prevImageIdRef.current !== imageId) {
      setNextSrc(null);
      setNextLoaded(false);
    }
    if (!currentSrc) {
      if (dimImage) {
        setNextSrc(activeSource);
        setNextLoaded(false);
      } else {
        setCurrentSrc(activeSource);
      }
      return;
    }
    if (activeSource === currentSrc) return;
    setNextSrc(activeSource);
    setNextLoaded(false);
  }, [activeSource, currentSrc, dimImage, imageId, nextSrc]);

  // Preload next source
  useEffect(() => {
    if (!nextSrc || !preloadNextEnabled) return;
    const img = new window.Image();
    img.decoding = "async";
    img.onload = () => {
      setNextLoaded(true);
      if (onImageLoaded) onImageLoaded();
    };
    img.src = nextSrc;
  }, [nextSrc, onImageLoaded, preloadNextEnabled]);

  // Gate swap: show next when (a) fly completed or not dimming, and (b) next is loaded
  useEffect(() => {
    if (nextLoaded && (canShowNext || !dimImage)) {
      setShowNext(true);
    }
  }, [nextLoaded, canShowNext, dimImage]);

  // Fly completion allows showing next
  useEffect(() => {
    if (flyCompletionTick == null) return;
    setCanShowNext(true);
  }, [flyCompletionTick]);

  // Finalize swap after fade begins
  useEffect(() => {
    if (!showNext || !nextSrc) return;
    const t = setTimeout(() => {
      setCurrentSrc(nextSrc);
      setNextSrc(null);
      setNextLoaded(false);
      setShowNext(false);
      setCanShowNext(false);
      if (onSwapComplete) onSwapComplete();
    }, 16); // finalize quickly after mounting next
    return () => clearTimeout(t);
  }, [showNext, nextSrc, onSwapComplete]);

  // When a move starts (dimImage true), ensure we reset swap gating state
  useEffect(() => {
    if (!dimImage) return;
    setShowNext(false);
    setCanShowNext(false);
    // old image fades out instantly; drop it from DOM by clearing src
    setCurrentSrc(null);
  }, [dimImage]);

  // compensate for interior orientation sensor offsets
  const translateX = (xOffset - 0.5) * 100;
  const translateY = (yOffset - 0.5) * 100;

  const transform = `translate(${translateX}%, ${translateY}%)`;

  // Only load image for aspect ratio when visible
  useEffect(() => {
    if (isVisible && currentSrc) {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        setIsVertical(img.naturalWidth < img.naturalHeight);
        setImageAspectRatio(img.naturalWidth / img.naturalHeight);
      };
      img.src = currentSrc;
    }
  }, [isVisible, currentSrc]);

  useEffect(() => {
    if (isVisible) {
      setShouldFadeIn(false);
      const timer = setTimeout(() => setShouldFadeIn(true), 50);
      return () => clearTimeout(timer);
    } else {
      setShouldFadeIn(false);
    }
  }, [isVisible]);

  const handleBackdropClick = () => {
    if (onClose) onClose();
  };

  const handleBlendModeChange = (e: RadioChangeEvent) => {
    setBlendMode(e.target.value as BlendMode);
  };

  const handleQualityChange = (e: RadioChangeEvent) => {
    setCurrentQuality(e.target.value as ImageQuality);
  };

  if (!isVisible) return null;

  const { syncedWidth, syncedHeight } = getViewerSyncedDimensions(
    ctx,
    isVertical,
    imageAspectRatio,
    PREVIEW_IMAGE_BASE_SCALE_FACTOR,
    fovOverride
  );

  return (
    <div
      ref={rootRef}
      onWheel={onWheel}
      style={{
        position: "absolute",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <Backdrop
        color={backdropColor}
        contrast={contrast}
        brightness={brightnessBase}
        saturation={saturation}
        isDebug={isDebugMode}
        interactive={isVisible}
        onClick={handleBackdropClick}
      />
      <div
        className="absolute top-0 left-0 w-full h-svh"
        style={{ zIndex: 1500, pointerEvents: "none" }}
      >
        <div style={ControlsContainerStyle}>
          <Tooltip title="Bild in neuem Tab öffnen" placement="top">
            <div>
              <ControlButtonStyler onClick={onOpenImageLink} width="auto">
                <span className="flex-1 text-base px-4">
                  <FontAwesomeIcon icon={faExternalLink} className="mr-2" />
                  Bild öffnen
                </span>
              </ControlButtonStyler>
            </div>
          </Tooltip>
          <Tooltip title="Bild direkt herunterladen" placement="top">
            <div>
              <ControlButtonStyler onClick={onDirectDownload} width="auto">
                <span className="flex-1 text-base px-4">
                  <FontAwesomeIcon icon={faFileArrowDown} className="mr-2" />
                  Herunterladen
                </span>
              </ControlButtonStyler>
            </div>
          </Tooltip>
          {showCompactDirectionControls && rotateCamera && (
            <ObliqueDirectionControlsCompact
              rotateCamera={rotateCamera}
              rotateToDirection={rotateToDirection || (() => {})}
              activeDirection={activeDirection}
              isLoading={isDirectionLoading}
              siblingCallbacks={siblingCallbacks}
            />
          )}
          <ContactMailButton
            width="160px"
            emailAddress="geodatenzentrum@stadt.wuppertal.de"
            subjectPrefix="Datenschutzprüfung Luftbildschrägaufnahme"
            productName="Luftbildschrägaufnahmen"
            portalName="Wuppertaler Geodatenportal"
            imageId={imageId}
            imageUri={finalPreviewSrc || undefined}
            tooltip={{
              title: "Datenschutzprüfung Luftbildschrägaufnahme",
              placement: "top",
            }}
          />
          <Tooltip title="Vorschau schließen" placement="top">
            <div>
              <ControlButtonStyler onClick={handleBackdropClick} width="auto">
                <span className="flex-1 text-base px-4">
                  Vorschau Schließen
                </span>
              </ControlButtonStyler>
            </div>
          </Tooltip>
          {/* Force a new row for the radio groups */}
          {isDebugMode && (
            <>
              <div style={{ flexBasis: "100%", height: 0 }} />
              <Radio.Group
                value={currentQuality}
                onChange={handleQualityChange}
                optionType="button"
                buttonStyle="solid"
                size="small"
                style={{ marginLeft: "10px" }}
              >
                <Radio.Button value="REGULAR">Standard (L3)</Radio.Button>
                <Radio.Button value="HQ">HQ (L2)</Radio.Button>
                <Radio.Button value="BEST">(L1 N/A)</Radio.Button>
              </Radio.Group>
              <Radio.Group
                value={blendMode}
                onChange={handleBlendModeChange}
                optionType="button"
                buttonStyle="solid"
                size="small"
                style={{ marginLeft: "10px" }}
              >
                <Radio.Button value="normal">Normal</Radio.Button>
                <Radio.Button value="difference">Difference</Radio.Button>
                <Radio.Button value="normal50">50% Opacity</Radio.Button>
              </Radio.Group>
            </>
          )}
        </div>
      </div>
      {currentSrc && currentLoaded && !dimImage && !showNext && (
        <PreviewImage
          src={currentSrc}
          alt={imageId ?? "Oblique Image Preview"}
          width={syncedWidth}
          height={syncedHeight}
          borderStyle={border}
          boxShadowStyle={boxShadow}
          fadeIn={shouldFadeIn}
          blendMode={blendMode}
          isDebug={isDebugMode}
          transform={transform}
        />
      )}
      {nextSrc && (
        <PreviewImage
          src={nextSrc}
          alt={imageId ?? "Oblique Image Preview (next)"}
          width={syncedWidth}
          height={syncedHeight}
          borderStyle={border}
          boxShadowStyle={boxShadow}
          fadeIn={shouldFadeIn && showNext}
          blendMode={blendMode}
          isDebug={isDebugMode}
          transform={transform}
        />
      )}
    </div>
  );
};

export default ObliqueImagePreview;
