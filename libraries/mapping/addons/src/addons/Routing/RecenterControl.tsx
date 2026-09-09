import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";

/**
 * The button that puts the camera back on the user during a navigation, after
 * they moved the map by hand. Rendered only while the follow is paused, so it
 * is also the sign that it is.
 *
 * A control on the map rather than an action in the info box: the box may be
 * closed or scrolled away while the user pans, and the thing to press has to
 * be where the hand already is.
 *
 * Its word is the whole button: no icon, because the map's icons are the
 * standing controls of the left column and this is a sentence to the user, and
 * a crosshairs next to "Zentrieren" says the same thing twice. What it borrows
 * from those controls is the surface, through `ControlButtonStyler`: the same
 * white, the same border, radius and height, at the text size the top-centre
 * controls use, so a button that is wider than the squares still reads as one
 * of them.
 */
/**
 * The size the control layout gives its text controls (`topCenterFontSize`),
 * rather than the 1.125rem the square buttons use for an icon: a word set at
 * icon size reads as a banner.
 */
const CONTROL_TEXT_SIZE = "0.875rem";

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
    {/* the bottomcenter column starts at the middle of the map; the button is
        pulled back by half its own width so it sits centred */}
    <div style={{ transform: "translateX(-50%)" }}>
      <ControlButtonStyler
        width="auto"
        fontSize={CONTROL_TEXT_SIZE}
        onClick={onClick}
        title={label}
        dataTestId="routing-recenter"
      >
        <span style={{ padding: "0 12px", whiteSpace: "nowrap" }}>{label}</span>
      </ControlButtonStyler>
    </div>
  </Control>
);
