import React from "react";
import { Tooltip } from "antd";
import { DisconnectOutlined, LinkOutlined } from "@ant-design/icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowPointer,
  faDrawPolygon,
  faMagnet,
  faScissors,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import { faCircleDot, faClone } from "@fortawesome/free-regular-svg-icons";
import {
  Control,
  ControlButtonStyler,
} from "@carma-mapping/map-controls-layout";
import { AREA_TOOL } from "./useAreaDrawing";

const ACTIVE = "text-[#1677ff]";

const DEFAULT_ICON_SCALE = 0.75;
const ICON_SCALE = {
  select: 0.85,
  "insert-points": 0.85,
  polygon: 0.83,
  split: 0.78,
  assign: 0.72,
  snapping: 0.8,
  unassign: 0.72,
  delete: 0.7,
};

const faTransform = (scale) => ({ size: 16 * scale });

const FA_ICON_STROKE = {
  "take-parcel": 28,
};

const faIconStyle = (key) =>
  FA_ICON_STROKE[key]
    ? {
        stroke: "currentColor",
        strokeWidth: FA_ICON_STROKE[key],
        strokeLinejoin: "round",
      }
    : undefined;

const antIconStyle = (scale) => ({
  fontSize: `${scale / 0.875}em`,
  stroke: "currentColor",
  strokeWidth: 48,
  strokeLinejoin: "round",
});

// same seam trick as DrawModeControls: one fused button stack
const fuseClass = (index, total) => {
  if (total <= 1) {
    return "";
  }
  if (index === 0) {
    return "!border-b-0 !rounded-b-none";
  }
  if (index === total - 1) {
    return "!rounded-t-none !border-t-[1px]";
  }
  return "!rounded-none !border-t-[1px] !border-b-0";
};

const ButtonStack = ({ order, items }) => (
  <Control position="topleft" order={order}>
    <div className="flex flex-col">
      {items.map((item, index) => {
        const scale = ICON_SCALE[item.key] ?? DEFAULT_ICON_SCALE;
        return (
          <Tooltip key={item.key} title={item.tooltip} placement="right">
            <ControlButtonStyler
              onClick={item.onClick}
              disabled={item.disabled}
              dataTestId={`lagis-area-${item.key}`}
              className={fuseClass(index, items.length)}
            >
              {item.icon.iconName ? (
                <FontAwesomeIcon
                  icon={item.icon}
                  transform={faTransform(scale)}
                  style={faIconStyle(item.key)}
                  className={item.active ? ACTIVE : ""}
                />
              ) : (
                <item.icon
                  style={antIconStyle(scale)}
                  className={item.active ? ACTIVE : ""}
                />
              )}
            </ControlButtonStyler>
          </Tooltip>
        );
      })}
    </div>
  </Control>
);

const AreaTools = ({
  tool,
  onToolChange,
  snapping,
  onSnappingChange,
  insertPoints,
  onInsertPointsChange,
  canTakeParcel,
  onTakeParcel,
  canUnassign,
  onUnassign,
  canDelete,
  onDelete,
}) => {
  const toolItem = (key, value, icon, tooltip) => ({
    key,
    icon,
    tooltip,
    active: tool === value,
    // a second click on the active tool goes back to selecting
    onClick: () => onToolChange(tool === value ? AREA_TOOL.SELECT : value),
  });

  return (
    <>
      <ButtonStack
        order={70}
        items={[
          toolItem(
            "select",
            AREA_TOOL.SELECT,
            faArrowPointer,
            "Auswählen und Eckpunkte bearbeiten (ziehen: verschieben, Rechtsklick: löschen)"
          ),
          {
            key: "insert-points",
            icon: faCircleDot,
            tooltip: insertPoints
              ? "Punkt einfügen aus"
              : "Punkt einfügen: Kantenmitten anzeigen, zum Einfügen ziehen",
            active: insertPoints,
            onClick: () => onInsertPointsChange(!insertPoints),
          },
          toolItem(
            "polygon",
            AREA_TOOL.POLYGON,
            faDrawPolygon,
            "Neues Polygon zeichnen"
          ),
          toolItem(
            "split",
            AREA_TOOL.SPLIT,
            faScissors,
            "Polygon teilen: Linie von Rand zu Rand zeichnen, Doppelklick beendet"
          ),
          {
            key: "take-parcel",
            icon: faClone,
            tooltip: "Flurstück übernehmen (Geometrie duplizieren)",
            disabled: !canTakeParcel,
            onClick: onTakeParcel,
          },
          {
            key: "snapping",
            icon: faMagnet,
            tooltip: snapping ? "Snapping aus" : "Snapping an",
            active: snapping,
            onClick: () => onSnappingChange(!snapping),
          },
        ]}
      />
      <ButtonStack
        order={75}
        items={[
          toolItem(
            "assign",
            AREA_TOOL.ASSIGN,
            LinkOutlined,
            "Polygon zuordnen: freie Fläche anklicken"
          ),
          {
            key: "unassign",
            icon: DisconnectOutlined,
            tooltip: "Zuordnung aufheben",
            disabled: !canUnassign,
            onClick: onUnassign,
          },
          {
            key: "delete",
            icon: faTrashCan,
            tooltip: "Polygon entfernen",
            disabled: !canDelete,
            onClick: onDelete,
          },
        ]}
      />
    </>
  );
};

export default AreaTools;
