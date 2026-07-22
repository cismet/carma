import type { CSSProperties } from "react";

import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export type GroupLayerVisibilityEntry = {
  id: string;
  title: string;
  visible: boolean;
};

export interface GroupLayerVisibilityButtonsProps {
  entries: GroupLayerVisibilityEntry[];
  onToggle: (id: string, visible: boolean) => void;
  labels?: {
    hide: string;
    show: string;
  };
}

const toggleButtonStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  backgroundColor: "white",
  padding: "6px 12px",
  borderRadius: "10px",
  boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
  cursor: "pointer",
  height: "28px",
  border: "2px solid transparent",
};

export const GroupLayerVisibilityButtons = ({
  entries,
  onToggle,
  labels,
}: GroupLayerVisibilityButtonsProps) => (
  <div
    className="group-layer-visibility-buttons"
    style={{
      pointerEvents: "auto",
      fontSize: "13px",
      marginTop: "1px",
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: "8px",
      maxWidth: "calc(100vw - 120px)",
      marginLeft: "auto",
      marginRight: "auto",
    }}
  >
    {entries.map((entry) => (
      <button
        key={entry.id}
        type="button"
        aria-pressed={entry.visible}
        title={labels ? (entry.visible ? labels.hide : labels.show) : undefined}
        onClick={() => onToggle(entry.id, !entry.visible)}
        style={toggleButtonStyle}
      >
        <FontAwesomeIcon
          icon={entry.visible ? faEye : faEyeSlash}
          style={{ color: entry.visible ? "#4b5563" : "#9ca3af" }}
        />
        <span style={{ color: entry.visible ? undefined : "#9ca3af" }}>
          {entry.title}
        </span>
      </button>
    ))}
  </div>
);
