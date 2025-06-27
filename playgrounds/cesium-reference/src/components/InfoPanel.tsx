import React from "react";
import { Card, Button, Typography, Divider } from "antd";
import { CloseOutlined } from "@ant-design/icons";

const { Title } = Typography;

interface InfoPanelProps {
  title?: string;
  onClose?: () => void;
  children: React.ReactNode;
}

const InfoPanel: React.FC<InfoPanelProps> = ({ title, onClose, children }) => {
  return (
    <Card
      size="small"
      title={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {title && <Title level={5} style={{ margin: 0 }}>
            {title}
          </Title>}
          {onClose && <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={onClose}
          />}
        </div>
      }
    >
      {children}

    </Card>
  );
};

export default InfoPanel;
