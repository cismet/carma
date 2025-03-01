import React from "react";
import { Typography, Space, Divider } from "antd";
import { Math as CesiumMath } from "cesium";
import styled from "styled-components";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCamera, faCompass } from "@fortawesome/free-solid-svg-icons";

import { ObliqueImageRecord } from "../helper/oblique/types";

const { Text } = Typography;

const InfoRow = styled.div`
  display: flex;
  align-items: flex-start;
  margin-bottom: 8px;
`;

const MetadataSection = styled.div`
  margin-bottom: 16px;
`;

const SectionTitle = styled(Text)`
  display: block;
  margin-bottom: 8px;
  font-weight: bold;
`;

interface ObliqueImageMetadataProps {
  imageRecord: ObliqueImageRecord;
}

export const ObliqueImageMetadata: React.FC<ObliqueImageMetadataProps> = ({
  imageRecord,
}) => {
  if (!imageRecord) return null;

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <MetadataSection>
        <SectionTitle>Grundinformationen</SectionTitle>
        <InfoRow>
          <Text type="secondary" style={{ marginRight: 8 }}>
            ID:
          </Text>
          <Text>{imageRecord.id}</Text>
        </InfoRow>
        <InfoRow>
          <Text type="secondary" style={{ marginRight: 8 }}>
            Wegpunkt:
          </Text>
          <Text>{imageRecord.waypointId || "Unbekannt"}</Text>
        </InfoRow>
        {imageRecord.cameraId && (
          <InfoRow>
            <Text type="secondary" style={{ marginRight: 8 }}>
              Kamera-ID:
            </Text>
            <Text>
              <FontAwesomeIcon icon={faCamera} style={{ marginRight: 4 }} />
              {imageRecord.cameraId}°
            </Text>
          </InfoRow>
        )}
        {imageRecord.calculatedHeading !== undefined && (
          <InfoRow>
            <Text type="secondary" style={{ marginRight: 8 }}>
              Berechneter Kurs:
            </Text>
            <Text>
              <FontAwesomeIcon icon={faCompass} style={{ marginRight: 4 }} />
              {CesiumMath.toDegrees(imageRecord.calculatedHeading).toFixed(2)}°
              {imageRecord.sector && `(${imageRecord.sector})`}
            </Text>
          </InfoRow>
        )}
      </MetadataSection>

      <Divider style={{ margin: "8px 0" }} />

      <MetadataSection>
        <SectionTitle>Position</SectionTitle>
        <InfoRow>
          <Text type="secondary" style={{ marginRight: 8 }}>
            Perspektivisches Zentrum:
          </Text>
          <Text>
            X: {imageRecord.perspectiveCenter.x.toFixed(2)}, Y:{" "}
            {imageRecord.perspectiveCenter.y.toFixed(2)}, Z:{" "}
            {imageRecord.perspectiveCenter.z.toFixed(2)}
          </Text>
        </InfoRow>
        <InfoRow>
          <Text type="secondary" style={{ marginRight: 8 }}>
            WGS84:
          </Text>
          <Text>
            Lon: {imageRecord.centerWGS84[0].toFixed(6)}°, Lat:{" "}
            {imageRecord.centerWGS84[1].toFixed(6)}°, Höhe:{" "}
            {imageRecord.centerWGS84[2].toFixed(2)}m
          </Text>
        </InfoRow>
      </MetadataSection>

      <Divider style={{ margin: "8px 0" }} />

      <MetadataSection>
        <SectionTitle>Äußere Orientierung</SectionTitle>
        <InfoRow>
          <Text type="secondary" style={{ marginRight: 8 }}>
            Omega:
          </Text>
          <Text>
            {CesiumMath.toDegrees(imageRecord.orientation.omega).toFixed(2)}°
          </Text>
        </InfoRow>
        <InfoRow>
          <Text type="secondary" style={{ marginRight: 8 }}>
            Phi:
          </Text>
          <Text>
            {CesiumMath.toDegrees(imageRecord.orientation.phi).toFixed(2)}°
          </Text>
        </InfoRow>
        <InfoRow>
          <Text type="secondary" style={{ marginRight: 8 }}>
            Kappa:
          </Text>
          <Text>
            {CesiumMath.toDegrees(imageRecord.orientation.kappa).toFixed(2)}°
          </Text>
        </InfoRow>
      </MetadataSection>

      {imageRecord.__debugRecord && (
        <>
          <Divider style={{ margin: "8px 0" }} />
          <MetadataSection>
            <SectionTitle>Debug-Informationen</SectionTitle>
            <InfoRow>
              <Text>{imageRecord.__debugRecord}</Text>
            </InfoRow>
          </MetadataSection>
        </>
      )}
    </Space>
  );
};

export default ObliqueImageMetadata;
