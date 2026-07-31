import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import { faDrawPolygon, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";

import { useMapHighlight } from "@carma-mapping/contexts";
import {
  useMapHighlighting,
  useLassoHighlight,
} from "@carma-mapping/engines/maplibre";
import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";

import { useAddonState } from "../lib/AddonStateContext";
import type { AddonComponentProps } from "../lib/registry";

/**
 * Highlight/dim addon for the MapLibre map (`featureFlagLibreMap`, alias `ng`).
 *
 * Modifier+click a feature -> it stays at its normal paint, everything else is
 * dimmed; clicking it again removes it. With `lasso: true`, an alt+drag does
 * the same for every feature it covers. Removing the last highlight does *not*
 * turn the mode off — the map stays dimmed until the route unmounts, which is
 * where the untouched paint is restored. `useMapHighlighting` owns the
 * `highlighted` feature-state (including re-applying it to features from newly
 * loaded tiles), `useLassoHighlight` owns the drawing; this addon only adds the
 * dim half, the control and the lifecycle.
 *
 * THE CONTROL (`showControl`, on by default): one button in the host's control
 * column, on the geoportal button surface (white `ControlButtonStyler`, blue
 * `#1677ff` icon while on), wearing BELIS' lasso icon:
 *
 *   off -> lasso icon. Click starts the highlighting mode, in which the lasso
 *          draws on a plain drag (crosshair cursor, no Alt) — the modifier is
 *          only needed outside the mode.
 *   on  -> cross icon in the same spot. Click (or Escape) ends the whole thing:
 *          highlights cleared, paint restored, mode off.
 *
 * The mode is not only the button's: an Alt+click or an Alt+drag switches
 * `highlightingActive` on, and that counts as the mode being on too — so the
 * usual way in is to Alt+click one feature and keep going without the modifier.
 * The `highlightMode` channel covers the one case the context cannot express,
 * the mode started before anything is highlighted; it is temporary by design
 * and dies with the route. It is a channel and not local state so the host can
 * end the mode by writing `{ isOn: false }`.
 *
 * WHY THE PAINT WRAPPING: BELIS ships the dim expression in its own style
 * config and gates it with `["global-state", "highlightingEnabled"]`. Styles
 * that come from the layer catalog at runtime have no such branch, so we gate
 * by *installing* the expression while the mode is on:
 *
 *   off -> the layer's original paint properties (untouched)
 *   on  -> ["case", ["boolean", ["feature-state","highlighted"], false],
 *            <original>,   // highlighted -> normal
 *            dimOpacity]   // everything else -> dimmed
 *
 * Originals are captured on first sight per "<layerId>::<prop>", so toggling
 * off restores the true original and toggling on never wraps a wrapper. Set
 * `dimOpacity: null` for styles that already dim via `global-state`, otherwise
 * both would apply.
 */

export type HighlightModeState = { isOn: boolean };

export type VectorHighlightConfig = {
  /** Modifier for click-to-toggle; `null` disables it. Default: "alt" */
  modifierClick?: "alt" | "ctrl" | "shift" | "meta" | null;
  /** Opacity of non-highlighted features; `null` leaves paint alone. Default: 0.25 */
  dimOpacity?: number | null;
  /** Feature-state key, must match the style if it dims itself. Default: "highlighted" */
  stateKey?: string;
  /** Layer ids containing one of these (lowercased) are never dimmed. */
  excludedLayerPatterns?: string[];
  /**
   * Alt+drag draws a freehand lasso; every feature it covers is toggled the
   * same way a modifier+click would toggle it. Default: false.
   */
  lasso?: boolean;
  /** Render the start/stop buttons in the control column. Default: true */
  showControl?: boolean;
  /** Corner the buttons are registered in. Default: "topleft" */
  controlPosition?: Positions;
  /** Sort order within that corner. Default: 70 */
  controlOrder?: number;
};

const DEFAULT_DIM_OPACITY = 0.25;
const DEFAULT_STATE_KEY = "highlighted";
// cismap's selection border and the basemap must keep their paint.
const DEFAULT_EXCLUDED = ["selection", "background"];
// geoportal's topleft column: measurement is 60, terrain 80.
const DEFAULT_CONTROL_POSITION: Positions = "topleft";
const DEFAULT_CONTROL_ORDER = 70;
/** the blue geoportal marks an active control with (feature info, terrain) */
const ACTIVE_COLOR = "#1677ff";

// Opacity paint props per MapLibre layer type.
const OPACITY_PROPS: Record<string, string[]> = {
  fill: ["fill-opacity"],
  line: ["line-opacity"],
  circle: ["circle-opacity", "circle-stroke-opacity"],
  symbol: ["icon-opacity", "text-opacity"],
  "fill-extrusion": ["fill-extrusion-opacity"],
};

interface DimController {
  setActive: (active: boolean) => void;
  destroy: () => void;
}

const createDimController = (
  map: MaplibreMap,
  {
    dimOpacity,
    stateKey,
    excluded,
  }: { dimOpacity: number; stateKey: string; excluded: string[] }
): DimController => {
  const originals = new Map<string, unknown>();
  let active = false;

  const isExcluded = (layerId: string) => {
    const id = layerId.toLowerCase();
    return excluded.some((pattern) => id.includes(pattern));
  };

  const dimBranch = (original: unknown) => [
    "case",
    ["boolean", ["feature-state", stateKey], false],
    original == null ? 1 : original,
    dimOpacity,
  ];

  const apply = () => {
    for (const layer of map.getStyle()?.layers ?? []) {
      if (isExcluded(layer.id)) continue;
      const props = OPACITY_PROPS[layer.type];
      if (!props) continue;
      for (const prop of props) {
        const key = `${layer.id}::${prop}`;
        if (!originals.has(key)) {
          try {
            originals.set(key, map.getPaintProperty(layer.id, prop) ?? null);
          } catch {
            continue;
          }
        }
        const original = originals.get(key);
        const desired = active ? dimBranch(original) : original;
        try {
          // Skip if already applied — avoids a setPaintProperty -> styledata
          // -> apply feedback loop.
          if (
            JSON.stringify(map.getPaintProperty(layer.id, prop)) !==
            JSON.stringify(desired)
          ) {
            map.setPaintProperty(
              layer.id,
              prop,
              (desired ?? undefined) as never
            );
          }
        } catch {
          // layer went away between getStyle() and the write
        }
      }
    }
  };

  // Style rebuilds (a layer added/removed) drop our expression — reinstall.
  const onStyleData = () => {
    if (active) apply();
  };
  map.on("styledata", onStyleData);

  return {
    setActive: (next: boolean) => {
      if (next === active) return;
      active = next;
      apply();
    },
    destroy: () => {
      map.off("styledata", onStyleData);
      if (active) {
        active = false;
        apply();
      }
    },
  };
};

/**
 * The one button, presentational: props in, markup out. Off it wears BELIS'
 * lasso icon, on it becomes a plain cross — same button, so the way in and the
 * way out are the same place in the column.
 *
 * Deliberately stateless — `Control` re-registers its children on every render
 * (its effect deps are `[children]`, and JSX children are a fresh object each
 * time), so state kept here would be dropped. The mode lives in the addon.
 */
const HighlightModeButton = ({
  isOn,
  onClick,
}: {
  isOn: boolean;
  onClick: () => void;
}) => (
  <Tooltip
    title={
      isOn ? "Highlightingmodus ausschalten" : "Highlightingmodus einschalten"
    }
    placement="right"
  >
    <ControlButtonStyler
      onClick={onClick}
      dataTestId="vector-highlight-control"
    >
      <FontAwesomeIcon
        icon={isOn ? faXmark : faDrawPolygon}
        style={isOn ? { color: ACTIVE_COLOR } : undefined}
      />
    </ControlButtonStyler>
  </Tooltip>
);

export const VectorHighlight = ({
  config,
  libreMap,
}: AddonComponentProps<"vectorHighlight">) => {
  const {
    modifierClick = "alt",
    dimOpacity = DEFAULT_DIM_OPACITY,
    stateKey = DEFAULT_STATE_KEY,
    excludedLayerPatterns,
    lasso = false,
    showControl = true,
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
  } = config;

  const { highlightingActive, setHighlightingActive, clearHighlights } =
    useMapHighlight();

  // the control's own, temporary state: it is meant to be gone once the route
  // unmounts. Only needed for the one state the context cannot express — the
  // mode started from the button, before anything is highlighted.
  const [mode, setMode] = useAddonState("highlightMode");
  const modeActive = mode?.isOn ?? false;

  /**
   * The mode, from every direction: the button switches it on, and so does an
   * Alt+click on a feature or an Alt+drag lasso, because both set
   * `highlightingActive`. So whoever started it, the button shows the cross and
   * the lasso draws without the modifier from that point on.
   */
  const isOn = modeActive || highlightingActive;

  /** the cross, and Escape: back to an untouched map */
  const endMode = useCallback(() => {
    setMode({ isOn: false });
    clearHighlights();
    setHighlightingActive(false);
  }, [setMode, clearHighlights, setHighlightingActive]);

  // owns the `highlighted` feature-state and the click-to-toggle
  useMapHighlighting({ map: libreMap, modifierClick, stateKey });

  // route configs pass a fresh array on every render; key the effect on the
  // content instead of the identity
  const excludedKey = (excludedLayerPatterns ?? DEFAULT_EXCLUDED)
    .map((pattern) => pattern.toLowerCase())
    .join(" ");
  const excluded = useMemo(
    () => (excludedKey ? excludedKey.split(" ") : []),
    [excludedKey]
  );

  // Lasso: `active` picks which of the hook's two managers has the map. While
  // the mode is off its passive manager waits for an Alt+drag; while the mode is
  // on the explicit one takes over, drawing on a plain drag with a crosshair
  // cursor. Either way it toggles what the stroke covers and switches
  // highlighting on if it was off, matching the modifier+click semantics above;
  // a stationary Alt+click never becomes a lasso (minPoints guard) and a real
  // Alt+drag never becomes a click (MapLibre drops clicks past its
  // clickTolerance), so the two coexist on the same modifier. Hooks can't be
  // called conditionally, so the feature is gated by handing over a null map.
  //
  // Driven by `isOn`, not by the button alone: the first Alt+click or Alt+drag
  // *is* the way most people start the mode, and from there the modifier should
  // no longer be needed.
  //
  // `onDeactivate` is the hook's Escape route. It ends the mode outright rather
  // than only leaving the drawing part — with the highlights themselves keeping
  // the mode on, "drawing off but mode on" is not a state this control has.
  //
  // No `sources` filter: same as the click path above, every source the style
  // exposes is fair game. Raster basemaps yield no features at all and the
  // geojson overlays carry no feature ids (no `generateId`), so both are
  // skipped anyway.
  useLassoHighlight({
    map: lasso ? libreMap : null,
    active: lasso && isOn,
    onDeactivate: endMode,
  });

  const controllerRef = useRef<DimController | null>(null);
  // read inside the create effect, so a controller built after the mode was
  // already switched on installs the expression right away
  const activeRef = useRef(highlightingActive);
  activeRef.current = highlightingActive;

  useEffect(() => {
    if (!libreMap || dimOpacity == null) {
      return;
    }
    const controller = createDimController(libreMap, {
      dimOpacity,
      stateKey,
      excluded,
    });
    controllerRef.current = controller;
    controller.setActive(activeRef.current);
    return () => {
      controllerRef.current = null;
      controller.destroy();
    };
  }, [libreMap, dimOpacity, stateKey, excluded]);

  useEffect(() => {
    controllerRef.current?.setActive(highlightingActive);
  }, [highlightingActive]);

  // an Alt+click starts the mode without the button, so publish it — otherwise
  // the host sees the mode as off. Rising edge: level-triggered would switch it
  // back on during the teardown below.
  const previousHighlightingActive = useRef(highlightingActive);
  useEffect(() => {
    const started = !previousHighlightingActive.current && highlightingActive;
    previousHighlightingActive.current = highlightingActive;
    if (started) {
      setMode({ isOn: true });
    }
  }, [highlightingActive, setMode]);

  const previousModeActive = useRef(modeActive);
  useEffect(() => {
    const ended = previousModeActive.current && !modeActive;
    previousModeActive.current = modeActive;
    if (ended && highlightingActive) {
      endMode();
    }
  }, [modeActive, highlightingActive, endMode]);

  // Route switch unmounts the addon: leave the map in its untouched state.
  useEffect(
    () => () => {
      setMode({ isOn: false });
      clearHighlights();
      setHighlightingActive(false);
    },
    [setMode, clearHighlights, setHighlightingActive]
  );

  // everything here acts on the MapLibre map, so without one there is nothing
  // the button could do (leaflet-only hosts, or before the map is created)
  if (!libreMap || !showControl || (!lasso && !isOn)) {
    return null;
  }

  // `Control` renders nothing here — it registers the button into the
  // surrounding `ControlLayout` (AddonHost sits inside it) and the layout draws
  // it in that corner, sorted by `order`.
  return (
    <Control position={controlPosition} order={controlOrder}>
      <HighlightModeButton
        isOn={isOn}
        onClick={isOn ? endMode : () => setMode({ isOn: true })}
      />
    </Control>
  );
};
