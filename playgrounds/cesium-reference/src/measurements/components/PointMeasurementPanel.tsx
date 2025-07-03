import React, { useState, useEffect } from "react";
import { Button, Card, Collapse, Typography } from "antd";
import PointQueryInfo from "./PointQueryInfo";
import {
  isPointMeasurementEntry,
  PointMeasurementEntry,
  type MeasurementEntry,
} from "../types/MeasurementTypes";
import { useCesiumMeasurements } from "../CesiumMeasurementsContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";

interface PointMeasurementPanelProps {
  data?: PointMeasurementEntry;
}

const PointMeasurementPanel: React.FC<PointMeasurementPanelProps> = () => {
  const { measurements, clearPointMeasurements, clearMeasurementsByIds } =
    useCesiumMeasurements();
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
        <PointQueryInfo data={pointMeasurements[0]} />
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
              } (${data.id.slice(-6, -2)})`,
              children: <PointQueryInfo data={data} />,
              extra: (
                <Button
                  type="text"
                  size="small"
                  onClick={() => clearMeasurementsByIds([data.id])}
                  aria-label={`Messung ${data.id} löschen`}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </Button>
              ),
            };
          })}
        />
      )}
    </Card>
  );
};

export default PointMeasurementPanel;
