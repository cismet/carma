import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTableColumns } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";

import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";

import type { AddonComponentProps } from "../../lib/registry";
import { useComparingActions } from "./comparing-actions";
import { usePublishCompareLayers } from "./comparing-layers";

/** geoportal's topleft column: measurement 60, highlighting 70, terrain 80 */
const DEFAULT_CONTROL_POSITION: Positions = "topleft";
const DEFAULT_CONTROL_ORDER = 75;

/** active-control blue, as used by the other geoportal controls */
const ACTIVE_COLOR = "#1677ff";

export type ComparingControlConfig = {
  /**
   * Where the comparison is stored, for a route that wants one of its own.
   *
   * Omitted, every route shares one entry, which is what keeps a comparison
   * from being forgotten whenever a route's addon list is edited.
   */
  storageKey?: string;
  controlPosition?: Positions;
  controlOrder?: number;
  label?: string;
  activeLabel?: string;
};

/**
 * Switches the comparison on and off.
 *
 * Separate from the mode addons so one button serves whichever modes a route
 * declares, and so a route that drives the comparison from its own UI can leave
 * this button out entirely.
 */
export const ComparingControl = ({
  config,
  libreMap,
  store,
}: AddonComponentProps<"comparingControl">) => {
  const {
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
    label = "Vergleichsmodus einschalten",
    activeLabel = "Vergleichsmodus ausschalten",
  } = config ?? {};

  const { isOn, toggle } = useComparingActions();
  // the control is the one addon that has both the map and the host store, so
  // it is where the pane's layer list is assembled
  usePublishCompareLayers(store, libreMap, isOn);

  if (!libreMap) {
    return null;
  }

  return (
    <Control position={controlPosition} order={controlOrder}>
      <Tooltip title={isOn ? activeLabel : label} placement="right">
        <ControlButtonStyler onClick={toggle} dataTestId="comparing-control">
          <FontAwesomeIcon
            icon={faTableColumns}
            style={isOn ? { color: ACTIVE_COLOR } : undefined}
          />
        </ControlButtonStyler>
      </Tooltip>
    </Control>
  );
};
