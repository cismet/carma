import {
  Control,
  ControlButtonStyler,
} from "@carma-mapping/map-controls-layout";
import { Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDrawPolygon,
  faLocationDot,
  faMagnet,
  faSlash,
} from "@fortawesome/free-solid-svg-icons";

// `"none"` is the resting state: terra-draw is internally in select mode so
// existing measurements remain clickable / selectable, but no new geometry
// is being drawn (this is what belis ships).
//
// `"select"` is functionally equivalent to "none" inside terra-draw — both
// map to terra-draw's select mode — but exists as a distinct public value
// for hosts that want to surface "user explicitly chose select" as its own
// UI state (e.g. the measurements-playground's four-button mode bar).
//
// `"polygon"` is registered on the terra-draw instance unconditionally and has
// a button here, but it is not part of the default set — belis ships point +
// line only. Hosts that measure areas (lagis) opt in through `modes`.
export type DrawMode = "none" | "select" | "point" | "line" | "polygon";

const ACTIVE_BUTTON_TEXT_COLOR = "text-[#1677ff]";

interface ButtonDescriptor {
  mode: Exclude<DrawMode, "none">;
  label: string;
  icon: typeof faLocationDot;
}

type ButtonMode = "point" | "line" | "polygon";

const BUTTONS: Record<ButtonMode, ButtonDescriptor> = {
  point: { mode: "point", label: "Punkt zeichnen", icon: faLocationDot },
  line: { mode: "line", label: "Linie zeichnen", icon: faSlash },
  polygon: { mode: "polygon", label: "Fläche zeichnen", icon: faDrawPolygon },
};

const DEFAULT_MODES: ButtonMode[] = ["point", "line"];

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
  /** Which draw-mode buttons to render, in the given order. Defaults to
   * `["point", "line"]` (what belis ships). Hosts pass their own list to drop
   * tools they have no use for, or to opt into `"polygon"`, which is not in
   * the default set. */
  modes?: ButtonMode[];
  /** Position in the host CarmaMap's ControlLayout. Defaults to topleft 70 — the
   * slot the carma topleft column reserves for app-specific tool clusters
   * below the built-ins (10 zoom, 20 compass, 30 terrain, 50 fullscreen,
   * 60 locator). */
  order?: number;
  /** Optional snap-toggle slot fused to the bottom of the same button
   * stack. When provided, the magnet button reads as part of the
   * measurement tool group rather than a separate Control. */
  snapping?: {
    enabled: boolean;
    onToggle: () => void;
  };
}

interface RenderedItem {
  key: string;
  tooltip: string;
  testId: string;
  icon: typeof faLocationDot;
  isActive: boolean;
  onClick: () => void;
}

export function DrawModeControls({
  active,
  onSelect,
  order = 70,
  snapping,
  modes = DEFAULT_MODES,
}: DrawModeControlsProps) {
  const items: RenderedItem[] = modes
    .map((mode) => BUTTONS[mode])
    .map((button) => ({
      key: `mode-${button.mode}`,
      tooltip: button.label,
      testId: `carma-measurement-${button.mode}-control`,
      icon: button.icon,
      isActive: active === button.mode,
      onClick: () => onSelect(button.mode),
    }));

  if (snapping) {
    items.push({
      key: "snapping",
      tooltip: snapping.enabled ? "Snapping aus" : "Snapping an",
      testId: "carma-measurement-snapping-control",
      icon: faMagnet,
      isActive: snapping.enabled,
      onClick: snapping.onToggle,
    });
  }

  return (
    <Control position="topleft" order={order}>
      <div className="flex flex-col">
        {items.map((item, index) => (
          <Tooltip key={item.key} title={item.tooltip} placement="right">
            <ControlButtonStyler
              onClick={item.onClick}
              dataTestId={item.testId}
              useDisabledStyle={false}
              className={fuseClassFor(index, items.length)}
            >
              <FontAwesomeIcon
                icon={item.icon}
                className={item.isActive ? ACTIVE_BUTTON_TEXT_COLOR : ""}
              />
            </ControlButtonStyler>
          </Tooltip>
        ))}
      </div>
    </Control>
  );
}
