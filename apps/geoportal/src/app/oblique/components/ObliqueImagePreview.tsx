import {
  useEffect,
  useState,
  type RefObject,
  type FC,
  type CSSProperties,
} from "react";
import { type Viewer, PerspectiveFrustum } from "cesium";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faExternalLink,
  faFileArrowDown,
} from "@fortawesome/free-solid-svg-icons";
import { Tooltip, Radio, type RadioChangeEvent } from "antd";

import { useMemoMergedDefaultOptions } from "@carma-commons/utils";
import { useCesiumContext } from "@carma-mapping/cesium-engine";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { PREVIEW_IMAGE_BASE_SCALE_FACTOR } from "../config";
import type { ObliqueImagePreviewStyle } from "../types";
import {
  type BlendMode,
  PreviewImage,
} from "./ObliqueImagePreview.PreviewImage";
import { Backdrop } from "./ObliqueImagePreview.Backdrop";

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
  style?: ObliqueImagePreviewStyle;
}

type ImageQuality = "REGULAR" | "HQ" | "BEST";

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

const defaultStyle: ObliqueImagePreviewStyle = {
  backdropColor: "rgba(75, 75, 75, 0.2)",
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
};

export const ObliqueImagePreview: FC<ObliqueImagePreviewProps> = ({
  src,
  srcHQ,
  srcOriginal,
  alt,
  isVisible,
  isDebugMode = false,
  onOpenImageLink,
  onDirectDownload,
  onClose,
  style,
  interiorOrientationOffsets = { xOffset: 0, yOffset: 0 },
}) => {
  const [shouldFadeIn, setShouldFadeIn] = useState(false);
  const [isVertical, setIsVertical] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState(1);
  const [blendMode, setBlendMode] = useState<BlendMode>("normal");
  const [currentQuality, setCurrentQuality] = useState<ImageQuality>("REGULAR");
  const [activeSource, setActiveSource] = useState(src);

  const { backdropColor, border, boxShadow } = useMemoMergedDefaultOptions(
    style,
    defaultStyle
  );

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
  const translateX = -50 + xOffset * 0.5 * 100;
  const translateY = -50 + yOffset * 0.5 * 100;

  const transform = `translate(${translateX}%, ${translateY}%)`;

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
  // seems to need no adjustment per dimension

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
        color={backdropColor}
        fadeIn={shouldFadeIn}
        isDebug={isDebugMode}
        onClick={handleBackdropClick}
      />
      <div className="absolute top-0 left-0 w-full h-svh">
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
      <PreviewImage
        src={activeSource}
        alt={alt}
        width={syncedWidth}
        height={syncedHeight}
        borderStyle={border}
        boxShadowStyle={boxShadow}
        fadeIn={shouldFadeIn}
        blendMode={blendMode}
        isDebug={isDebugMode}
        transform={transform}
      />
    </div>
  );
};

export default ObliqueImagePreview;
