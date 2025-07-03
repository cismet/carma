import React, { useState, useEffect, FC, useMemo } from "react";
import { Button, Card, Collapse, List, theme, Typography } from "antd";
import { PointQueryInfo } from "./PointQueryInfo";
import {
  isPointMeasurementEntry,
  PointMeasurementEntry,
  type MeasurementEntry,
} from "../types/MeasurementTypes";
import { useCesiumMeasurements } from "../CesiumMeasurementsContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleXmark, faTrash } from "@fortawesome/free-solid-svg-icons";
import { MeasurementMode } from "../types/MeasurementTypes";

const renderPointItem = (
  data: PointMeasurementEntry,
  idx: number,
  clearMeasurementsByIds: (ids: string[]) => void
) => (
  <List.Item
    key={data.id}
    style={{ paddingRight: "0.5rem" }}
    title={`${data.name || ""} (${data.id.slice(-6, -2)})`}
    extra={
      <Button
        icon={<FontAwesomeIcon icon={faCircleXmark} />}
        type="text"
        size="small"
        onClick={() => clearMeasurementsByIds([data.id])}
        aria-label={`Messung ${data.id} löschen`}
      />
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
  const {
    measurements,
    clearPointMeasurements,
    clearMeasurementsByIds,
    measurementMode,
  } = useCesiumMeasurements();

  const { token } = theme.useToken();

  const pointMeasurements = useMemo(
    () =>
      measurements
        .filter((m: MeasurementEntry) => isPointMeasurementEntry(m))
        .reverse(),
    [measurements]
  );

  const [activePanel, setActivePanel] = useState<string[]>(
    measurementMode === MeasurementMode.PointQuery ? ["points"] : []
  );

  useEffect(() => {
    setActivePanel(
      measurementMode === MeasurementMode.PointQuery ? ["points"] : []
    );
  }, [measurementMode]);

  const renderItem = (data: MeasurementEntry, idx: number) => {
    if (isPointMeasurementEntry(data)) {
      return renderPointItem(data, idx, clearMeasurementsByIds);
    }
    return null;
  };

  if (
    measurementMode === MeasurementMode.PointQuery &&
    pointMeasurements.length === 0
  ) {
    return (
      <Card size="small">
        <Typography.Text type="secondary">
          Keine Punktmessungen vorhanden.
          <br />
          Zum Messen auf das Stadtmodell klicken
        </Typography.Text>
      </Card>
    );
  }

  return (
    <Collapse
      style={{ backgroundColor: token.colorBgContainer }}
      activeKey={activePanel}
      collapsible="header"
      onChange={(key) => setActivePanel(Array.isArray(key) ? key : [key])}
      items={[
        {
          key: "points",
          label: `Punktmessungen (${pointMeasurements.length})`,
          extra: (
            <Button
              icon={<FontAwesomeIcon icon={faTrash} />}
              size="small"
              onClick={clearPointMeasurements}
              aria-label="Alle Punktmessungen löschen"
            />
          ),
          children: (
            <List
              dataSource={pointMeasurements}
              renderItem={renderItem}
              size="small"
            />
          ),
        },
      ]}
      className="measurement-panel-collapse"
    />
  );
};

export default MeasurementPanel;
