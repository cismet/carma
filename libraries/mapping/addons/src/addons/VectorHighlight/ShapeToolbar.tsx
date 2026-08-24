import {
  faLeftRight,
  faRotateLeft,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { InputNumber, Popover, Slider, Tooltip } from "antd";

import type { DrawShape } from "@carma-mapping/engines/maplibre";

import { SHAPE_ICONS, SHAPE_LABELS } from "./shapes";

export type ShapeToolbarClassNames = {
  wrapper: string;
  button: string;
  buttonActive: string;
  buttonInactive: string;
  buttonDisabled: string;
  divider: string;
};

/** mirrors geoportal's MeasurementDrawTools, so both modes read as one family */
const DEFAULT_CLASS_NAMES: ShapeToolbarClassNames = {
  wrapper: "w-fit max-w-full flex items-center gap-2 overflow-visible",
  button:
    "flex h-8 w-12 min-w-12 items-center justify-center rounded-[10px] bg-white px-2 transition-colors text-base button-shadow [&_svg]:text-current",
  buttonActive: "!text-[#1677ff] hover:!text-[#1677ff]",
  buttonInactive: "text-gray-600 hover:!text-[#1677ff]",
  buttonDisabled: "text-gray-600 opacity-45 cursor-not-allowed",
  /** the same hairline the interaction panel separates its sections with */
  divider: "h-6 w-px bg-gray-300/80",
};

/** widths a corridor is worth having, in metres */
const BUFFER_MIN = 5;
const BUFFER_MAX = 500;
const BUFFER_STEP = 5;

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
  /** the buffer button, behind its own splitter; for the line shape */
  showBuffer?: boolean;
  /** corridor half-width in metres, applied when the line is finished */
  bufferWidth?: number;
  onBufferWidthChange?: (meters: number) => void;
  /** the width panel; open, it shows the last line again */
  bufferOpen?: boolean;
  onBufferOpenChange?: (open: boolean) => void;
  /** runs the last drawn shape again; the button is left out without it */
  onApplyLastShape?: () => void;
  /** there is a remembered shape to run */
  canApplyLastShape?: boolean;
  lastShapeLabel?: string;
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
  showBuffer = false,
  bufferWidth = 25,
  onBufferWidthChange,
  bufferOpen = false,
  onBufferOpenChange,
  onApplyLastShape,
  canApplyLastShape = false,
  lastShapeLabel = "Letzte Form erneut anwenden",
}: ShapeToolbarProps) => {
  const css = { ...DEFAULT_CLASS_NAMES, ...classNames };

  const bufferLabel = `Pufferbreite (${Math.round(bufferWidth)} m)`;

  const bufferContent = (
    <div
      className="flex w-64 flex-col gap-2"
      // antd renders the popover in a portal, but a click still bubbles up the
      // React tree to the layer row, which would close the panel underneath
      role="presentation"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <Slider
          className="flex-1"
          min={BUFFER_MIN}
          max={BUFFER_MAX}
          step={BUFFER_STEP}
          value={bufferWidth}
          onChange={(value) => onBufferWidthChange?.(value)}
        />
        <InputNumber
          size="small"
          className="w-24"
          min={1}
          max={5000}
          step={BUFFER_STEP}
          value={bufferWidth}
          addonAfter="m"
          onChange={(value) => value != null && onBufferWidthChange?.(value)}
        />
      </div>
      <p className="m-0 text-xs text-gray-500">
        Doppelklick beendet die Linie und wählt im Korridor aus.
      </p>
    </div>
  );

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
      {(showBuffer || onApplyLastShape) && (
        <span className={css.divider} aria-hidden />
      )}
      {showBuffer && (
        <>
          <Popover
            open={bufferOpen}
            onOpenChange={(open) => onBufferOpenChange?.(open)}
            trigger="click"
            placement={tooltipPlacement}
            title="Puffer um die Linie"
            content={bufferContent}
          >
            <button
              type="button"
              onClick={(event) => event.stopPropagation()}
              aria-label={bufferLabel}
              aria-expanded={bufferOpen}
              data-test-id="vector-highlight-buffer"
              className={[
                css.button,
                bufferOpen && activeColor ? "" : css.buttonInactive,
              ].join(" ")}
              style={
                bufferOpen && activeColor ? { color: activeColor } : undefined
              }
            >
              <FontAwesomeIcon icon={faLeftRight} />
            </button>
          </Popover>
        </>
      )}
      {onApplyLastShape && (
        <Tooltip title={lastShapeLabel} placement={tooltipPlacement}>
          {/* a disabled button swallows its own events, so the tooltip needs a host */}
          <span>
            <button
              type="button"
              disabled={!canApplyLastShape}
              onClick={(event) => {
                event.stopPropagation();
                onApplyLastShape();
              }}
              aria-label={lastShapeLabel}
              data-test-id="vector-highlight-apply-last-shape"
              className={[
                css.button,
                canApplyLastShape ? css.buttonInactive : css.buttonDisabled,
              ].join(" ")}
            >
              <FontAwesomeIcon icon={faRotateLeft} />
            </button>
          </span>
        </Tooltip>
      )}
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
