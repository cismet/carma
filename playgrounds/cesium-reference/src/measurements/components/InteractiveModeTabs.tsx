import React, { FC } from "react";
import {
  Tabs,
  Row,
  Col,
  InputNumber,
  Card,
  Slider,
  Button,
  Space,
  Switch,
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
import { CoordinateDisplayMode, useCRS } from "../CRSContext";

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

export const InteractiveModeTabs: FC = () => {
  const {
    measurementMode,
    setMeasurementMode,
    pointRadius: pointRadius,
    setPointRadius: setPointRadius,
    measurements,
    temporaryMode,
    setTemporaryMode,
    clearAllMeasurements,
  } = useCesiumMeasurements();

  const {
    coordinateDisplayMode,
    setCoordinateDisplayMode,
    cartographicCRSLabel,
    geographicCRSLabel,
  } = useCRS();

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
      key: MeasurementMode.Traverse,
      label: "Polygonzug",
      icon: <FontAwesomeIcon icon={faRulerCombined} />,
    },
  ];

  return (
    <Card
      size="small"
      title="Messwerkzeuge"
      extra={
        <Space>
          <Switch
            checked={coordinateDisplayMode === CoordinateDisplayMode.Geographic}
            onChange={(e) =>
              setCoordinateDisplayMode(
                e.valueOf()
                  ? CoordinateDisplayMode.Geographic
                  : CoordinateDisplayMode.Cartographic
              )
            }
            checkedChildren={geographicCRSLabel}
            unCheckedChildren={cartographicCRSLabel}
            size="small"
          />
          <Switch
            checked={temporaryMode}
            onChange={(e) => setTemporaryMode(e.valueOf())}
            checkedChildren="temporär"
            unCheckedChildren="permanent"
            size="small"
          />
          <Button
            icon={<FontAwesomeIcon icon={faTrash} />}
            size="small"
            disabled={measurements.length === 0}
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
