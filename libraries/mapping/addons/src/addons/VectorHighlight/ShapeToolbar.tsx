import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";

import type { DrawShape } from "@carma-mapping/engines/maplibre";

import { SHAPE_ICONS, SHAPE_LABELS } from "./shapes";

export type ShapeToolbarClassNames = {
  wrapper: string;
  button: string;
  buttonActive: string;
  buttonInactive: string;
  buttonDisabled: string;
};

/** mirrors geoportal's MeasurementDrawTools, so both modes read as one family */
const DEFAULT_CLASS_NAMES: ShapeToolbarClassNames = {
  wrapper: "w-fit max-w-full flex items-center gap-2 overflow-visible",
  button:
    "flex h-8 w-12 min-w-12 items-center justify-center rounded-[10px] bg-white px-2 transition-colors text-base button-shadow [&_svg]:text-current",
  buttonActive: "!text-[#1677ff] hover:!text-[#1677ff]",
  buttonInactive: "text-gray-600 hover:!text-[#1677ff]",
  buttonDisabled: "text-gray-600 opacity-45 cursor-not-allowed",
};

export type ShapeToolbarProps = {
  shapes: DrawShape[];
  shape: DrawShape;
  onShapeChange: (shape: DrawShape) => void;
  onClear: () => void;
  canClear: boolean;
  /** colour of the selected shape; falls back to the control blue of the class */
  activeColor?: string;
  labels?: Partial<Record<DrawShape, string>>;
  clearLabel?: string;
  classNames?: Partial<ShapeToolbarClassNames>;
  tooltipPlacement?: "top" | "bottom" | "left" | "right";
};

export const ShapeToolbar = ({
  shapes,
  shape,
  onShapeChange,
  onClear,
  canClear,
  activeColor,
  labels,
  clearLabel = "Highlights zurücksetzen",
  classNames,
  tooltipPlacement = "bottom",
}: ShapeToolbarProps) => {
  const css = { ...DEFAULT_CLASS_NAMES, ...classNames };

  return (
    <div className={css.wrapper}>
      {shapes.map((entry) => {
        const label = labels?.[entry] ?? SHAPE_LABELS[entry];
        const isActive = entry === shape;
        // an inline colour cannot win against the `!text-` of the active class,
        // so with a colour given the class is left out entirely
        const colorClass = isActive
          ? activeColor
            ? ""
            : css.buttonActive
          : css.buttonInactive;
        return (
          <Tooltip key={entry} title={label} placement={tooltipPlacement}>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onShapeChange(entry);
              }}
              aria-pressed={isActive}
              aria-label={label}
              data-test-id={`vector-highlight-shape-${entry}`}
              className={[css.button, colorClass].join(" ")}
              style={
                isActive && activeColor ? { color: activeColor } : undefined
              }
            >
              <FontAwesomeIcon icon={SHAPE_ICONS[entry]} />
            </button>
          </Tooltip>
        );
      })}
      <Tooltip title={clearLabel} placement={tooltipPlacement}>
        {/* a disabled button swallows its own events, so the tooltip needs a host */}
        <span>
          <button
            type="button"
            disabled={!canClear}
            onClick={(event) => {
              event.stopPropagation();
              onClear();
            }}
            aria-label={clearLabel}
            data-test-id="vector-highlight-clear"
            className={[
              css.button,
              canClear ? css.buttonInactive : css.buttonDisabled,
            ].join(" ")}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </span>
      </Tooltip>
    </div>
  );
};
