import React from "react";
import { Card } from "antd";
import { styled } from "styled-components";
import { ObliqueImageRecord } from "../types";

interface ObliqueImageInfoProps {
  imageRecord: ObliqueImageRecord | null;
}

const InfoCard = styled(Card)`
  position: absolute;
  top: 10px;
  right: 10px;
  width: 450px;
  max-width: calc(100vw - 20px);
  padding: 0;
  margin: 0;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  overflow: hidden;
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

export const ObliqueImageInfo: React.FC<ObliqueImageInfoProps> = ({
  imageRecord,
}) => {
  if (!imageRecord) return null;

  return (
    <InfoCard bordered={false}>
      <JsonDisplay>{JSON.stringify(imageRecord, null, 2)}</JsonDisplay>
    </InfoCard>
  );
};

export default ObliqueImageInfo;
