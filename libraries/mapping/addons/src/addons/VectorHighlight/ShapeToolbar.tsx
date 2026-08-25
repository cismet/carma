import { faLeftRight, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, InputNumber, Popover, Slider, Tooltip } from "antd";

import type { DrawShape } from "@carma-mapping/engines/maplibre";

import { MAX_BUFFER_WIDTH, SHAPE_ICONS, SHAPE_LABELS } from "./shapes";

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

/** slider range in metres; closing the panel is what switches the buffer off */
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
  /** the buffer button, behind its own splitter */
  showBuffer?: boolean;
  /** metres the remembered shape grows by while the panel is open */
  bufferWidth?: number;
  onBufferWidthChange?: (meters: number) => void;
  /** the width panel; open shows the remembered shape with its buffer */
  bufferOpen?: boolean;
  onBufferOpenChange?: (open: boolean) => void;
  /** there is a remembered shape to grow */
  canBuffer?: boolean;
  /** runs the previewed shape at the width set now */
  onApplyBuffer?: () => void;
  bufferApplyLabel?: string;
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
  canBuffer = false,
  onApplyBuffer,
  bufferApplyLabel = "Anwenden",
}: ShapeToolbarProps) => {
  const css = { ...DEFAULT_CLASS_NAMES, ...classNames };

  // growth can carry the width past the slider range, and a handle pinned to
  // the end would misreport it
  const sliderMax = Math.max(BUFFER_MAX, bufferWidth);

  const bufferLabel = canBuffer
    ? `Puffer um die letzte Form: ${Math.round(bufferWidth)} m`
    : "Puffer: erst eine Form zeichnen";

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
          max={sliderMax}
          step={BUFFER_STEP}
          value={bufferWidth}
          onChange={(value) => onBufferWidthChange?.(value)}
        />
        <InputNumber
          size="small"
          className="w-24"
          min={1}
          max={MAX_BUFFER_WIDTH}
          step={BUFFER_STEP}
          value={bufferWidth}
          addonAfter="m"
          onChange={(value) => value != null && onBufferWidthChange?.(value)}
        />
      </div>
      <Button
        type="primary"
        size="small"
        block
        onClick={() => onApplyBuffer?.()}
        data-test-id="vector-highlight-buffer-apply"
      >
        {bufferApplyLabel}
      </Button>
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
      {showBuffer && <span className={css.divider} aria-hidden />}
      {showBuffer && (
        <Popover
          open={bufferOpen && canBuffer}
          onOpenChange={(open) => {
            if (open && !canBuffer) return;
            onBufferOpenChange?.(open);
          }}
          trigger="click"
          placement={tooltipPlacement}
          title="Puffer um die letzte Form"
          content={bufferContent}
        >
          {/* host for the popover trigger: a disabled button swallows its own
              events, and a click stopped on the button never reaches it */}
          <span
            onClick={(event) => event.stopPropagation()}
            role="presentation"
          >
            <button
              type="button"
              disabled={!canBuffer}
              aria-label={bufferLabel}
              aria-expanded={bufferOpen && canBuffer}
              data-test-id="vector-highlight-buffer"
              className={[
                css.button,
                !canBuffer
                  ? css.buttonDisabled
                  : bufferOpen && activeColor
                  ? ""
                  : css.buttonInactive,
              ].join(" ")}
              style={
                canBuffer && bufferOpen && activeColor
                  ? { color: activeColor }
                  : undefined
              }
            >
              <FontAwesomeIcon icon={faLeftRight} />
            </button>
          </span>
        </Popover>
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
