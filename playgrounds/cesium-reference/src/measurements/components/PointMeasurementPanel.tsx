import React from "react";
import { Card } from "antd";
import PointQueryInfo from "./PointQueryInfo";
import {
  isPointMeasurementEntry,
  PointMeasurementEntry,
  type MeasurementEntry,
  type PointInfoData,
} from "../types/MeasurementTypes";
import { useCesiumMeasurements } from "../CesiumMeasurementsContext";

interface PointMeasurementPanelProps {
  data?: PointInfoData;
}

const PointMeasurementPanel: React.FC<PointMeasurementPanelProps> = () => {
  const { measurements } = useCesiumMeasurements();
  const lastPoint = measurements
    .filter((m: MeasurementEntry) => isPointMeasurementEntry(m))
    .slice(-1)[0];
  const data: PointMeasurementEntry | undefined = lastPoint;
  console.log("[PointMeasurementPanel] Point data:", data, measurements);
  const nivp = data?.metadata?.nivp;

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
            heightDifference: data.metadata?.heightDifference,
            nivpData: nivp
              ? {
                  ...nivp,
                  festlegungsart: nivp.festlegungsart.toString(),
                  lagegenauigkeit: nivp.lagegenauigkeit.toString(),
                  punktnummer_nrw: nivp.punktnummer_nrw || undefined,
                  bemerkung: nivp.bemerkung || undefined,
                }
              : undefined,
          }}
        />
      )}
    </Card>
  );
};

export default PointMeasurementPanel;
