import React, { useEffect, useState, type RefObject } from "react";
import { styled } from "styled-components";
import { type Viewer, PerspectiveFrustum } from "cesium";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faExternalLink,
  faFileArrowDown,
} from "@fortawesome/free-solid-svg-icons";
import { Tooltip, Radio, type RadioChangeEvent } from "antd";

import { useCesiumContext } from "@carma-mapping/cesium-engine";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { PREVIEW_IMAGE_BASE_SCALE_FACTOR } from "../config";

interface ObliqueImagePreviewProps {
  src: string;
  srcHQ?: string; // high quality image
  srcOriginal?: string; // original image, likely not available
  alt: string;
  isVisible: boolean;
  isDebugMode?: boolean;
  onOpenImageLink?: () => void;
  onDirectDownload?: () => void;
  onClose?: () => void;
  interiorOrientationOffsets?: {
    xOffset: number;
    yOffset: number;
  };
}

type ImageQuality = "REGULAR" | "HQ" | "BEST";
type BlendMode = "normal" | "difference" | "normal50";

const getViewerSyncedSize = (viewerRef: RefObject<Viewer>) => {
  const dim = Math.max(
    viewerRef.current.canvas.width,
    viewerRef.current.canvas.height
  );
  const frustum = viewerRef.current.scene.camera.frustum;

  if (frustum instanceof PerspectiveFrustum) {
    const fovFactor = Math.tan(frustum.fov / 2);
    return dim / fovFactor;
  }
  console.warn("Unsupported frustum type");

  return dim;
};

const Backdrop = styled.div<{ $fadeIn: boolean; $isDebug?: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  ${({ $isDebug }) => {
    if (!$isDebug)
      return `
  background-color: rgba(167, 75, 75, 0.2);
`;
  }}
  backdrop-filter: contrast(${({ $isDebug }) => ($isDebug ? 85 : 80)}%);
  z-index: 1100;
  opacity: ${({ $fadeIn }) => ($fadeIn ? 1 : 0)};
  transition: opacity 0.5s linear;
  cursor: pointer;
`;

const PreviewImage = styled.img<{
  $fadeIn: boolean;
  width: number;
  height: number;
  $translate?: string;
  $isDebug?: boolean;
  $blendMode?: BlendMode;
}>`
  position: absolute;
  left: 50%;
  top: 50%;
  transform: ${({ $translate }) => $translate || "translate(-50%, -50%)"};
  ${({ $blendMode }) => {
    switch ($blendMode) {
      case "difference":
        return "mix-blend-mode: difference;";
      case "normal50":
        return "mix-blend-mode: normal !important; opacity: 0.5 !important;";
      default: // normal
        return "mix-blend-mode: normal;";
    }
  }}
  min-width: ${({ width }) => width}px;
  min-height: ${({ height }) => height}px;
  height: auto;
  box-sizing: content-box;
  pointer-events: none;
  ${({ $isDebug }) => {
    if (!$isDebug)
      return `
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 50px rgba(255, 255, 255, 0.8);
  backdrop-filter: contrast(50%);
`;
  }}
  z-index: 1200;
  opacity: ${({ $fadeIn }) => ($fadeIn ? 1 : 0)};
  transition: opacity 0.5s linear, width 0.1s linear, height 1s linear;
  overflow: hidden;
  scroll: none;
`;

const ButtonsContainer = styled.div`
  position: absolute;
  bottom: 50px;
  width: 100%;
  max-width: 800px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: row;
  justify-content: center;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  z-index: 1300;
`;

export const ObliqueImagePreview: React.FC<ObliqueImagePreviewProps> = ({
  src,
  srcHQ,
  srcOriginal,
  alt,
  isVisible,
  isDebugMode = false,
  onOpenImageLink,
  onDirectDownload,
  onClose,
  interiorOrientationOffsets = { xOffset: 0, yOffset: 0 },
}) => {
  const [shouldFadeIn, setShouldFadeIn] = useState(false);
  const [isVertical, setIsVertical] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState(1);
  const [blendMode, setBlendMode] = useState<BlendMode>("normal");
  const [currentQuality, setCurrentQuality] = useState<ImageQuality>("REGULAR");
  const [activeSource, setActiveSource] = useState(src);

  const { viewerRef } = useCesiumContext();

  const { xOffset, yOffset } = interiorOrientationOffsets;

  // Update activeSource when quality or src/srcHQ changes
  useEffect(() => {
    if (currentQuality === "HQ" && srcHQ) {
      setActiveSource(srcHQ);
    } else if (currentQuality === "BEST" && srcOriginal) {
      setActiveSource(srcOriginal);
    } else {
      setActiveSource(src);
    }
  }, [src, srcHQ, srcOriginal, currentQuality]);

  // compensate for interior orientation sensor offsets
  const translateX = `${-50 + xOffset * 0.5 * 100}%`;
  const translateY = `${-50 + yOffset * 0.5 * 100}%`;

  const translate = `translate(${translateX}, ${translateY})`;

  // Only load image for aspect ratio when visible
  useEffect(() => {
    if (isVisible && activeSource) {
      const img = new window.Image();
      img.src = activeSource;
      img.onload = () => {
        setIsVertical(img.naturalWidth < img.naturalHeight);
        setImageAspectRatio(img.naturalWidth / img.naturalHeight);
      };
    }
  }, [isVisible, activeSource]);

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

  const f = PREVIEW_IMAGE_BASE_SCALE_FACTOR;
  // seems to need no adjustmert per dimension

  const widthScaleFactor = f * (isVertical ? imageAspectRatio : 1);
  const heightScaleFactor = f * (isVertical ? 1 : 1 / imageAspectRatio);

  const syncedWidth = getViewerSyncedSize(viewerRef) * widthScaleFactor;
  const syncedHeight = getViewerSyncedSize(viewerRef) * heightScaleFactor;

  return (
    <div
      style={{
        position: "absolute",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <Backdrop
        $fadeIn={shouldFadeIn}
        $isDebug={isDebugMode}
        onClick={handleBackdropClick}
      />
      <ButtonsContainer>
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
        <Tooltip title="Vorschau schließen" placement="top">
          <div>
            <ControlButtonStyler onClick={handleBackdropClick} width="auto">
              <span className="flex-1 text-base px-4">Vorschau Schließen</span>
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
      </ButtonsContainer>
      <PreviewImage
        src={activeSource}
        alt={alt}
        width={syncedWidth}
        height={syncedHeight}
        $fadeIn={shouldFadeIn}
        $blendMode={blendMode}
        $isDebug={isDebugMode}
        $translate={translate}
      />
    </div>
  );
};

export default ObliqueImagePreview;
