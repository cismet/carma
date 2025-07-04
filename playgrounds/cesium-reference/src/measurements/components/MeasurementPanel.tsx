import React, { useState, FC, useCallback, useMemo, useEffect } from "react";
import { Button, Card, Collapse, Flex, List, theme, Typography } from "antd";
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
import {
  faCircleXmark,
  faEye,
  faEyeSlash,
  faFont,
  faTextSlash,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { InteractiveModeTabs } from "./InteractiveModeTabs";

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

const toggleTypeInSet = (type: MeasurementMode, prev: Set<MeasurementMode>) => {
  const newSet = new Set(prev);
  if (prev.has(type)) {
    newSet.delete(type);
  } else {
    newSet.add(type);
  }
  return newSet;
};

function MeasurementSection({
  type,
  active,
  title,
  placeholder,
  itemRenderer,
  setActive,
}: MeasurementSectionProps) {
  const {
    clearMeasurementsByIds,
    clearMeasurementsByType,
    measurements,
    hideMeasurementsOfType,
    setHideMeasurementsOfType,
    hideLabelsOfType,
    setHideLabelsOfType,
  } = useCesiumMeasurements();
  const { token } = theme.useToken();

  const items = useMemo(
    () => measurements.filter((m) => m.type === type),
    [measurements, type]
  );
  const clearAll = useCallback(() => {
    clearMeasurementsByType(type);
    //setActive(MeasurementMode.NONE);
  }, [clearMeasurementsByType, type]);

  const toggleVisibility = useCallback(() => {
    setHideMeasurementsOfType((prev: Set<MeasurementMode>) => {
      console.debug(`[MeasurementSection] Toggling visibility for ${type}`);
      return toggleTypeInSet(type, prev);
    });
  }, [type, setHideMeasurementsOfType]);

  const toggleLabelVisibility = useCallback(() => {
    setHideLabelsOfType((prev: Set<MeasurementMode>) => {
      console.debug(
        `[MeasurementSection] Toggling label visibility for ${type}`
      );
      return toggleTypeInSet(type, prev);
    });
  }, [type, setHideLabelsOfType]);

  // if not active and no items, return null
  // if active and no items, return placeholder
  if (items.length === 0) {
    return active ? (
      <Card size="small">
        <Typography.Text type="secondary">{placeholder}</Typography.Text>
      </Card>
    ) : null;
  }

  const isHidden = hideMeasurementsOfType.has(type);
  const isLabelHidden = hideLabelsOfType.has(type);

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
            <Flex gap={2}>
              <Button
                icon={<FontAwesomeIcon icon={isHidden ? faEye : faEyeSlash} />}
                size="small"
                onClick={toggleVisibility}
                aria-label={`Alle ${title} ${
                  isHidden ? "anzeigen" : "verstecken"
                }`}
              />
              <Button
                icon={
                  <FontAwesomeIcon
                    icon={isLabelHidden ? faFont : faTextSlash}
                  />
                }
                size="small"
                onClick={toggleLabelVisibility}
                aria-label={`Alle ${title} Beschriftungen ${
                  isLabelHidden ? "anzeigen" : "verstecken"
                }`}
              />
              <Button
                icon={<FontAwesomeIcon icon={faTrash} />}
                size="small"
                onClick={clearAll}
                aria-label={`Alle ${title} löschen`}
              />
            </Flex>
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
    <Flex vertical gap={2} style={{ maxWidth: "44rem" }}>
      <InteractiveModeTabs />
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
    </Flex>
  );
};

export default MeasurementPanel;
