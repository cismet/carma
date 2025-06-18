import React, { useState, type CSSProperties } from "react";
import { Collapse } from "antd";
import type { CollapseProps } from "antd";
import type {
  NearestObliqueImageRecord,
  ObliqueImageRecord,
} from "../../types";

interface ObliqueImageInfoProps {
  imageRecord: ObliqueImageRecord | NearestObliqueImageRecord | null;
}

// Reusable styles
const infoCardStyle: CSSProperties = {
  width: "100%",
  padding: 0,
  margin: 0,
  borderRadius: "4px",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
  overflow: "hidden",
};

const jsonDisplayStyle: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "12px",
  backgroundColor: "#f5f5f5",
  padding: "8px",
  borderRadius: "4px",
  overflow: "auto",
  maxHeight: "60vh",
  whiteSpace: "pre-wrap",
  marginTop: "4px",
  marginBottom: 0,
};

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
        <div
          style={{
            ...infoCardStyle,
            border: "none",
          }}
        >
          <div style={{ padding: "6px" }}>
            <pre style={jsonDisplayStyle}>
              {JSON.stringify(imageRecord, null, 2)}
            </pre>
          </div>
        </div>
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
