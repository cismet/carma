import { Control, type Positions } from "@carma-mapping/map-controls-layout";

/**
 * The button that puts the camera back on the user during a navigation, after
 * they moved the map by hand. Rendered only while the follow is paused, so it
 * is also the sign that it is.
 *
 * A control on the map rather than an action in the info box: the box may be
 * closed or scrolled away while the user pans, and the thing to press has to
 * be where the hand already is. It sits under the layer bar, where the
 * navigation's own row is.
 *
 * Its word is the whole button: no icon, because this is a sentence to the
 * user, and a crosshairs next to "Zentrieren" says the same thing twice. It is
 * dressed as one of the layer bar's pills above it (the same height, radius,
 * white and shadow the addon toolbars use), not as one of the square controls
 * in the side columns: it hangs off the bar, and a control-styled button
 * under a row of pills looks like it wandered in from the left.
 */
const PILL_CLASS_NAME =
  "flex h-8 w-fit min-w-max cursor-pointer items-center rounded-[10px] border-0 bg-white px-3 text-base text-gray-700 button-shadow hover:text-gray-500";

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
  // kept through the map-only view the addon asks for while navigating: it
  // is the one control that view is there for
  <Control position={position} order={order} keepWhenHidden>
    {/* the topcenter group lets the map underneath take the pointer and
        centres its items itself; the bottomcenter column starts at the middle
        of the map instead, so there the button is pulled back by half its own
        width to sit centred */}
    <div
      style={{
        pointerEvents: "auto",
        transform:
          position === "bottomcenter" ? "translateX(-50%)" : undefined,
      }}
    >
      <button
        type="button"
        className={PILL_CLASS_NAME}
        onClick={onClick}
        // the shadow is what says "button"; a focus ring on top of it is noise
        onMouseDown={(event) => event.preventDefault()}
        title={label}
        data-test-id="routing-recenter"
      >
        <span className="whitespace-nowrap">{label}</span>
      </button>
    </div>
  </Control>
);
