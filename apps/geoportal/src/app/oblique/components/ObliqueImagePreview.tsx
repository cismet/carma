import { useCesiumContext } from "@carma-mapping/cesium-engine";
import React, { useEffect, useState } from "react";
import { styled } from "styled-components";

interface ObliqueImagePreviewProps {
  src: string;
  alt: string;
  isVisible: boolean;
  onClose?: () => void;
}

const DEFAULT_SCALE_FACTOR = 0.25;

const getViewerSyncedSize = (viewerRef: ViewerRef) => {
  const dim = Math.max(
    viewerRef.current.canvas.width,
    viewerRef.current.canvas.height
  );
  const fovFactor = Math.tan(viewerRef.current.scene.camera.frustum.fov / 2);
  return dim / fovFactor;
};

const Backdrop = styled.div<{ fadeIn: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.05);
  z-index: 10000;
  opacity: ${(props) => (props.fadeIn ? 1 : 0)};
  transition: opacity 1s ease;
  cursor: pointer;
`;

const PreviewImage = styled.img<{ width: number; fadeIn: boolean }>`
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  height: auto;
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 50px rgba(255, 255, 255, 0.8);
  box-sizing: content-box;
  pointer-events: none; // backdrop handles closing
  z-index: 10001;
  opacity: ${(props) => (props.fadeIn ? 1 : 0)};
  transition: opacity 1s ease;
`;

const ObliqueImagePreview: React.FC<ObliqueImagePreviewProps> = ({
  src,
  alt,
  isVisible,
  onClose,
}) => {
  const [imageDimensions, setImageDimensions] = useState({
    width: 512,
    height: 512,
  });
  const [shouldFadeIn, setShouldFadeIn] = useState(false);
  const [isVertical, setIsVertical] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState(1);
  const { viewerRef } = useCesiumContext();

  useEffect(() => {
    if (src) {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        setImageDimensions({
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
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
        const handleViewerChange = () => {
          setImageDimensions((prev) => ({ ...prev }));
        };

        viewer.scene.postRender.addEventListener(handleViewerChange);
        return () => {
          clearTimeout(timer);
          viewer.scene.postRender.removeEventListener(handleViewerChange);
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

  const scaleFactor =
    DEFAULT_SCALE_FACTOR * (isVertical ? imageAspectRatio : 1);

  const syncedSize = getViewerSyncedSize(viewerRef) * scaleFactor;

  return (
    <>
      <Backdrop fadeIn={shouldFadeIn} onClick={handleBackdropClick} />
      <PreviewImage
        src={src}
        alt={alt}
        width={syncedSize}
        fadeIn={shouldFadeIn}
      />
    </>
  );
};

export default ObliqueImagePreview;
