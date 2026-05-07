import {
  Control,
  ControlButtonStyler,
} from "@carma-mapping/map-controls-layout";
import { Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLocationDot, faSlash } from "@fortawesome/free-solid-svg-icons";

// `"none"` is the resting state: terra-draw is internally in select mode so
// existing measurements remain clickable / selectable, but no new geometry
// is being drawn. There's intentionally no dedicated "select" entry in the
// public union — selection is implicit when neither point nor line is
// active, mirroring how the host app treats measurement features the same
// way as fachobjekte for click purposes.
export type DrawMode = "none" | "point" | "line";

const ACTIVE_BUTTON_TEXT_COLOR = "text-[#1677ff]";

interface ButtonDescriptor {
  mode: Exclude<DrawMode, "none">;
  label: string;
  icon: typeof faLocationDot;
}

const BUTTONS: ButtonDescriptor[] = [
  { mode: "point", label: "Punkt zeichnen", icon: faLocationDot },
  { mode: "line", label: "Linie zeichnen", icon: faSlash },
];

// Tailwind class fragments that fuse the buttons into one visually-connected
// stack — same trick the carma topleft control column uses for compass+3D
// and zoom+/-: drop borders + corner radii at the seams so the group reads
// as a single chunk.
function fuseClassFor(index: number, total: number): string {
  if (total <= 1) return "";
  if (index === 0) return "!border-b-0 !rounded-b-none";
  if (index === total - 1) return "!rounded-t-none !border-t-[1px]";
  return "!rounded-none !border-t-[1px] !border-b-0";
}

export interface DrawModeControlsProps {
  active: DrawMode;
  onSelect: (mode: Exclude<DrawMode, "none">) => void;
  /** Position in the host CarmaMap's ControlLayout. Defaults to topleft 70 — the
   * slot the carma topleft column reserves for app-specific tool clusters
   * below the built-ins (10 zoom, 20 compass, 30 terrain, 50 fullscreen,
   * 60 locator). */
  order?: number;
}

export function DrawModeControls({
  active,
  onSelect,
  order = 70,
}: DrawModeControlsProps) {
  return (
    <Control position="topleft" order={order}>
      <div className="flex flex-col">
        {BUTTONS.map((button, index) => {
          const isActive = active === button.mode;
          return (
            <Tooltip key={button.mode} title={button.label} placement="right">
              <ControlButtonStyler
                onClick={() => onSelect(button.mode)}
                dataTestId={`carma-measurement-${button.mode}-control`}
                useDisabledStyle={false}
                className={fuseClassFor(index, BUTTONS.length)}
              >
                <FontAwesomeIcon
                  icon={button.icon}
                  className={isActive ? ACTIVE_BUTTON_TEXT_COLOR : ""}
                />
              </ControlButtonStyler>
            </Tooltip>
          );
        })}
      </div>
    </Control>
  );
}
