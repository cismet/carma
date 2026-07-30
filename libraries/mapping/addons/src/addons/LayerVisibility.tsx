import type { CSSProperties } from "react";

import { faEye, faEyeSlash, faFilter } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { isLayerGroup, type LayerStackEntry } from "@carma-mapping/layers";

import type { AddonComponentProps, AddonTrigger } from "../lib/registry";

export type LayerVisibilityConfig = {
  labels?: { hide: string; show: string };
  /** aria-label and tooltip of the trigger button */
  buttonLabel?: string;
};

const DEFAULT_BUTTON_LABEL = "Sichtbarkeit der Layer in der Gruppe steuern";
const DEFAULT_LABELS = { hide: "Layer ausblenden", show: "Layer einblenden" };

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

const members = (target: LayerStackEntry | null) =>
  target && isLayerGroup(target) ? target.layers : [];

export const layerVisibilityTrigger: AddonTrigger<"layerVisibility"> = {
  icon: faFilter,
  label: ({ config }) => config?.buttonLabel ?? DEFAULT_BUTTON_LABEL,
  badge: ({ target }) =>
    members(target).filter((member) => member.visible === false).length,
  isApplicable: ({ target }) => members(target).length > 0,
};

export const LayerVisibility = ({
  config,
  carma,
  target,
}: AddonComponentProps<"layerVisibility">) => {
  const entries = members(target);
  if (entries.length === 0) {
    return null;
  }

  return (
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
      {entries.map((entry) => {
        const visible = entry.visible !== false;
        const labels = config?.labels ?? DEFAULT_LABELS;
        return (
          <button
            key={entry.id}
            type="button"
            aria-pressed={visible}
            title={visible ? labels.hide : labels.show}
            onClick={() => carma.mapping2D.setLayerVisibility(entry.id, !visible)}
            style={toggleButtonStyle}
          >
            <FontAwesomeIcon
              icon={visible ? faEye : faEyeSlash}
              style={{ color: visible ? "#4b5563" : "#9ca3af" }}
            />
            <span style={{ color: visible ? undefined : "#9ca3af" }}>
              {entry.title}
            </span>
          </button>
        );
      })}
    </div>
  );
};
