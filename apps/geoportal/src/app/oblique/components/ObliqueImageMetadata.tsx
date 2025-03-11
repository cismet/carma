import React from "react";
import { Typography, Card, Space } from "antd";
import { Math as CesiumMath } from "cesium";
import styled from "styled-components";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCamera, faCompass } from "@fortawesome/free-solid-svg-icons";

import { ObliqueImageRecord } from "../types";

const { Text } = Typography;

const InfoRow = styled.div`
  display: flex;
  align-items: flex-start;
  margin-bottom: 4px;
`;

const MetadataSection = styled.div`
  margin-bottom: 12px;
`;

const SectionTitle = styled(Text)`
  display: block;
  margin-bottom: 4px;
  font-weight: bold;
`;

const CompactCard = styled(Card)`
  .ant-card-body {
    padding: 12px;
  }
`;

interface ObliqueImageMetadataProps {
  imageRecord: ObliqueImageRecord;
}

export const ObliqueImageMetadata: React.FC<ObliqueImageMetadataProps> = ({
  imageRecord,
}) => {
  if (!imageRecord) return null;

  return (
    <CompactCard size="small">
      <Space direction="vertical" size="small" style={{ width: "100%" }}>
        <InfoRow>
          <Text strong style={{ marginRight: 8 }}>
            {imageRecord.waypointId || "Unbekannt"}
          </Text>
          <Text>
            <FontAwesomeIcon icon={faCamera} style={{ marginRight: 4 }} />
            {imageRecord.cameraId}
          </Text>
        </InfoRow>

        <MetadataSection>
          <SectionTitle>
            <FontAwesomeIcon icon={faCompass} style={{ marginRight: 4 }} />
            Heading
          </SectionTitle>
          {imageRecord.fallbackHeading !== undefined && (
            <InfoRow>
              <Text type="secondary">
                Primary:{" "}
                {CesiumMath.toDegrees(imageRecord.fallbackHeading).toFixed(2)}°
                {imageRecord.sector && ` (${imageRecord.sector})`}
              </Text>
            </InfoRow>
          )}
        </MetadataSection>

        <MetadataSection>
          <SectionTitle>Position</SectionTitle>
          <InfoRow>
            <Text style={{ fontSize: "0.9em" }}>
              X: {imageRecord.perspectiveCenter.x.toFixed(2)}, Y:{" "}
              {imageRecord.perspectiveCenter.y.toFixed(2)}, Z:{" "}
              {imageRecord.perspectiveCenter.z.toFixed(2)}
            </Text>
          </InfoRow>
          <InfoRow>
            <Text style={{ fontSize: "0.9em" }}>
              Lon: {imageRecord.centerWGS84[0].toFixed(6)}°, Lat:{" "}
              {imageRecord.centerWGS84[1].toFixed(6)}°, Alt:{" "}
              {imageRecord.centerWGS84[2].toFixed(1)}m
            </Text>
          </InfoRow>
        </MetadataSection>

        <MetadataSection>
          <SectionTitle>Orientation (OPK)</SectionTitle>
          <Space size="small">
            <Text type="secondary" style={{ fontSize: "0.9em" }}>
              ω:{" "}
              {CesiumMath.toDegrees(imageRecord.orientation.omega).toFixed(2)}°
            </Text>
            <Text type="secondary" style={{ fontSize: "0.9em" }}>
              φ: {CesiumMath.toDegrees(imageRecord.orientation.phi).toFixed(2)}°
            </Text>
            <Text type="secondary" style={{ fontSize: "0.9em" }}>
              κ:{" "}
              {CesiumMath.toDegrees(imageRecord.orientation.kappa).toFixed(2)}°
            </Text>
          </Space>
        </MetadataSection>
      </Space>
    </CompactCard>
  );
};
