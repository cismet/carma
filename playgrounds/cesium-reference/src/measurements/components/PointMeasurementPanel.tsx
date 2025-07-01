import React, { useState, useEffect } from "react";
import { Button, Card, Collapse, Typography } from "antd";
import PointQueryInfo from "./PointQueryInfo";
import {
  isPointMeasurementEntry,
  PointMeasurementEntry,
  type MeasurementEntry,
  type PointInfoData,
} from "../types/MeasurementTypes";
import { useCesiumMeasurements } from "../CesiumMeasurementsContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";

interface PointMeasurementPanelProps {
  data?: PointInfoData;
}

const transformPointData = (data: PointMeasurementEntry) => {
  const nivp = data.metadata?.nivp;
  return {
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
  };
};

const PointMeasurementPanel: React.FC<PointMeasurementPanelProps> = () => {
  const { measurements, clearPointMeasurements } = useCesiumMeasurements();
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
      extra={
        pointMeasurements.length > 0 && (
          <Button
            icon={<FontAwesomeIcon icon={faTrash} />}
            size="small"
            onClick={clearPointMeasurements}
            aria-label="Alle Messungen löschen"
          />
        )
      }
    >
      {pointMeasurements.length === 0 ? (
        <Typography.Text>
          Keine Punktmessungen vorhanden.
          <br />
          Zum Messen auf das Stadtmodell klicken
        </Typography.Text>
      ) : pointMeasurements.length === 1 ? (
        <PointQueryInfo data={transformPointData(pointMeasurements[0])} />
      ) : (
        <Collapse
          accordion={pointMeasurements.length > 1}
          activeKey={activeKey}
          onChange={(key) => setActiveKey(Array.isArray(key) ? key : [key])}
          items={pointMeasurements.map((data, idx) => {
            return {
              key: data.id,
              label: `Punkt ${pointMeasurements.length - idx} ${
                data.name || ""
              } (${data.id})`,
              children: <PointQueryInfo data={transformPointData(data)} />,
            };
          })}
        />
      )}
    </Card>
  );
};

export default PointMeasurementPanel;
