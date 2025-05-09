import React, { useState } from "react";
import { Card, Collapse } from "antd";
import type { CollapseProps } from "antd";
import { styled } from "styled-components";
import type {
  NearestObliqueImageRecord,
  ObliqueImageRecord,
} from "../../types";

interface ObliqueImageInfoProps {
  imageRecord: ObliqueImageRecord | NearestObliqueImageRecord | null;
}

const InfoCard = styled(Card)`
  width: 100%;
  padding: 0;
  margin: 0;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  overflow: hidden;

  .ant-card-body {
    padding: 6px;
  }
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
  margin-top: 4px;
  margin-bottom: 0;
`;

export const ObliqueImageInfo: React.FC<ObliqueImageInfoProps> = ({
  imageRecord,
}) => {
  const [activeKey, setActiveKey] = useState<string[]>([]);

  if (!imageRecord) return null;

  const onChange = (key: string | string[]) => {
    setActiveKey(Array.isArray(key) ? key : [key]);
  };

  const items: CollapseProps["items"] = [
    {
      key: "1",
      label: "Image Info",
      children: (
        <InfoCard bordered={false}>
          <JsonDisplay>{JSON.stringify(imageRecord, null, 2)}</JsonDisplay>
        </InfoCard>
      ),
    },
  ];

  return (
    <Collapse
      items={items}
      activeKey={activeKey}
      onChange={onChange}
      style={{
        background: "rgba(255, 255, 255, 0.9)",
        borderRadius: "4px",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
      }}
    />
  );
};

export default ObliqueImageInfo;
