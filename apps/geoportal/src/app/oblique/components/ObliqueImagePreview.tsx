import React, { useEffect, useState } from "react";
import { styled } from "styled-components";

interface ObliqueImagePreviewProps {
  src: string;
  alt: string;
  isVisible: boolean;
  onClose?: () => void;
  scale?: number; // Optional scale factor based on footprint size
  naturalWidth?: number; // Optional natural width of the image
  naturalHeight?: number; // Optional natural height of the image
}



const PreviewContainer = styled.div<{ fadeIn: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  opacity: ${(props) => (props.fadeIn ? 1 : 0)};
  transition: opacity 1s ease;
  cursor: pointer;
`;

interface ImageContentProps {
  width: number;
  height: number;
  isPlaceholder?: boolean;
}

const ImageContent = styled.div<ImageContentProps>`
  width: ${(props) => props.width}px;
  height: ${(props) => props.height}px;
  ${props => props.isPlaceholder ? `
    border: 3px dashed rgba(255, 255, 255, 0.7);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.8);
    font-size: 16px;
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.2);
  ` : ''}
`;

const PreviewImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: default;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
`;

const ObliqueImagePreview: React.FC<ObliqueImagePreviewProps> = ({
  src,
  alt,
  isVisible,
  onClose,
  scale = 800,
  naturalWidth = 800,
  naturalHeight = 800,
}) => {
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({
    width: naturalWidth,
    height: naturalHeight,
  });
  const [shouldFadeIn, setShouldFadeIn] = useState(false);

  // Preload image and get actual dimensions when source changes, even when not visible
  useEffect(() => {
    if (src) {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        setImageDimensions({
          width: img.naturalWidth || naturalWidth,
          height: img.naturalHeight || naturalHeight,
        });
        setIsImageLoaded(true);
      };
    }
  }, [src, naturalWidth, naturalHeight]);

  // Handle visibility changes separately
  useEffect(() => {
    if (isVisible) {
      // First reset fade, then after a tiny delay, enable it
      setShouldFadeIn(false);
      const timer = setTimeout(() => setShouldFadeIn(true), 50);
      return () => clearTimeout(timer);
    } else {
      setShouldFadeIn(false);
    }
  }, [isVisible]);

  const handleBackdropClick = () => {
    if (onClose) {
      onClose();
    }
  };

  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  if (!isVisible) {
    return null;
  }

  // Calculate image dimensions based on scale and actual image aspect ratio
  const aspectRatio = imageDimensions.width / imageDimensions.height;
  const imageWidth = scale * aspectRatio;
  const imageHeight = scale;

  return (
    isVisible && (
      <PreviewContainer fadeIn={shouldFadeIn} onClick={handleBackdropClick}>
        {!isImageLoaded ? (
          <ImageContent
            width={imageWidth}
            height={imageHeight}
            isPlaceholder
          >
            <span>Luftbild wird geladen...</span>
          </ImageContent>
        ) : (
          <ImageContent
            width={imageWidth}
            height={imageHeight}
            onClick={handleImageClick}
          >
            <PreviewImage
              src={src}
              alt={alt}
              onClick={handleImageClick}
            />
          </ImageContent>
        )}
      </PreviewContainer>
    )
  );
};

export default ObliqueImagePreview;
