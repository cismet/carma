import React, {
  useState,
  FC,
  useCallback,
  useMemo,
  useRef,
  Dispatch,
  SetStateAction,
} from "react";
import { Cartesian3 } from "cesium";
import { Button, Collapse, Flex, List, theme, Typography } from "antd";
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
  faArrowsToDot,
  faCircleXmark,
  faEye,
  faEyeSlash,
  faFont,
  faTextSlash,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { InteractiveModeTabs } from "./InteractiveModeTabs";
import "./MeasurementPanel.css";

const renderPointItem = (
  data: PointMeasurementEntry,
  idx: number,
  clearMeasurementsByIds: (ids: string[]) => void,
  setReferencePoint: Dispatch<SetStateAction<Cartesian3 | null>>
) => (
  <List.Item
    key={data.id}
    style={{ paddingRight: "0.5rem" }}
    title={`${data.name || ""} (${data.id.slice(-6, -2)})`}
  >
    <List.Item.Meta
      title={
        <span style={{ padding: "0 0.3rem" }}>
          <Button
            icon={<FontAwesomeIcon icon={faCircleXmark} />}
            type="text"
            size="small"
            onClick={() => clearMeasurementsByIds([data.id])}
            aria-label={`Messung ${data.id} löschen`}
          />
          <Button
            icon={<FontAwesomeIcon icon={faArrowsToDot} />}
            type="text"
            size="small"
            onClick={() => {
              console.debug(
                `[MeasurementPanel] Setting reference point for ${data.id}`
              );
              setReferencePoint(data.geometryECEF);
            }}
            aria-label={`Punktreferenz`}
          />

          {`${data?.name ?? ""}`}
        </span>
      }
      description={<PointQueryInfo data={data} />}
    />
  </List.Item>
);

const renderTraverseItem = (
  data: TraverseMeasurementEntry,
  idx: number,
  clearMeasurementsByIds: (ids: string[]) => void
) => (
  <List.Item key={data.id}>
    <List.Item.Meta
      title={
        <span style={{ padding: "0 0.3rem" }}>
          <Button
            icon={<FontAwesomeIcon icon={faCircleXmark} />}
            type="text"
            size="small"
            onClick={() => clearMeasurementsByIds([data.id])}
            aria-label={`Polygonzug ${data.id} löschen`}
          />
          {`Polygonzug ${data.derived?.totalLength?.toFixed(2) || "0"}m`}
        </span>
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
    clear: (ids: string[]) => void,
    setReferencePoint?: Dispatch<SetStateAction<Cartesian3 | null>>
  ) => React.ReactNode;
}

const toggleTypeInSet = (
  type: MeasurementMode,
  prev: Set<MeasurementMode>
): Set<MeasurementMode> => {
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
}: MeasurementSectionProps) {
  const {
    clearMeasurementsByIds,
    clearMeasurementsByType,
    measurements,
    hideMeasurementsOfType,
    setHideMeasurementsOfType,
    hideLabelsOfType,
    setHideLabelsOfType,
    setReferencePoint,
  } = useCesiumMeasurements();
  const { token } = theme.useToken();
  const [expanded, setExpanded] = useState(true);
  const prevActiveRef = useRef(active);

  // Check if active just became true and expand if so
  if (active && !prevActiveRef.current) {
    setExpanded(true);
  }
  prevActiveRef.current = active;

  const items = useMemo(
    () => measurements.filter((m) => m.type === type),
    [measurements, type]
  );
  const clearAll = useCallback(() => {
    clearMeasurementsByType(type);
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
      <Collapse
        style={{ backgroundColor: token.colorBgContainer }}
        activeKey={expanded ? [type] : []}
        onChange={(keys) => setExpanded(keys.includes(type))}
        items={[
          {
            key: type,
            label: title,
            children: (
              <div style={{ padding: "0.5rem" }}>
                <Typography.Text type="secondary">
                  {placeholder}
                </Typography.Text>
              </div>
            ),
          },
        ]}
        className="measurement-panel-collapse"
      />
    ) : null;
  }

  const isHidden = hideMeasurementsOfType.has(type);
  const isLabelHidden = hideLabelsOfType.has(type);

  return (
    <Collapse
      style={{ backgroundColor: token.colorBgContainer }}
      activeKey={expanded ? [type] : []}
      onChange={(keys) => setExpanded(keys.includes(type))}
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
                itemRenderer(
                  item,
                  idx,
                  clearMeasurementsByIds,
                  setReferencePoint
                )
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
  const { measurementMode } = useCesiumMeasurements();

  return (
    <Flex vertical gap={2} align="end">
      <InteractiveModeTabs />
      <MeasurementSection
        type={MeasurementMode.PointQuery}
        active={measurementMode === MeasurementMode.PointQuery}
        title={`Punktmessungen`}
        placeholder={
          <>
            Keine Punktmessungen vorhanden.
            <br />
            Zum Messen auf das Stadtmodell klicken
          </>
        }
        itemRenderer={renderPointItem}
      />
      <MeasurementSection
        type={MeasurementMode.Traverse}
        title={`Polygonzüge`}
        active={measurementMode === MeasurementMode.Traverse}
        placeholder={
          <>
            Keine Polygonzüge vorhanden.
            <br />
            Zum Messen auf das Stadtmodell klicken,
            <br />
            zum Abschließen der Messung rechts klicken
          </>
        }
        itemRenderer={renderTraverseItem}
      />
    </Flex>
  );
};

export default MeasurementPanel;
