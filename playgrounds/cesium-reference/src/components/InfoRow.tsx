import React, { FC, ReactNode } from "react";
import { Typography, Space } from "antd";
const { Text } = Typography;

export const InfoRow: FC<{
  label: string;
  value: ReactNode;
  type?: "danger" | "success";
}> = ({ label, value, type }) => (
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
    <Text type={type}>{value}</Text>
  </Space>
);

export default InfoRow;
