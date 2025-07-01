import React, { useState, useEffect } from "react";
import { Card, Collapse } from "antd";
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
  const pointMeasurements = measurements
    .filter((m: MeasurementEntry) => isPointMeasurementEntry(m))
    .reverse();
  const [activeKey, setActiveKey] = useState<string[]>(
    pointMeasurements.length > 0 ? [pointMeasurements[0].id] : []
  );

  useEffect(() => {
    if (
      pointMeasurements.length > 0 &&
      (activeKey.length === 0 || activeKey[0] !== pointMeasurements[0].id)
    ) {
      setActiveKey([pointMeasurements[0].id]);
    }
  }, [pointMeasurements.length, pointMeasurements[0]?.id]);

  return (
    <Card
      size="small"
      title={pointMeasurements.length > 0 ? "Punktmessungen" : undefined}
    >
      <Collapse
        accordion
        activeKey={activeKey}
        onChange={(key) => setActiveKey(Array.isArray(key) ? key : [key])}
        items={pointMeasurements.map((data, idx) => {
          const nivp = data.metadata?.nivp;
          return {
            key: data.id,
            label: `Punkt ${pointMeasurements.length - idx}`,
            children: (
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
            ),
          };
        })}
      />
    </Card>
  );
};

export default PointMeasurementPanel;
