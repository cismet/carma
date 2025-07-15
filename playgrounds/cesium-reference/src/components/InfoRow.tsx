import React, { FC, ReactNode } from "react";
import { Typography, Space } from "antd";
const { Text } = Typography;

export const InfoRow: FC<{
  label: string;
  value?: ReactNode;
  values?: ReactNode[];
  type?: "danger" | "success";
}> = ({ label, value, values, type }) => (
  <Space
    style={{
      width: "100%",
      justifyContent: "space-between",
      marginBottom: 8,
    }}
  >
    <Text strong style={{ whiteSpace: "nowrap" }}>
      {label}
    </Text>
    {values ? (
      <Space>
        {values.map((val, index) => (
          <Text key={index} type={type}>
            {val}
          </Text>
        ))}
      </Space>
    ) : (
      <Text type={type}>{value}</Text>
    )}
  </Space>
);

export default InfoRow;
