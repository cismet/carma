import React from "react";
import { Card } from "antd";
import PointQueryInfo from "./PointQueryInfo";
import type { PointInfoData } from "../types/MeasurementTypes";
import {
  MeasurementMode,
  useCesiumMeasurements,
} from "../CesiumMeasurementsContext";

interface PointMeasurementPanelProps {
  data?: PointInfoData;
}

const PointMeasurementPanel: React.FC<PointMeasurementPanelProps> = () => {
  const { measurements } = useCesiumMeasurements();
  const lastPoint = measurements
    .filter((m) => m.type === MeasurementMode.PointQuery)
    .slice(-1)[0];
  const data = lastPoint;
  console.log("[PointMeasurementPanel] Point data:", data, measurements);
  return (
    <Card size="small" title={data ? "Punktmessung" : undefined}>
      {data && (
        <PointQueryInfo
          data={{
            elevation: data.geometryWGS84.height,
            longitude: data.geometryWGS84.longitude,
            latitude: data.geometryWGS84.latitude,
            additionalInfo: data.metadata
              ? Object.fromEntries(
                  Object.entries(data.metadata).map(([key, value]) => [
                    key,
                    value.toString(),
                  ])
                )
              : undefined,
            heightDifference: data.metadata.heightDifference,
            nivpData: data.metadata
              ? {
                  ...data.metadata.nivpData,
                  festlegungsart:
                    data.metadata.nivpData.festlegungsart.toString(),
                  lagegenauigkeit:
                    data.metadata.nivpData.lagegenauigkeit.toString(),
                  punktnummer_nrw:
                    data.metadata.nivpData.punktnummer_nrw || undefined,
                  bemerkung: data.metadata.nivpData.bemerkung || undefined,
                }
              : undefined,
          }}
        />
      )}
    </Card>
  );
};

export default PointMeasurementPanel;
