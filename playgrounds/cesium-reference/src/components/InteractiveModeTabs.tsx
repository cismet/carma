import React from "react";
import { Tabs, Button, Space, InputNumber, Typography, Card } from "antd";
import {
  DeleteOutlined,
  AimOutlined,
  LineChartOutlined,
} from "@ant-design/icons";

const { Text } = Typography;

interface InteractiveModeTabsProps {
  enableMeasurement: boolean;
  setEnableMeasurement: (enabled: boolean) => void;
  setEnableTerrainClick: (enabled: boolean) => void;
  searchRadius: number;
  onSearchRadiusChange: (radius: number) => void;
  clearMeasurements: () => void;
  hasAnyMeasurementEntities: boolean;
  measurementCount: number;
}

const InteractiveModeTabs: React.FC<InteractiveModeTabsProps> = ({
  enableMeasurement,
  setEnableMeasurement,
  setEnableTerrainClick,
  searchRadius,
  onSearchRadiusChange,
  clearMeasurements,
  hasAnyMeasurementEntities,
  measurementCount,
}) => {
  const handleTabChange = (activeKey: string) => {
    if (activeKey === "terrain") {
      setEnableMeasurement(false);
      setEnableTerrainClick(true);
    } else if (activeKey === "measurement") {
      setEnableTerrainClick(false);
      setEnableMeasurement(true);
    }
  };

  const items = [
    {
      key: "terrain",
      label: (
        <span>
          <AimOutlined />
          3D Punktabfrage
        </span>
      ),
      children: (
        <Space direction="vertical" size="small">
          <div>
            <Text>Suchradius (m):</Text>
            <InputNumber
              min={1}
              max={100}
              value={searchRadius}
              onChange={(value) => onSearchRadiusChange(value || 10)}
              style={{ marginLeft: 8, width: 80 }}
            />
          </div>
          <Text type="secondary">
            Klicken Sie auf das Gelände, um Höhenpunkte abzufragen
          </Text>
        </Space>
      ),
    },
    {
      key: "measurement",
      label: (
        <span>
          <LineChartOutlined />
          Distanzmessung ({measurementCount})
        </span>
      ),
      children: (
        <Space direction="vertical" size="small">
          <Button
            type="primary"
            danger
            icon={<DeleteOutlined />}
            onClick={clearMeasurements}
            disabled={!hasAnyMeasurementEntities}
            size="small"
          >
            Alle löschen
          </Button>
          <Text type="secondary">Klicken Sie, um Entfernungen zu messen</Text>
        </Space>
      ),
    },
  ];

  return (
    <Card size="small">
      <Tabs
        activeKey={enableMeasurement ? "measurement" : "terrain"}
        items={items}
        onChange={handleTabChange}
        size="small"
      />
    </Card>
  );
};

export default InteractiveModeTabs;
