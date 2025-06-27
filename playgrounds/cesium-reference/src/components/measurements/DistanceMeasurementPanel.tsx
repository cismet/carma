import React from "react";
import { Card, Typography } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import { useCesiumMeasurements } from "../../contexts/CesiumMeasurementsContext";
import MeasurementTable from "./MeasurementTable";

const { Text } = Typography;

interface DistanceMeasurementPanelProps {
  coordinateDisplayMode: "cartesian" | "cartographic" | "utm32";
}

const DistanceMeasurementPanel: React.FC<DistanceMeasurementPanelProps> = ({
  coordinateDisplayMode,
}) => {
  const {
    activeMeasurementPoints,
    enableMeasurement,
    viewer,
    clearMeasurements,
  } = useCesiumMeasurements();

  const isMeasurementPanelActive =
    enableMeasurement && activeMeasurementPoints.length > 0;

  const handleClose = () => {
    if (isMeasurementPanelActive) {
      clearMeasurements();
    }
  };

  if (!enableMeasurement) return null;

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
      {/* Display active measurement points if measurement is active */}
      {isMeasurementPanelActive && (
        <MeasurementTable
          activeMeasurementPoints={activeMeasurementPoints}
          viewer={viewer}
          coordinateDisplayMode={coordinateDisplayMode}
        />
      )}

      {/* Display placeholder text when measurement mode is active but no measurements */}
      {enableMeasurement && activeMeasurementPoints.length === 0 && (
        <Text type="secondary" style={{ fontStyle: "italic" }}>
          Klicken Sie, um Entfernungen zu messen
        </Text>
      )}
    </Card>
  );
};

export default DistanceMeasurementPanel;
