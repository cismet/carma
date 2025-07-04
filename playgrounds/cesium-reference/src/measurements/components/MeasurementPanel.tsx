import React, { useState, FC, useCallback, useMemo, useEffect } from "react";
import { Button, Card, Collapse, List, theme, Typography } from "antd";
import { PointQueryInfo } from "./PointQueryInfo";
import TraverseTable from "./TraverseTable";
import {
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
  clearMeasurementsByIds: (ids: string[]) => void
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
      description={<TraverseTable traverse={data} />}
    />
  </List.Item>
);

interface MeasurementSectionProps {
  type: MeasurementMode;
  active: boolean;
  title: string;
  placeholder: React.ReactNode;
  itemRenderer: (
    item: MeasurementEntry,
    idx: number,
    clear: (ids: string[]) => void
  ) => React.ReactNode;
  setActive: (key: MeasurementMode) => void;
}

function MeasurementSection({
  type,
  active,
  title,
  placeholder,
  itemRenderer,
  setActive,
}: MeasurementSectionProps) {
  const { clearMeasurementsByIds, clearMeasurementsByType, measurements } =
    useCesiumMeasurements();
  const { token } = theme.useToken();

  const items = useMemo(
    () => measurements.filter((m) => m.type === type),
    [measurements, type]
  );
  const clearAll = useCallback(() => {
    clearMeasurementsByType(type);
    //setActive(MeasurementMode.NONE);
  }, [clearMeasurementsByType, type]);

  // if not active and no items, return null
  // if active and no items, return placeholder
  if (items.length === 0) {
    return active ? (
      <Card size="small">
        <Typography.Text type="secondary">{placeholder}</Typography.Text>
      </Card>
    ) : null;
  }

  return (
    <Collapse
      style={{ backgroundColor: token.colorBgContainer, minWidth: "24rem" }}
      activeKey={type}
      collapsible="header"
      //onChange={setActivePanel}
      items={[
        {
          key: type,
          label: title,
          extra: (
            <Button
              icon={<FontAwesomeIcon icon={faTrash} />}
              size="small"
              onClick={clearAll}
              aria-label={`Alle ${title} löschen`}
            />
          ),
          children: (
            <List
              dataSource={items}
              renderItem={(item, idx) =>
                itemRenderer(item, idx, clearMeasurementsByIds)
              }
              size="small"
            />
          ),
        },
      ]}
      className="measurement-panel-collapse"
    />
  );
}

export const MeasurementPanel: FC = () => {
  const { measurements, measurementMode } = useCesiumMeasurements();
  const [activePanel, setActivePanel] =
    useState<MeasurementMode>(measurementMode);

  useEffect(() => {
    // change active panel when measurement mode changes
    if (measurementMode !== activePanel) {
      setActivePanel(measurementMode);
    }
  }, [measurementMode, activePanel]);

  return (
    <>
      <MeasurementSection
        type={MeasurementMode.PointQuery}
        active={activePanel === MeasurementMode.PointQuery}
        title={`Punktmessungen`}
        placeholder={
          <>
            Keine Punktmessungen vorhanden.
            <br />
            Zum Messen auf das Stadtmodell klicken
          </>
        }
        itemRenderer={renderPointItem}
        setActive={setActivePanel}
      />
      <MeasurementSection
        type={MeasurementMode.Traverse}
        title={`Polygonzüge`}
        active={activePanel === MeasurementMode.Traverse}
        placeholder={
          <>
            Keine Polygonzüge vorhanden.
            <br />
            Zum Messen auf das Stadtmodell klicken, zum abschließen der Messung
            rechts klicken
          </>
        }
        itemRenderer={renderTraverseItem}
        setActive={setActivePanel}
      />
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
