import React from "react";
import { Card, Typography } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import {
  MeasurementCollection,
  MeasurementMode,
  useCesiumMeasurements,
} from "../CesiumMeasurementsContext";
import MeasurementTable from "./MeasurementTable";
import { useCesiumViewer } from "../../contexts/CesiumViewerContext";
import { Cartesian3 } from "cesium";

const { Text } = Typography;

interface DistanceMeasurementPanelProps {
  coordinateDisplayMode: "cartesian" | "cartographic" | "utm32";
}

const DistanceMeasurementPanel: React.FC<DistanceMeasurementPanelProps> = ({
  coordinateDisplayMode,
}) => {
  const { setMeasurements, measurements, measurementMode } =
    useCesiumMeasurements();
  const { viewerRef } = useCesiumViewer();

  const enabled = measurementMode === MeasurementMode.Distance;

  const isMeasurementPanelActive =
    measurementMode === MeasurementMode.Distance && measurements.length > 0;

  const handleClose = () => {
    if (isMeasurementPanelActive) {
      setMeasurements([]);
    }
  };

  const activeMeasurement = measurements.filter(
    (m) => m.type === MeasurementMode.Distance
  )[0];

  if (!enabled) return null;

  return (
    <Card
      size="small"
      title={isMeasurementPanelActive ? "Aktive Messung" : undefined}
      extra={
        isMeasurementPanelActive ? (
          <CloseOutlined
            onClick={handleClose}
            style={{ cursor: "pointer", fontSize: "14px" }}
          />
        ) : undefined
      }
    >
      <MeasurementTable
        activeMeasurementPoints={activeMeasurement.geometryECEF as Cartesian3[]}
        viewer={viewerRef?.current}
        coordinateDisplayMode={coordinateDisplayMode}
      />

      {/* Display placeholder text when measurement mode is active but no measurements */}
      {enabled &&
        (activeMeasurement.geometryECEF as Cartesian3[]).length === 0 && (
          <Text type="secondary" style={{ fontStyle: "italic" }}>
            Klicken Sie, um Entfernungen zu messen
          </Text>
        )}
    </Card>
  );
};

export default DistanceMeasurementPanel;
