import React, { useState, useEffect, FC, useMemo } from "react";
import { Button, Card, Collapse, List, Typography } from "antd";
import { PointQueryInfo } from "./PointQueryInfo";
import {
  isPointMeasurementEntry,
  PointMeasurementEntry,
  type MeasurementEntry,
} from "../types/MeasurementTypes";
import { useCesiumMeasurements } from "../CesiumMeasurementsContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";

const renderPointItem = (
  data: PointMeasurementEntry,
  idx: number,
  clearMeasurementsByIds: (ids: string[]) => void
) => (
  <List.Item
    key={data.id}
    title={`${data.name || ""} (${data.id.slice(-6, -2)})`}
    extra={
      <Button
        type="text"
        size="small"
        onClick={() => clearMeasurementsByIds([data.id])}
        aria-label={`Messung ${data.id} löschen`}
      >
        <FontAwesomeIcon icon={faTrash} />
      </Button>
    }
  >
    <List.Item.Meta
      title={`${data.name || ""} (${data.id.slice(-6, -2)})`}
      description={<PointQueryInfo data={data} />}
    />
  </List.Item>
);

const renderGenericItem = (
  data: MeasurementEntry,
  idx: number,
  clearMeasurementsByIds: (ids: string[]) => void
) => ({
  key: data.id,
  label: `${data.name || ""} (${data.id.slice(-6, -2)})`,
  children: <PointQueryInfo data={data} />, // Adjust as needed for other measurement types
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
});

const MeasurementPanel: FC = () => {
  const { measurements, clearPointMeasurements, clearMeasurementsByIds } =
    useCesiumMeasurements();

  const pointMeasurements = measurements
    .filter((m: MeasurementEntry) => isPointMeasurementEntry(m))
    .reverse();

  const [activeKey, setActiveKey] = useState<string[]>(
    pointMeasurements.length > 0
      ? [pointMeasurements[0].id]
      : pointMeasurements.map((m) => m.id)
  );

  useEffect(() => {
    if (pointMeasurements.length === 0) {
      setActiveKey([]);
    } else {
      // Always expand all items, including new ones
      setActiveKey(pointMeasurements.map((m) => m.id));
    }
  }, [pointMeasurements]);

  const renderItem = (data: MeasurementEntry, idx: number) => {
    if (isPointMeasurementEntry(data)) {
      return renderPointItem(data, idx, clearMeasurementsByIds);
    }
    // Optionally handle other measurement types here
    return null;
  };

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
        <Typography.Text type="secondary">
          Keine Punktmessungen vorhanden.
          <br />
          Zum Messen auf das Stadtmodell klicken
        </Typography.Text>
      ) : (
        <List dataSource={pointMeasurements} renderItem={renderItem} />
      )}
    </Card>
  );
};

export default MeasurementPanel;
