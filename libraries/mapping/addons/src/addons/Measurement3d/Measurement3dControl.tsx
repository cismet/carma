import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRuler } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";
import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";
import { useMeasurement3dActions } from "./measurement3d-state";
import {
  MEASUREMENT3D_ICON_COLOR,
  MEASUREMENT3D_TEXT,
} from "./measurement3d-layer-row";

/** geoportal's topleft column: measurement is 60, highlighting 70 */
export const MEASUREMENT3D_CONTROL_DEFAULTS = Object.freeze({
  position: "topleft" as Positions,
  order: 62,
});

type Measurement3dControlProps = {
  position?: Positions;
  order?: number;
};

/** The on/off button; shown only while the map can host the tool. */
export const Measurement3dControl = ({
  position = MEASUREMENT3D_CONTROL_DEFAULTS.position,
  order = MEASUREMENT3D_CONTROL_DEFAULTS.order,
}: Measurement3dControlProps) => {
  const { isOn, available, panelOpen, toggle } = useMeasurement3dActions();
  if (!available) {
    return null;
  }
  return (
    <Control position={position} order={order}>
      <Tooltip
        title={
          isOn ? MEASUREMENT3D_TEXT.control.off : MEASUREMENT3D_TEXT.control.on
        }
        placement="right"
      >
        <ControlButtonStyler
          onClick={toggle}
          dataTestId="measurement3d-control"
        >
          <FontAwesomeIcon
            icon={faRuler}
            style={
              isOn && panelOpen
                ? { color: MEASUREMENT3D_ICON_COLOR.open }
                : undefined
            }
          />
        </ControlButtonStyler>
      </Tooltip>
    </Control>
  );
};
