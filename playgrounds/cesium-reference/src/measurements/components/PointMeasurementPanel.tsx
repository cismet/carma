import React from "react";
import { Card } from "antd";
import PointQueryInfo from "./PointQueryInfo";
import type { PointInfoData } from "../types/MeasurementTypes";
import { useCesiumMeasurements } from "../CesiumMeasurementsContext";

interface PointMeasurementPanelProps {
  data?: PointInfoData;
}

const PointMeasurementPanel: React.FC<PointMeasurementPanelProps> = () => {
  const { pointData } = useCesiumMeasurements();
  const data = pointData;
  console.log("[PointMeasurementPanel] Point data:", data);
  return (
    <Card size="small" title={data ? "Punktmessung" : undefined}>
      {data && (
        <PointQueryInfo
          data={{
            elevation: data.elevation,
            longitude: data.longitude,
            latitude: data.latitude,
            additionalInfo: data.additionalInfo
              ? Object.fromEntries(
                  Object.entries(data.additionalInfo).map(([key, value]) => [
                    key,
                    value.toString(),
                  ])
                )
              : undefined,
            heightDifference: data.heightDifference,
            nivpData: data.nivpData
              ? {
                  ...data.nivpData,
                  festlegungsart: data.nivpData.festlegungsart.toString(),
                  lagegenauigkeit: data.nivpData.lagegenauigkeit.toString(),
                  punktnummer_nrw: data.nivpData.punktnummer_nrw || undefined,
                  bemerkung: data.nivpData.bemerkung || undefined,
                }
              : undefined,
          }}
        />
      )}
    </Card>
  );
};

export default PointMeasurementPanel;
