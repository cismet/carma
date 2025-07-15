import { FC, ReactNode } from "react";
import { Typography, Flex } from "antd";
const { Text } = Typography;

export const InfoRow: FC<{
  label: string;
  value?: ReactNode;
  values?: ReactNode[];
  type?: "danger" | "success";
}> = ({ label, value, values, type }) => (
  <Flex justify="space-between" gap={4}>
    <Text strong style={{ whiteSpace: "nowrap" }}>
      {label}
    </Text>
    {values ? (
      values.map((val, index) => (
        <Text key={index} type={type}>
          {val}
        </Text>
      ))
    ) : (
      <Text type={type}>{value}</Text>
    )}
  </Flex>
);

export default InfoRow;
