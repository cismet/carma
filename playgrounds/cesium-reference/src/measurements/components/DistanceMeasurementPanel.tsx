import React from "react";
import { Card, Typography } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import { useCesiumMeasurements } from "../CesiumMeasurementsContext";
import MeasurementTable from "./MeasurementTable";
import { useCesiumViewer } from "../../contexts/CesiumViewerContext";
import { Cartesian3 } from "cesium";
import { MeasurementMode } from "../types/MeasurementTypes";

const { Text } = Typography;

interface DistanceMeasurementPanelProps {
  coordinateDisplayMode: "cartesian" | "cartographic" | "utm32";
}

const DistanceMeasurementPanel: React.FC<DistanceMeasurementPanelProps> = ({
  coordinateDisplayMode,
}) => {
  const { setMeasurements, measurements, measurementMode } =
    useCesiumMeasurements();
  const { viewer } = useCesiumViewer();

  const enabled = measurementMode === MeasurementMode.Traverse;

  const isMeasurementPanelActive =
    measurementMode === MeasurementMode.Traverse && measurements.length > 0;

  const handleClose = () => {
    if (isMeasurementPanelActive) {
      setMeasurements([]);
    }
  };

  const activeMeasurement = measurements.filter(
    (m) => m.type === MeasurementMode.Traverse
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
      {activeMeasurement && (
        <MeasurementTable
          activeMeasurementPoints={
            activeMeasurement.geometryECEF as Cartesian3[]
          }
          viewer={viewer}
          coordinateDisplayMode={coordinateDisplayMode}
        />
      )}

      {enabled &&
        activeMeasurement &&
        (activeMeasurement.geometryECEF as Cartesian3[]).length === 0 && (
          <Text type="secondary" style={{ fontStyle: "italic" }}>
            Klicken Sie, um Entfernungen zu messen
          </Text>
        )}
    </Card>
  );
};

export default DistanceMeasurementPanel;
