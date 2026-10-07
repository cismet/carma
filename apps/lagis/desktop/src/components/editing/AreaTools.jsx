import React from "react";
import { Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowPointer,
  faClone,
  faDrawPolygon,
  faLink,
  faLinkSlash,
  faMagnet,
  faScissors,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import {
  Control,
  ControlButtonStyler,
} from "@carma-mapping/map-controls-layout";
import { AREA_TOOL } from "./useAreaDrawing";

const ACTIVE = "text-[#1677ff]";

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
      {items.map((item, index) => (
        <Tooltip key={item.key} title={item.tooltip} placement="right">
          <ControlButtonStyler
            onClick={item.onClick}
            disabled={item.disabled}
            dataTestId={`lagis-area-${item.key}`}
            className={fuseClass(index, items.length)}
          >
            <FontAwesomeIcon
              icon={item.icon}
              className={item.active ? ACTIVE : ""}
            />
          </ControlButtonStyler>
        </Tooltip>
      ))}
    </div>
  </Control>
);

const AreaTools = ({
  tool,
  onToolChange,
  snapping,
  onSnappingChange,
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
            "Auswählen und Eckpunkte bearbeiten (ziehen: verschieben, Mittelpunkt ziehen: einfügen, Rechtsklick: löschen)"
          ),
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
          toolItem(
            "assign",
            AREA_TOOL.ASSIGN,
            faLink,
            "Polygon zuordnen: freie Fläche anklicken"
          ),
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
          {
            key: "take-parcel",
            icon: faClone,
            tooltip: "Flurstück übernehmen (Geometrie duplizieren)",
            disabled: !canTakeParcel,
            onClick: onTakeParcel,
          },
          {
            key: "unassign",
            icon: faLinkSlash,
            tooltip: "Zuordnung aufheben",
            disabled: !canUnassign,
            onClick: onUnassign,
          },
          {
            key: "delete",
            icon: faTrash,
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
