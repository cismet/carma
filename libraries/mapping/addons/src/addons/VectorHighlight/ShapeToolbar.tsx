import { faLeftRight, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, InputNumber, Popover, Slider, Tooltip } from "antd";

import type { DrawShape } from "@carma-mapping/engines/maplibre";

import {
  MAX_BUFFER_WIDTH,
  MIN_BUFFER_WIDTH,
  SHAPE_ICONS,
  SHAPE_LABELS,
} from "./shapes";

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

/** slider range in metres; closing the panel is what switches the buffer off.
 *  Single metres, since the value is the step added on top of what is already
 *  applied and 1 m more is a normal thing to ask for. `bufferMin` normally
 *  ends the slider at the shape's own limit; this is the fallback without it. */
const BUFFER_MIN = -100;
const BUFFER_MAX = 500;
const BUFFER_STEP = 1;

/**
 * Steps the slider has on either side of zero.
 *
 * The two halves cover very different distances — a shape may only shrink 20 m
 * but grow 500 — so the handle carries a position rather than a width, and the
 * width is mapped out of it. That puts zero in the middle whatever the shape
 * allows, and gives the shrink half the whole left track instead of the sliver
 * its share of a straight range would be.
 *
 * One position per metre of the grow half, so dragging right lands on every
 * single metre; the shrink half divides its shorter distance over the same
 * count, which only makes it finer than the whole metres it rounds to.
 */
const SLIDER_HALF = BUFFER_MAX;

/**
 * How the grow half spends its track. The panel gives that half some 70 px for
 * 500 m, so a straight mapping moves in jumps of eight no matter how fine the
 * steps are — the pixels run out, not the positions. Squaring the position
 * spends the pixels where the widths are asked for: the metres come one per
 * pixel around zero, and the far end coarsens to reach 500 m all the same.
 */
const GROW_CURVE = 2;

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
  /** metres the next apply adds on top of `bufferApplied` */
  bufferWidth?: number;
  /** metres the remembered shape has already grown by */
  bufferApplied?: number;
  onBufferWidthChange?: (meters: number) => void;
  /** the width panel; open shows the remembered shape with its buffer */
  bufferOpen?: boolean;
  onBufferOpenChange?: (open: boolean) => void;
  /** there is a remembered shape to grow */
  canBuffer?: boolean;
  /** runs the previewed shape at the width set now */
  onApplyBuffer?: () => void;
  bufferApplyLabel?: string;
  /** the previewed shape has been shrunk away; there is nothing left to run */
  bufferEmpty?: boolean;
  bufferEmptyLabel?: string;
  /** the deepest step the shape survives, as a negative width; slider and
   *  input both stop there. Omitted: a fixed fallback range. */
  bufferMin?: number;
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
  bufferWidth = 5,
  bufferApplied = 0,
  onBufferWidthChange,
  bufferOpen = false,
  onBufferOpenChange,
  canBuffer = false,
  onApplyBuffer,
  bufferApplyLabel = "Anwenden",
  bufferEmpty = false,
  bufferEmptyLabel = "Puffer verkleinert die Form auf nichts",
  bufferMin,
}: ShapeToolbarProps) => {
  const css = { ...DEFAULT_CLASS_NAMES, ...classNames };

  // never above 0: growing is always allowed
  const floor = Math.min(0, bufferMin ?? BUFFER_MIN);
  // a width can be carried past the range it was set in, and a handle pinned to
  // an end would misreport it
  const maxMeters = Math.max(BUFFER_MAX, bufferWidth);
  const minMeters = Math.min(floor, bufferWidth);

  const toPosition = (meters: number) =>
    meters >= 0
      ? Math.round((meters / maxMeters) ** (1 / GROW_CURVE) * SLIDER_HALF)
      : -Math.round((meters / minMeters) * SLIDER_HALF);
  const toMeters = (position: number) =>
    position >= 0
      ? Math.round((position / SLIDER_HALF) ** GROW_CURVE * maxMeters)
      : -Math.round((position / SLIDER_HALF) * minMeters);

  // what an apply would select at: the step on top of what is already applied
  const bufferTotal = bufferApplied + bufferWidth;
  const bufferLabel = canBuffer
    ? `Puffer um die letzte Form: ${Math.round(bufferTotal)} m`
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
          min={minMeters < 0 ? -SLIDER_HALF : 0}
          max={SLIDER_HALF}
          step={1}
          value={toPosition(bufferWidth)}
          tooltip={{ formatter: (value) => `${toMeters(value ?? 0)} m` }}
          onChange={(value) => onBufferWidthChange?.(toMeters(value))}
        />
        <InputNumber
          size="small"
          className="w-24 [&_input]:text-center"
          min={Math.max(floor, MIN_BUFFER_WIDTH)}
          max={MAX_BUFFER_WIDTH}
          step={BUFFER_STEP}
          value={bufferWidth}
          addonAfter="m"
          onChange={(value) => value != null && onBufferWidthChange?.(value)}
        />
      </div>
      {bufferEmpty && (
        <span className="text-xs text-gray-500">{bufferEmptyLabel}</span>
      )}
      <Button
        type="primary"
        size="small"
        block
        disabled={bufferEmpty}
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
