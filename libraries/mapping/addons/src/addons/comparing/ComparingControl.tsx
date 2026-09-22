import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTableColumns } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";

import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";

import type { AddonComponentProps } from "../../lib/registry";
import { useAddonState } from "../../lib/AddonStateContext";
import { useComparingActions } from "./comparing-actions";
import { usePublishCompareLayers } from "./comparing-layers";
import { COMPARING_WORKFLOW_KIND } from "./comparing-workflow";

/** geoportal's topleft column: measurement 60, highlighting 70, terrain 80 */
const DEFAULT_CONTROL_POSITION: Positions = "topleft";
const DEFAULT_CONTROL_ORDER = 75;

/** active-control blue, as used by the other geoportal controls */
const ACTIVE_COLOR = "#1677ff";

export type ComparingControlConfig = {
  /**
   * Whether the button is on the map. Default: true. False mounts only what
   * the comparison needs to run, the pane's layer list and the assignment,
   * so a row brought in by a link works on a route that offers no button.
   */
  showControl?: boolean;
  controlPosition?: Positions;
  controlOrder?: number;
  label?: string;
  activeLabel?: string;
};

/**
 * Switches the comparison on and off, and owns the pane's layer list.
 *
 * Separate from the mode addons so one button serves whichever modes a route
 * declares, and so a route that drives the comparison from its own UI, or
 * only receives one through a shared row, mounts it with `showControl: false`.
 */
export const ComparingControl = ({
  config,
  carma,
  libreMap,
  store,
}: AddonComponentProps<"comparingControl">) => {
  const {
    showControl = true,
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
    label = "Vergleichsmodus einschalten",
    activeLabel = "Vergleichsmodus ausschalten",
  } = config ?? {};

  const { isOn, toggle } = useComparingActions();
  const [activity] = useAddonState("workflowActivity");
  // the control is the one addon that has both the map and the host store, so
  // it is where the pane's layer list is assembled
  usePublishCompareLayers(store, libreMap, isOn);

  if (!libreMap || !showControl) {
    return null;
  }

  // a workflow group running the comparison owns it: switching off means
  // hiding that group, which its engine answers by leaving the mode. Turning
  // the channel off underneath it would leave a running group with no panels.
  const runningGroupId = Object.entries(activity ?? {}).find(
    ([, entry]) =>
      entry.kind === COMPARING_WORKFLOW_KIND && entry.status === "running"
  )?.[0];
  const onClick = () => {
    if (isOn && runningGroupId) {
      carma.mapping2D.setLayerVisibility(runningGroupId, false);
      return;
    }
    toggle();
  };

  return (
    <Control position={controlPosition} order={controlOrder}>
      <Tooltip title={isOn ? activeLabel : label} placement="right">
        <ControlButtonStyler onClick={onClick} dataTestId="comparing-control">
          <FontAwesomeIcon
            icon={faTableColumns}
            style={isOn ? { color: ACTIVE_COLOR } : undefined}
          />
        </ControlButtonStyler>
      </Tooltip>
    </Control>
  );
};
