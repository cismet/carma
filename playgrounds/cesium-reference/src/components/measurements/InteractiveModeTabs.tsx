import React from "react";
import {
  Tabs,
  Row,
  Col,
  InputNumber,
  Card,
  Radio,
  Slider,
} from "antd";
import type { InputNumberProps } from "antd";
import { AimOutlined, LineChartOutlined } from "@ant-design/icons";
import { MeasurementMode } from "../../hooks/useMeasurement";
import { useCesiumMeasurements } from "../../contexts/CesiumMeasurementsContext";

const PointQuerySettingsComponent: React.FC<{
  minSearchRadius?: number;
  maxSearchRadius?: number;
  stepSearchRadius?: number;
  searchRadius?: number;
  onChange?: (value: number) => void;
}> = ({
  minSearchRadius = 1,
  maxSearchRadius = 100,
  stepSearchRadius = 1,
  searchRadius = 5,
  onChange,
}) => {
  const onValueChange: InputNumberProps["onChange"] = (newDisplayValue) => {
    onChange && onChange(newDisplayValue as number);
  };

  return (
    <Row gutter={24}>
      <Col span={14}>
        <InputNumber
          min={minSearchRadius}
          max={maxSearchRadius}
          step={stepSearchRadius}
          value={searchRadius}
          onChange={onValueChange}
          addonAfter={"m"}
          addonBefore={"Suchradius"}
          formatter={(value) => `${value}`}
          parser={(value) => value!.replace(/[^\d.]/g, "")}
        />
      </Col>
      <Col span={10}>
        <Slider
          min={minSearchRadius}
          max={maxSearchRadius}
          step={stepSearchRadius}
          value={searchRadius}
          onChange={onValueChange}
        />
      </Col>
    </Row>
  );
};

type CoordinateDisplayMode = "cartesian" | "cartographic" | "utm32";

interface InteractiveModeTabsProps {
  coordinateDisplayMode: CoordinateDisplayMode;
  onCoordinateDisplayModeChange: (mode: CoordinateDisplayMode) => void;
}

export const InteractiveModeTabs: React.FC<InteractiveModeTabsProps> = ({
  coordinateDisplayMode,
  onCoordinateDisplayModeChange,
}) => {
  const { measurementMode, setMeasurementMode, searchRadius, setSearchRadius, measurementCount } =
    useCesiumMeasurements();

  const handleTabChange = (activeKey: MeasurementMode) => {
    setMeasurementMode(activeKey);
  };

  const items = [
    {
      key: MeasurementMode.PointQuery,
      label: (
        <span>
          <AimOutlined />
          3D Punktabfrage
        </span>
      ),
      children: (
        <PointQuerySettingsComponent
          searchRadius={searchRadius}
          onChange={(value) => setSearchRadius(value)}
        />
      ),
    },
    {
      key: MeasurementMode.Distance,
      label: (
        <span>
          <LineChartOutlined />
          Distanzmessung ({measurementCount})
        </span>
      ),
      children: (
        <Radio.Group
          value={coordinateDisplayMode}
          onChange={(e) => onCoordinateDisplayModeChange(e.target.value)}
          size="small"
        >
          <Radio.Button value="cartesian">XYZ</Radio.Button>
          <Radio.Button value="cartographic">Lat/Lon</Radio.Button>
          <Radio.Button value="utm32">UTM32</Radio.Button>
        </Radio.Group>
      ),
    },
  ];

  return (
    <Card size="small">
      <Tabs
        activeKey={measurementMode}
        items={items}
        onChange={handleTabChange}
        size="small"
      />
    </Card>
  );
};

export default InteractiveModeTabs;
