import React, { useState, useEffect, FC, useMemo } from "react";
import { Button, Card, Collapse, List, theme, Typography } from "antd";
import { PointQueryInfo } from "./PointQueryInfo";
import TraverseTable from "./TraverseTable";
import { useCesiumViewer } from "../../contexts/CesiumViewerContext";
import {
  isPointMeasurementEntry,
  isTraverseMeasurementEntry,
  type PointMeasurementEntry,
  type MeasurementEntry,
  MeasurementMode,
  type TraverseMeasurementEntry,
} from "../types/MeasurementTypes";
import { useCesiumMeasurements } from "../CesiumMeasurementsContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleXmark, faTrash } from "@fortawesome/free-solid-svg-icons";

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

const renderTraverseItem = (
  data: TraverseMeasurementEntry,
  idx: number,
  clearMeasurementsByIds: (ids: string[]) => void,
  viewer: any,
  coordinateDisplayMode: string
) => (
  <List.Item key={data.id} style={{ paddingRight: "0.5rem" }}>
    <List.Item.Meta
      title={
        <>
          {`${data.derived?.totalLength?.toFixed(2) || "0"}m`}
          <Button
            icon={<FontAwesomeIcon icon={faCircleXmark} />}
            type="text"
            size="small"
            onClick={() => clearMeasurementsByIds([data.id])}
            aria-label={`Polygonzug ${data.id} löschen`}
          />
        </>
      }
      description={
        <TraverseTable
          traverse={data}
          viewer={viewer}
          coordinateDisplayMode={coordinateDisplayMode as any}
        />
      }
    />
  </List.Item>
);

const MeasurementPanel: FC = () => {
  const {
    measurements,
    clearPointMeasurements,
    clearTraverseMeasurements,
    clearMeasurementsByIds,
    measurementMode,
  } = useCesiumMeasurements();
  const { viewer } = useCesiumViewer();
  const { token } = theme.useToken();

  const [coordinateDisplayMode] = useState("cartographic");

  const pointMeasurements = useMemo(
    () =>
      measurements
        .filter((m: MeasurementEntry) => isPointMeasurementEntry(m))
        .reverse(),
    [measurements]
  );
  const traverseMeasurements = useMemo(
    () =>
      measurements
        .filter((m: MeasurementEntry) => isTraverseMeasurementEntry(m))
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
    if (isTraverseMeasurementEntry(data)) {
      return renderTraverseItem(
        data as TraverseMeasurementEntry,
        idx,
        clearMeasurementsByIds,
        viewer,
        coordinateDisplayMode
      );
    }
    return null;
  };

  return (
    <>
      {measurementMode === MeasurementMode.PointQuery &&
      pointMeasurements.length === 0 ? (
        <Card size="small">
          <Typography.Text type="secondary">
            Keine Punktmessungen vorhanden.
            <br />
            Zum Messen auf das Stadtmodell klicken
          </Typography.Text>
        </Card>
      ) : (
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
      )}
      {measurementMode === MeasurementMode.Traverse &&
      traverseMeasurements.length === 0 ? (
        <Card size="small">
          <Typography.Text type="secondary">
            Keine Polygonzüge vorhanden.
            <br />
            Zum Messen auf das Stadtmodell klicken, zum abschließen der Messung
            rechts klicken
          </Typography.Text>
        </Card>
      ) : (
        <Collapse
          style={{ backgroundColor: token.colorBgContainer }}
          activeKey={activePanel}
          collapsible="header"
          onChange={(key) => setActivePanel(Array.isArray(key) ? key : [key])}
          items={[
            {
              key: "traversal",
              label: `Polygonzüge (${traverseMeasurements.length})`,
              extra: (
                <Button
                  icon={<FontAwesomeIcon icon={faTrash} />}
                  size="small"
                  onClick={clearTraverseMeasurements}
                  aria-label="Alle Polygonzüge löschen"
                />
              ),
              children: (
                <List
                  dataSource={traverseMeasurements}
                  renderItem={renderItem}
                  size="small"
                />
              ),
            },
          ]}
          className="measurement-panel-collapse"
        />
      )}
      <Collapse
        items={[
          {
            key: "json-debug",
            label: "Messungen (JSON)",
            children: (
              <Typography.Paragraph
                style={{
                  whiteSpace: "pre-wrap",
                  fontFamily: "monospace",
                  fontSize: 12,
                  margin: 0,
                }}
              >
                {JSON.stringify(measurements, null, 1)}
              </Typography.Paragraph>
            ),
          },
        ]}
      />
    </>
  );
};

export default MeasurementPanel;
