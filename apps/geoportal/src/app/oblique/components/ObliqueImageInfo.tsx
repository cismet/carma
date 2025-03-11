import React, { useState, useEffect } from "react";
import { Card, Button, Image } from "antd";
import { styled } from "styled-components";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes, faLocationArrow } from "@fortawesome/free-solid-svg-icons";
import { ObliqueImageRecord } from "../types";
import { useObliqueDataContext } from "./ObliqueDataContext";
import { getPreviewImageUrl } from "../utils/imageHandling";

interface ObliqueImageInfoProps {
  imageRecord: ObliqueImageRecord | null;
  distance: number | null;
  onClose?: () => void;
  flyToImage?: (record: ObliqueImageRecord) => void;
}

const InfoCard = styled(Card)`
  position: absolute;
  top: 10px;
  right: 10px;
  width: 450px;
  max-width: calc(100vw - 20px);
  padding: 0;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  overflow: hidden;
`;

const CloseButton = styled(Button)`
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 10;
`;

const InfoContent = styled.div`
  padding: 8px;
`;

const ImagePreviewContainer = styled.div`
  width: 100%;
  margin-bottom: 8px;
  border-radius: 4px;
  overflow: hidden;
  aspect-ratio: 1;
`;

const ImagePlaceholder = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  aspect-ratio: 1;
  background-color: #f5f5f5;
  color: #bfbfbf;
  font-size: 14px;
`;

const JsonDisplay = styled.pre`
  font-family: monospace;
  font-size: 12px;
  background-color: #f5f5f5;
  padding: 8px;
  border-radius: 4px;
  overflow: auto;
  max-height: 60vh;
  white-space: pre-wrap;
  margin-top: 8px;
  margin-bottom: 0;
`;

const ButtonContainer = styled.div`
  margin-bottom: 8px;
`;

export const ObliqueImageInfo: React.FC<ObliqueImageInfoProps> = ({
  imageRecord,
  distance,
  onClose,
  flyToImage,
}) => {
  const [imageError, setImageError] = useState(false);
  const { previewQualityLevel, previewPath } = useObliqueDataContext();

  // Reset the error state when the image record changes
  useEffect(() => {
    setImageError(false);
  }, [imageRecord]);

  if (!imageRecord) return null;

  const previewImageUrl = getPreviewImageUrl(
    previewPath,
    previewQualityLevel,
    imageRecord.id
  );

  const handleFlyToImage = () => {
    if (flyToImage) {
      flyToImage(imageRecord);
    }
  };

  // Function to filter out properties we don't want to show
  const cleanRecord = (record: any) => {
    const { quaternion, rotationMatrix, cartesian, ...rest } = record;

    // Include distance information
    return {
      ...rest,
      distance: distance !== null ? `${distance.toFixed(2)}m` : "Unknown",
    };
  };

  return (
    <InfoCard bordered={false}>
      {onClose && (
        <CloseButton
          type="text"
          size="small"
          icon={<FontAwesomeIcon icon={faTimes} />}
          onClick={onClose}
          aria-label="Close"
        />
      )}

      <InfoContent>
        <ImagePreviewContainer>
          {previewImageUrl && !imageError ? (
            <Image
              src={previewImageUrl}
              alt={`Image preview ${imageRecord.id}`}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
              onError={() => setImageError(true)}
              preview={{
                toolbarRender: () => null,
              }}
            />
          ) : (
            <ImagePlaceholder>Image not available</ImagePlaceholder>
          )}
        </ImagePreviewContainer>

        {flyToImage && (
          <ButtonContainer>
            <Button
              type="primary"
              icon={<FontAwesomeIcon icon={faLocationArrow} />}
              onClick={handleFlyToImage}
              style={{ width: "100%" }}
              size="small"
            >
              Fly to Image Position
            </Button>
          </ButtonContainer>
        )}

        <JsonDisplay>
          {JSON.stringify(cleanRecord(imageRecord), null, 2)}
        </JsonDisplay>
      </InfoContent>
    </InfoCard>
  );
};

export default ObliqueImageInfo;
