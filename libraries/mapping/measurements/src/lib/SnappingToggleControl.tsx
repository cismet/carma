import {
  Control,
  ControlButtonStyler,
} from "@carma-mapping/map-controls-layout";
import { Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnet } from "@fortawesome/free-solid-svg-icons";

const ACTIVE_TEXT_COLOR = "text-[#1677ff]";

export interface SnappingToggleControlProps {
  enabled: boolean;
  onToggle: () => void;
  /** Position in the host CarmaMap's ControlLayout. Defaults to topleft 80
   * — one slot below the default `DrawModeControls` order so the magnet
   * sits visually under the draw-mode stack. */
  order?: number;
}

export function SnappingToggleControl({
  enabled,
  onToggle,
  order = 80,
}: SnappingToggleControlProps) {
  return (
    <Control position="topleft" order={order}>
      <Tooltip
        title={enabled ? "Snapping aus" : "Snapping an"}
        placement="right"
      >
        <ControlButtonStyler
          onClick={onToggle}
          dataTestId="carma-measurement-snapping-control"
          useDisabledStyle={false}
        >
          <FontAwesomeIcon
            icon={faMagnet}
            className={enabled ? ACTIVE_TEXT_COLOR : ""}
          />
        </ControlButtonStyler>
      </Tooltip>
    </Control>
  );
}
