import { Control, type Positions } from "@carma-mapping/map-controls-layout";

import type { AddonComponentProps } from "../../lib/registry";
import { HighlightModeButton } from "./HighlightModeButton";
import { useHighlightModeActions } from "./highlight-actions";

/** geoportal's topleft column: measurement is 60, terrain 80 */
const DEFAULT_CONTROL_POSITION: Positions = "topleft";
const DEFAULT_CONTROL_ORDER = 70;

/**
 * The mode's on/off button in the map control column. Separate from
 * `vectorHighlight` so a route can run the highlighting headless, or replace
 * this button with its own UI.
 */
export const VectorHighlightControl = ({
  config,
  libreMap,
}: AddonComponentProps<"vectorHighlightControl">) => {
  const {
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
  } = config ?? {};

  const { isOn, shape, startMode, endMode, operation, colorForOperation } =
    useHighlightModeActions();

  if (!libreMap) {
    return null;
  }

  return (
    <Control position={controlPosition} order={controlOrder}>
      <HighlightModeButton
        isOn={isOn}
        shape={shape}
        onToggle={isOn ? endMode : startMode}
        activeColor={colorForOperation(operation)}
      />
    </Control>
  );
};
