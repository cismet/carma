import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";

import type { DrawShape } from "@carma-mapping/engines/maplibre";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";

import { SHAPE_ICONS } from "./shapes";

/** active-control blue, as used by the other geoportal controls */
const ACTIVE_COLOR = "#1677ff";

export type HighlightModeButtonProps = {
  isOn: boolean;
  shape: DrawShape;
  onToggle: () => void;
  label?: string;
  activeLabel?: string;
};

export const HighlightModeButton = ({
  isOn,
  shape,
  onToggle,
  label = "Highlightingmodus einschalten",
  activeLabel = "Highlightingmodus ausschalten",
}: HighlightModeButtonProps) => (
  <Tooltip title={isOn ? activeLabel : label} placement="right">
    <ControlButtonStyler
      onClick={onToggle}
      dataTestId="vector-highlight-control"
    >
      <FontAwesomeIcon
        icon={SHAPE_ICONS[shape]}
        style={isOn ? { color: ACTIVE_COLOR } : undefined}
      />
    </ControlButtonStyler>
  </Tooltip>
);
