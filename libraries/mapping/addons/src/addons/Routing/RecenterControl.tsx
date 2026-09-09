import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLocationCrosshairs } from "@fortawesome/free-solid-svg-icons";

import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";

/**
 * The button that puts the camera back on the user during a navigation,
 * after they moved the map by hand: a pill at the bottom of the screen, the
 * way every navigation app does it, rendered only while the follow is
 * paused, so it is also the sign that it is.
 *
 * A control on the map rather than an action in the info box: the box may be
 * closed or scrolled away while the user pans, and the thing to press has to
 * be where the hand already is.
 */
type RecenterControlProps = {
  position: Positions;
  order: number;
  label: string;
  onClick: () => void;
};

export const RecenterControl = ({
  position,
  order,
  label,
  onClick,
}: RecenterControlProps) => (
  <Control position={position} order={order}>
    {/* the bottomcenter column starts at the middle of the map; the pill is
        pulled back by half its own width so it sits centred */}
    <div style={{ transform: "translateX(-50%)" }}>
      <ControlButtonStyler
        width="auto"
        onClick={onClick}
        title={label}
        dataTestId="routing-recenter"
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "0 14px",
            whiteSpace: "nowrap",
          }}
        >
          <FontAwesomeIcon icon={faLocationCrosshairs} />
          {label}
        </span>
      </ControlButtonStyler>
    </div>
  </Control>
);
