import React, { useEffect, useState, type RefObject } from "react";
import { styled } from "styled-components";
import { type Viewer, PerspectiveFrustum } from "cesium";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExternalLink, faFileArrowDown } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";

import { useCesiumContext } from "@carma-mapping/cesium-engine";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";

interface ObliqueImagePreviewProps {
  src: string;
  alt: string;
  isVisible: boolean;
  onOpenImageLink: () => void;
  onDirectDownload: () => void;
  onClose?: () => void;
}

const BASE_SCALE_FACTOR = 0.245;

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

const Backdrop = styled.div<{ $fadeIn: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.2);
  backdrop-filter: contrast(80%);
  z-index: 1100;
  opacity: ${(props) => (props.$fadeIn ? 1 : 0)};
  transition: opacity 0.5s linear;
  cursor: pointer;
`;

const PreviewImage = styled.img<{ width: number; $fadeIn: boolean }>`
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  min-width: ${(props) => props.width}px;
  min-height: ${(props) => props.height}px;
  height: auto;
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 50px rgba(255, 255, 255, 0.8);
  box-sizing: content-box;
  pointer-events: none;
  backdrop-filter: contrast(80%);
  z-index: 1200;
  opacity: ${(props) => (props.$fadeIn ? 1 : 0)};
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

const ObliqueImagePreview: React.FC<ObliqueImagePreviewProps> = ({
  src,
  alt,
  isVisible,
  onOpenImageLink,
  onDirectDownload,
  onClose,
}) => {
  const [shouldFadeIn, setShouldFadeIn] = useState(false);
  const [isVertical, setIsVertical] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState(1);
  const { viewerRef } = useCesiumContext();

  useEffect(() => {
    if (src) {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        setIsVertical(img.naturalWidth < img.naturalHeight);
        setImageAspectRatio(img.naturalWidth / img.naturalHeight);
      };
    }
  }, [src]);

  useEffect(() => {
    if (isVisible) {
      setShouldFadeIn(false);
      const timer = setTimeout(() => setShouldFadeIn(true), 50);

      const viewer = viewerRef?.current;
      if (viewer) {
        return () => {
          clearTimeout(timer);
        };
      }

      return () => clearTimeout(timer);
    } else {
      setShouldFadeIn(false);
    }
  }, [isVisible, viewerRef]);

  const handleBackdropClick = () => {
    if (onClose) onClose();
  };

  if (!isVisible) return null;

  const widthScaleFactor =
    BASE_SCALE_FACTOR * (isVertical ? imageAspectRatio : 1);
  const heightScaleFactor =
    BASE_SCALE_FACTOR * (isVertical ? 1 : 1 / imageAspectRatio);

  const syncedWidth = getViewerSyncedSize(viewerRef) * widthScaleFactor;
  const syncedHeight = getViewerSyncedSize(viewerRef) * heightScaleFactor;

  return (
    <div style={{ position: "absolute", width: "100%", height: "100%", overflow: "hidden" }}>
      <Backdrop $fadeIn={shouldFadeIn} onClick={handleBackdropClick} />

      <ButtonsContainer>
        <Tooltip title="Bild in hoher Qualität in neuem Tab öffnen" placement="top">
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
      </ButtonsContainer>
      <PreviewImage
        src={src}
        alt={alt}
        width={syncedWidth}
        height={syncedHeight}
        $fadeIn={shouldFadeIn}
      />
    </div>
  );
};

export default ObliqueImagePreview;
