import React from "react";
import {
  Tabs,
  Row,
  Col,
  InputNumber,
  Card,
  Radio,
  Slider,
  Checkbox,
  Button,
  Space,
} from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowsToDot,
  faTrash,
  faRulerCombined,
} from "@fortawesome/free-solid-svg-icons";
import type { InputNumberProps } from "antd";
import { useCesiumMeasurements } from "../CesiumMeasurementsContext";
import { MeasurementMode } from "../types/MeasurementTypes";

const PointQuerySettingsComponent: React.FC<{
  minPointRadius?: number;
  maxPointRadius?: number;
  stepPointRadius?: number;
  pointRadius?: number;
  onChange?: (value: number) => void;
}> = ({
  minPointRadius = 1,
  maxPointRadius = 100,
  stepPointRadius = 1,
  pointRadius = 5,
  onChange,
}) => {
  const onValueChange: InputNumberProps["onChange"] = (newDisplayValue) => {
    onChange && onChange(newDisplayValue as number);
  };

  return (
    <Row gutter={24}>
      <Col span={14}>
        <InputNumber
          min={minPointRadius}
          max={maxPointRadius}
          step={stepPointRadius}
          value={pointRadius}
          onChange={onValueChange}
          addonAfter={"m"}
          addonBefore={"Suchradius"}
          formatter={(value) => `${value}`}
          parser={(value) => value!.replace(/[^\d.]/g, "")}
        />
      </Col>
      <Col span={10}>
        <Slider
          min={minPointRadius}
          max={maxPointRadius}
          step={stepPointRadius}
          value={pointRadius}
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
  const {
    measurementMode,
    setMeasurementMode,
    pointRadius: pointRadius,
    setPointRadius: setPointRadius,
    measurements,
    soloMode,
    setSoloMode,
    clearAllMeasurements,
  } = useCesiumMeasurements();

  const handleTabChange = (mode: MeasurementMode) => {
    setMeasurementMode(mode);
  };

  const items = [
    {
      key: MeasurementMode.PointQuery,
      label: "3D Punktabfrage",
      icon: <FontAwesomeIcon icon={faArrowsToDot} />,
      children: (
        <PointQuerySettingsComponent
          pointRadius={pointRadius}
          onChange={(value) => setPointRadius(value)}
        />
      ),
    },
    {
      key: MeasurementMode.Distance,
      disabled: true,
      label: "Distanzmessung",
      icon: <FontAwesomeIcon icon={faRulerCombined} />,
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
    <Card
      size="small"
      title="Messwerkzeuge"
      extra={
        <Space>
          <Checkbox
            checked={soloMode}
            onChange={(e) => setSoloMode(e.target.checked)}
          >
            Solo
          </Checkbox>
          <Button
            icon={<FontAwesomeIcon icon={faTrash} />}
            size="small"
            onClick={clearAllMeasurements}
            aria-label="Alle Messungen löschen"
          />
        </Space>
      }
    >
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
