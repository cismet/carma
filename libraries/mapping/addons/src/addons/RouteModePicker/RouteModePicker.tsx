import { useCallback, useEffect, useRef, useState } from "react";
import { isMobile } from "react-device-detect";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";

import { Control } from "@carma-mapping/map-controls-layout";
import { getModeIcon, getModeLabel } from "@carma-mapping/routing";

import type { AddonComponentProps } from "../../lib/registry";
import type { RouteMode } from "../Routing/routeMode";
import { useRouteMode, useRouteModeState } from "../Routing/routeModeChannel";
import {
  DEFAULT_CONTROL_ORDER,
  DEFAULT_CONTROL_POSITION,
  DEFAULT_MODE,
  DEFAULT_MODES,
} from "./config";

/**
 * The anchor's two shapes. On a desktop it takes no room in the column and
 * marks its bottom right corner. On a phone it is a row of the column, and
 * a row as wide as the inputs: the column shrink-wraps its items, so a
 * percentage width would be measured against the content, which is why it
 * is a zero width with a percentage minimum, the same trick the origin input
 * uses (see `OriginSearch`).
 */
const ANCHOR_CLASS_NAME =
  "relative max-sm:mt-1.5 max-sm:w-0 max-sm:min-w-full sm:h-0 sm:w-0";

/**
 * The pill. On a desktop a column beside the inputs, exactly as tall as the
 * two of them (measured, see `useInputsHeight`). On a phone a row spanning
 * the width, with buttons tall enough for a finger.
 */
const PILL_CLASS_NAME =
  "flex gap-0.5 rounded-[10px] bg-white p-1 button-shadow max-sm:w-full max-sm:flex-row sm:absolute sm:bottom-0 sm:left-1.5 sm:h-[var(--inputs-height)] sm:flex-col";

/**
 * One mode. Flexes to a third of the pill either way: of its height on a
 * desktop, of its width on a phone.
 */
const BUTTON_CLASS_NAME =
  "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[6px] border-0 text-sm max-sm:h-9 sm:w-7";

/**
 * How tall the inputs beside the pill are, so the pill is exactly that tall.
 *
 * Measured rather than derived from the inputs' CSS: their height is an `em`
 * formula whose font size depends on what ant and the host set, and a number
 * copied from it was off in practice. The anchor sits right under the last
 * input and the column's top is the top of the first, so the distance between
 * the two is the height of the stack, gaps included. Re-measured whenever the
 * column changes size (the origin input arriving, a font loading).
 *
 * A callback ref rather than an effect over a ref object: `Control` hands its
 * children to the layout, which renders them in a subtree of its own a render
 * later, so an effect here would run before the anchor exists. The callback
 * fires when the node actually mounts, wherever that is, and its identity is
 * stable so React does not re-fire it per render.
 *
 * `null` until measured, and on a phone, where the pill is a row and its
 * height is its own.
 */
const useInputsHeight = (): [
  number | null,
  (node: HTMLDivElement | null) => void
] => {
  const [height, setHeight] = useState<number | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const anchorRef = useCallback((anchor: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    // the control's wrapper is `display: contents`, so the column is two up
    const column = anchor?.parentElement?.parentElement;
    if (!anchor || !column) {
      return;
    }
    const measure = () => {
      const stack =
        anchor.getBoundingClientRect().top - column.getBoundingClientRect().top;
      setHeight(stack > 0 ? Math.round(stack) : null);
    };
    measure();
    observerRef.current = new ResizeObserver(measure);
    observerRef.current.observe(column);
  }, []);
  useEffect(() => () => observerRef.current?.disconnect(), []);
  return [height, anchorRef];
};

/** what the tooltip says the click does, per mode */
const MODE_TOOLTIPS: Record<RouteMode, string> = {
  car: "Mit dem Auto",
  bike: "Mit dem Fahrrad",
  walk: "Zu Fuß",
  transit: "Mit Bus und Bahn",
};

/**
 * The "womit?" picker: one pill of icon buttons, car, bike, on foot, beside
 * the inputs that say where from and where to. What it produces goes on the
 * `routeMode` channel and nowhere else: "In der Nähe" ranks by it today, a
 * routing UI will compute its route by it, and neither knows about this
 * component.
 *
 * It is on screen only while some consumer asks for a mode (see
 * `useRouteModeRequest`), unless the route sets `alwaysVisible`, so a map
 * without anything to route shows no way to choose how. It is dressed as the
 * pills of the layer bar (white, rounded, the button shadow), the same as the
 * routing's recenter button, rather than as a square control of the side
 * columns.
 *
 * Where it sits: to the right of the search and the origin input, as a
 * vertical pill spanning both, rather than as one more row of the column
 * those two are in. The column is a stack and has no slot beside it, so the
 * control registers a zero-size anchor at the *end* of the column and hangs
 * the pill off its bottom, absolutely positioned past the column's right edge
 * and growing upward. The end and not the top: the layout keys the column's
 * items by index, so a control put in front of the search would shift it to
 * another key, remount it and reset its mode. On a phone the inputs span the
 * whole width and there is no right of them, so the anchor is an ordinary
 * row under the origin input there, and the pill lies horizontal in it.
 *
 * The addon publishes `defaultMode` once on mount and takes nothing back on
 * unmount: the channel stays readable at its last value, so a consumer never
 * sees the mode change under a ranking that is running.
 */
export const RouteModePicker = ({
  config,
}: AddonComponentProps<"routeModePicker">) => {
  const {
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
    modes = DEFAULT_MODES,
    defaultMode = DEFAULT_MODE,
    alwaysVisible = false,
  } = config ?? {};

  const { requests } = useRouteModeState();
  const [mode, setMode] = useRouteMode();
  const [inputsHeight, anchorRef] = useInputsHeight();

  useEffect(() => {
    setMode(defaultMode);
    // once: a consumer's later choice must not be overwritten by a re-render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = alwaysVisible || Object.keys(requests).length > 0;
  if (!visible) {
    return null;
  }

  return (
    <Control position={controlPosition} order={controlOrder}>
      {/* the anchor: the column's last item, at its right edge (the column
          right-aligns its items) and its bottom; it takes no room there on a
          desktop and is an ordinary row on a phone */}
      <div ref={anchorRef} className={ANCHOR_CLASS_NAME}>
        <div
          className={PILL_CLASS_NAME}
          // the measured height goes through a variable the desktop class
          // reads, so the phone's row keeps its own height
          style={
            {
              pointerEvents: "auto",
              "--inputs-height":
                inputsHeight !== null ? `${inputsHeight}px` : "auto",
            } as React.CSSProperties
          }
          role="group"
          aria-label="Verkehrsmittel"
          data-test-id="route-mode-picker"
        >
          {modes.map((candidate) => {
            const active = candidate === mode;
            const button = (
              <button
                key={candidate}
                type="button"
                aria-pressed={active}
                aria-label={getModeLabel(candidate)}
                onClick={() => setMode(candidate)}
                // the shadow is what says "button"; a focus ring is noise
                onMouseDown={(event) => event.preventDefault()}
                className={`${BUTTON_CLASS_NAME} ${
                  active
                    ? "bg-black/10 text-gray-800"
                    : "bg-transparent text-gray-500 hover:bg-black/5"
                }`}
              >
                <FontAwesomeIcon icon={getModeIcon(candidate)} />
                {/* the word only where there is room for it and a finger
                    needs it: a phone's full-width row */}
                <span className="sm:hidden">{getModeLabel(candidate)}</span>
              </button>
            );
            // no tooltip under a finger: it opens on the tap and stays until
            // the next tap somewhere else, and the row carries the word anyway
            return isMobile ? (
              button
            ) : (
              <Tooltip
                key={candidate}
                title={MODE_TOOLTIPS[candidate]}
                placement="right"
              >
                {button}
              </Tooltip>
            );
          })}
        </div>
      </div>
    </Control>
  );
};
