import React, { useState, useEffect } from "react";
import { Card, Typography, Button, Image } from "antd";
import { styled } from "styled-components";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCamera,
  faTimes,
  faLocationArrow,
} from "@fortawesome/free-solid-svg-icons";

import { useObliqueDataContext } from "./ObliqueDataContext";
import { ObliqueImageMetadata } from "./ObliqueImageMetadata";
import { ObliqueImageRecord } from "../types";
import { getPreviewImageUrl } from "../utils/imageHandling";

const { Text } = Typography;

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
  width: 400px;
  max-width: calc(100vw - 20px);
  padding: 0;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  overflow: hidden;
`;

const InfoHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #1890ff;
  padding: 8px 16px;
`;

const InfoTitle = styled.div`
  display: flex;
  align-items: center;
`;

const InfoContent = styled.div`
  padding: 16px;
  margin-top: 16px;
`;

const InfoRow = styled.div`
  display: flex;
  align-items: flex-start;
  margin-bottom: 8px;
`;

const ImagePreviewContainer = styled.div`
  width: 100%;
  margin-bottom: 0;
  border-radius: 0;
  overflow: hidden;
  padding: 0;
  aspect-ratio: 1;
`;

const ImagePlaceholder = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  aspect-ratio: 1;
  background-color: #f0f0f0;
  color: #bfbfbf;
  font-size: 14px;
`;

function formatDistance(meters: number | null): string {
  if (meters === null) return "k/a";
  if (meters < 1) return "<1m";
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(2)}km`;
}

export const ObliqueImageInfo: React.FC<ObliqueImageInfoProps> = ({
  imageRecord,
  distance,
  onClose,
  flyToImage,
}) => {
  const [imageError, setImageError] = useState(false);
  const [showFullMetadata, setShowFullMetadata] = useState(false);
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

  return (
    <InfoCard>
      <InfoHeader>
        <InfoTitle>
          <FontAwesomeIcon icon={faCamera} style={{ marginRight: 8 }} />
          <Text style={{ color: "white" }}>Nächstes Schrägbild</Text>
        </InfoTitle>
        {onClose && (
          <Button
            type="text"
            size="small"
            icon={<FontAwesomeIcon icon={faTimes} style={{ color: "white" }} />}
            onClick={onClose}
            style={{ color: "white" }}
            aria-label="Informationspanel schließen"
          />
        )}
      </InfoHeader>

      <div>
        <ImagePreviewContainer>
          {previewImageUrl && !imageError ? (
            <Image
              src={previewImageUrl}
              alt={`Vorschau des Schrägbildes ${imageRecord.id}`}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
              onError={() => setImageError(true)}
            />
          ) : (
            <ImagePlaceholder>Bild nicht verfügbar</ImagePlaceholder>
          )}
        </ImagePreviewContainer>

        <InfoContent>
          {flyToImage && (
            <Button
              type="primary"
              icon={<FontAwesomeIcon icon={faLocationArrow} />}
              onClick={handleFlyToImage}
              style={{ marginBottom: 16, width: "100%" }}
            >
              Zum Bildstandort fliegen
            </Button>
          )}

          <InfoRow>
            <Text type="secondary" style={{ marginRight: 8 }}>
              ID:
            </Text>
            <Text strong>{imageRecord.id}</Text>
          </InfoRow>

          {showFullMetadata ? (
            <>
              <ObliqueImageMetadata imageRecord={imageRecord} />
              <Button
                type="link"
                onClick={() => setShowFullMetadata(false)}
                style={{ padding: 0, marginBottom: 8 }}
              >
                Weniger anzeigen
              </Button>
            </>
          ) : (
            <>
              <InfoRow>
                <Text type="secondary" style={{ marginRight: 8 }}>
                  Entfernung:
                </Text>
                <Text>{formatDistance(distance)}</Text>
              </InfoRow>

              <Button
                type="link"
                onClick={() => setShowFullMetadata(true)}
                style={{ padding: 0, marginBottom: 8 }}
              >
                Alle Metadaten anzeigen
              </Button>
            </>
          )}
        </InfoContent>
      </div>
    </InfoCard>
  );
};

export default ObliqueImageInfo;
