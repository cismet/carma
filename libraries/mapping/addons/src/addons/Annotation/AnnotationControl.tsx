import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencil } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";

import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";

import type { AddonComponentProps } from "../../lib/registry";
import { useAnnotationActions } from "./annotation-actions";

/** geoportal's topleft column: measurement is 60, highlighting 70, terrain 80 */
const DEFAULT_CONTROL_POSITION: Positions = "topleft";
const DEFAULT_CONTROL_ORDER = 90;

/** active-control blue */
const ACTIVE_COLOR = "#1677ff";

/** the sketch layer's on/off button; separate so a route can drive the mode itself */
export const AnnotationControl = ({
  config,
  libreMap,
}: AddonComponentProps<"annotationControl">) => {
  const { position = DEFAULT_CONTROL_POSITION, order = DEFAULT_CONTROL_ORDER } =
    config ?? {};

  const { isOn, toggle } = useAnnotationActions();

  if (!libreMap) {
    return null;
  }

  return (
    <Control position={position} order={order}>
      <Tooltip
        title={isOn ? "Zeichnen ausschalten" : "Zeichnen einschalten"}
        placement="right"
      >
        <ControlButtonStyler onClick={toggle} dataTestId="annotation-control">
          <FontAwesomeIcon
            icon={faPencil}
            style={isOn ? { color: ACTIVE_COLOR } : undefined}
          />
        </ControlButtonStyler>
      </Tooltip>
    </Control>
  );
};
