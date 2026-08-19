import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import { faDrawPolygon, faXmark } from "@fortawesome/free-solid-svg-icons";
// outlines, so the three tools read as shapes rather than as filled blobs
import { faCircle, faSquare } from "@fortawesome/free-regular-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";

import { useMapHighlight } from "@carma-mapping/contexts";
import type { ToggledFeature } from "@carma-mapping/contexts";
import {
  useMapHighlighting,
  useLassoHighlight,
  DEFAULT_CIRCLE_RADIUS,
  DEFAULT_CIRCLE_RADIUS_STEP,
  DEFAULT_RECT_WIDTH,
  DEFAULT_RECT_HEIGHT,
  LASSO_LAYER_ID_PREFIX,
} from "@carma-mapping/engines/maplibre";
import type { DrawShape, RectSize } from "@carma-mapping/engines/maplibre";
import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";

import { useAddonState } from "../lib/AddonStateContext";
import type { AddonComponentProps } from "../lib/registry";

/**
 * Highlight/dim addon for the MapLibre map.
 *
 * Modifier+click, or a lasso drag with `lasso: true`, toggles features:
 * highlighted ones keep their paint, everything else is dimmed. The mode stays
 * on until the button, Escape or a route switch ends it.
 *
 * `useMapHighlighting` owns the `highlighted` feature-state, `useLassoHighlight`
 * the drawing; this addon adds the dim expression, the control and the mode
 * lifecycle.
 *
 * Catalog styles carry no dim branch, so it is installed while the mode is on:
 *
 *   on  -> ["case", ["boolean", ["feature-state", stateKey], false],
 *            <original>, dimOpacity]
 *   off -> the original paint property
 *
 * Originals are cached per "<layerId>::<prop>". Use `dimOpacity: null` for
 * styles that already dim themselves via `global-state`.
 */

export type HighlightModeState = {
  isOn: boolean;
  /** shape a drag draws, in the mode and via the Alt+drag shortcut alike */
  shape?: DrawShape;
  /** radius in metres a clicked circle gets */
  circleRadius?: number;
  /** ground size in metres a clicked rectangle gets */
  rectSize?: RectSize;
  /** shapes the route configured, published for the toolbar the app places */
  availableShapes?: DrawShape[];
};

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
   * Alt+drag draws a selection shape without entering the mode first; every
   * feature it covers is toggled the same way a modifier+click would toggle it.
   * It draws whatever shape the toolbar has selected, so the last used one is
   * always a modifier away. Default: false.
   */
  lasso?: boolean;
  /**
   * Shapes the hover panel offers. The first one is preselected.
   * Default: ["lasso", "circle", "rect"].
   *
   * Circle and rectangle differ from the lasso in being exact and repeatable:
   * a 250 m circle can be placed again, identically, anywhere else.
   */
  shapes?: DrawShape[];
  /** Radius in metres a clicked circle starts with. Default: 250 */
  defaultRadius?: number;
  /** Ground size in metres a clicked rectangle starts with. Default: 250 x 250 */
  defaultRectSize?: RectSize;
  /** Dragged radii and edge lengths snap to a multiple of this, in metres. Default: 5 */
  radiusStep?: number;
  /** Render the start/stop buttons in the control column. Default: true */
  showControl?: boolean;
  /** Corner the buttons are registered in. Default: "topleft" */
  controlPosition?: Positions;
  /** Sort order within that corner. Default: 70 */
  controlOrder?: number;
  /**
   * Highlight all source layers of a catalog layer together, so an object drawn
   * as icon and shape highlights as a whole. Default: true.
   */
  combineLayerGeometries?: boolean;
  /** Catalog layer ids (substring, case-insensitive) never combined. */
  excludeCombinedLayers?: string[];
};

const DEFAULT_DIM_OPACITY = 0.25;
const DEFAULT_STATE_KEY = "highlighted";
/** cismap's selection border and the basemap keep their paint */
const DEFAULT_EXCLUDED = ["selection", "background"];
/**
 * The drawing tool's own preview layers, excluded whatever a route configures:
 * they are the tool, not map content. Dimming them fades the very shape the
 * user is pulling (fill 0.1 -> 0.025, and the outline, which sets no
 * `line-opacity`, is read as 1 and falls to 0.25). It only showed up once
 * something was highlighted, since that is when the dim switches on.
 */
const ALWAYS_EXCLUDED = [LASSO_LAYER_ID_PREFIX];
/** lasso first: the freehand shape stays the default it has always been */
const DEFAULT_SHAPES: DrawShape[] = ["lasso", "circle", "rect"];
/** geoportal's topleft column: measurement is 60, terrain 80 */
const DEFAULT_CONTROL_POSITION: Positions = "topleft";
const DEFAULT_CONTROL_ORDER = 70;
/** active-control blue, as used by the other geoportal controls */
const ACTIVE_COLOR = "#1677ff";

/** opacity paint properties per MapLibre layer type */
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
  /** paint values this controller could not install; never retried */
  const skipped = new Set<string>();
  let active = false;

  const isExcluded = (layerId: string) => {
    const id = layerId.toLowerCase();
    return [...ALWAYS_EXCLUDED, ...excluded].some((pattern) =>
      id.includes(pattern)
    );
  };

  /** does this paint value read the zoom anywhere? */
  const readsZoom = (value: unknown): boolean =>
    Array.isArray(value) && (value[0] === "zoom" || value.some(readsZoom));

  /** `<original>` while highlighted, `<original> * dimOpacity` otherwise. The
   *  original is scaled rather than replaced, so a value the style had already
   *  faded out stays faded out instead of reappearing at `dimOpacity`. */
  const dimBranch = (original: unknown) => {
    const value = original == null ? 1 : original;
    return [
      "case",
      ["boolean", ["feature-state", stateKey], false],
      value,
      typeof value === "number" ? value * dimOpacity : ["*", value, dimOpacity],
    ];
  };

  /**
   * The dim expression for one paint value, or `null` when it cannot be built.
   *
   * A zoom-driven original must not be wrapped: MapLibre accepts `["zoom"]`
   * only as the direct input of a top-level `step` / `interpolate`, so a `case`
   * around it fails validation ("zoom expression may only be used as input to a
   * top-level step or interpolate expression"). The write is then refused, the
   * property keeps its old value, the no-op guard in `apply` never settles and
   * the whole thing is rewritten on every `styledata` — an error per layer per
   * event. B-Plan's `text-opacity` fades in by zoom and hit exactly that.
   *
   * The curve therefore stays on top and the branch moves into its outputs,
   * which is equivalent and legal. Zoom in any other position is left alone
   * rather than guessed at.
   */
  const dimmed = (original: unknown): unknown => {
    if (!readsZoom(original)) return dimBranch(original);

    const expr = original as unknown[];
    const inputOf = (index: number) =>
      Array.isArray(expr[index]) && (expr[index] as unknown[])[0] === "zoom";

    // ["interpolate", <type>, ["zoom"], stop, output, ...]
    if (
      expr[0] === "interpolate" ||
      expr[0] === "interpolate-hcl" ||
      expr[0] === "interpolate-lab"
    ) {
      if (!inputOf(2)) return null;
      const out = expr.slice(0, 3);
      for (let i = 3; i < expr.length; i += 2) {
        out.push(expr[i], dimBranch(expr[i + 1]));
      }
      return out;
    }

    // ["step", ["zoom"], <default>, stop, output, ...]
    if (expr[0] === "step") {
      if (!inputOf(1)) return null;
      const out: unknown[] = [expr[0], expr[1], dimBranch(expr[2])];
      for (let i = 3; i < expr.length; i += 2) {
        out.push(expr[i], dimBranch(expr[i + 1]));
      }
      return out;
    }

    return null;
  };

  const apply = () => {
    for (const layer of map.getStyle()?.layers ?? []) {
      if (isExcluded(layer.id)) continue;
      const props = OPACITY_PROPS[layer.type];
      if (!props) continue;
      for (const prop of props) {
        const key = `${layer.id}::${prop}`;
        if (skipped.has(key)) continue;
        if (!originals.has(key)) {
          try {
            originals.set(key, map.getPaintProperty(layer.id, prop) ?? null);
          } catch {
            continue;
          }
        }
        const original = originals.get(key);
        const desired = active ? dimmed(original) : original;
        if (active && desired === null) {
          // no legal dim expression for this value: leave the layer undimmed
          skipped.add(key);
          continue;
        }
        try {
          // skip no-op writes; they would trigger styledata -> apply
          if (
            JSON.stringify(map.getPaintProperty(layer.id, prop)) !==
            JSON.stringify(desired)
          ) {
            map.setPaintProperty(
              layer.id,
              prop,
              (desired ?? undefined) as never
            );
            // A rejected value is reported through the map's `error` event and
            // the property keeps its old one, so the guard above would never
            // settle. Stop after the first refusal instead of rewriting it on
            // every styledata.
            if (
              JSON.stringify(map.getPaintProperty(layer.id, prop)) !==
              JSON.stringify(desired)
            ) {
              skipped.add(key);
            }
          }
        } catch {
          // layer removed between getStyle() and the write
        }
      }
    }
  };

  // a style rebuild drops the expression; reinstall it
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

/** `"<source>::<sourceLayer>"` -> the other source layers of its catalog layer */
type SiblingIndex = Map<string, string[]>;

const siblingKey = (source: string, sourceLayer: string) =>
  `${source}::${sourceLayer}`;

/**
 * Source layers grouped by the catalog layer that draws them, read from
 * `metadata["layer-id"]` (stamped by `styleComposer`). Catalog layers with a
 * single source layer are skipped.
 */
const buildSiblingIndex = (
  map: MaplibreMap,
  excluded: string[]
): SiblingIndex => {
  const groups = new Map<string, { source: string; sourceLayers: Set<string> }>(
    []
  );

  for (const layer of map.getStyle()?.layers ?? []) {
    const metadata = layer.metadata as Record<string, unknown> | undefined;
    const catalogId = metadata?.["layer-id"];
    const source = "source" in layer ? layer.source : undefined;
    const sourceLayer =
      "source-layer" in layer ? layer["source-layer"] : undefined;
    if (
      typeof catalogId !== "string" ||
      typeof source !== "string" ||
      typeof sourceLayer !== "string" ||
      !sourceLayer
    ) {
      continue;
    }
    const lowered = catalogId.toLowerCase();
    if (excluded.some((pattern) => lowered.includes(pattern))) continue;

    const key = `${source}::${catalogId}`;
    let group = groups.get(key);
    if (!group) {
      group = { source, sourceLayers: new Set() };
      groups.set(key, group);
    }
    group.sourceLayers.add(sourceLayer);
  }

  const index: SiblingIndex = new Map();
  for (const { source, sourceLayers } of groups.values()) {
    if (sourceLayers.size < 2) continue;
    for (const sourceLayer of sourceLayers) {
      index.set(
        siblingKey(source, sourceLayer),
        [...sourceLayers].filter((other) => other !== sourceLayer)
      );
    }
  }

  return index;
};

/**
 * Highlights all geometries of one object together.
 *
 * Feature-state is stored per `source + sourceLayer + id`, so highlighting the
 * shape of a feature leaves its icon dimmed. Each change in `toggledFeatures`
 * is mirrored onto the same id in the sibling source layers;
 * `useMapHighlighting` applies the state from there, later tiles included.
 *
 * The delta is mirrored, not the whole set, so removing one geometry removes
 * its siblings instead of being restored by them. Siblings are assumed to share
 * the feature id; `excludeCombinedLayers` covers layers where that fails.
 */
const useCombinedGeometryHighlight = (
  map: MaplibreMap | null,
  enabled: boolean,
  excluded: string[]
) => {
  const { criteria, ensureToggledFeatures, highlightVersion } =
    useMapHighlight();
  const indexRef = useRef<SiblingIndex>(new Map());
  const seenRef = useRef(new Map<string, ToggledFeature>());

  useEffect(() => {
    if (!map || !enabled) {
      indexRef.current = new Map();
      return;
    }
    const rebuild = () => {
      indexRef.current = buildSiblingIndex(map, excluded);
    };
    rebuild();
    map.on("styledata", rebuild);
    return () => {
      map.off("styledata", rebuild);
    };
  }, [map, enabled, excluded]);

  useEffect(() => {
    if (!enabled) return;
    // the provider mutates this map in place, so the snapshot must be a copy
    const current = criteria.toggledFeatures;
    const seen = seenRef.current;

    const siblingsOf = (feature: ToggledFeature): ToggledFeature[] =>
      (
        indexRef.current.get(siblingKey(feature.source, feature.sourceLayer)) ??
        []
      ).map((sourceLayer) => ({ ...feature, sourceLayer }));
    const added: ToggledFeature[] = [];
    const removed: ToggledFeature[] = [];
    for (const [key, feature] of current) {
      if (!seen.has(key)) added.push(...siblingsOf(feature));
    }
    for (const [key, feature] of seen) {
      if (!current.has(key)) removed.push(...siblingsOf(feature));
    }

    if (added.length > 0) ensureToggledFeatures(added, true);
    if (removed.length > 0) ensureToggledFeatures(removed, false);
    // after the writes: the bump they cause then finds no delta
    seenRef.current = new Map(current);
    // the version is the signal; `criteria` is mutated in place
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightVersion, enabled, ensureToggledFeatures]);
};

const SHAPE_LABELS: Record<DrawShape, string> = {
  lasso: "Lasso",
  circle: "Kreis",
  rect: "Rechteck",
};

const SHAPE_ICONS: Record<DrawShape, IconDefinition> = {
  lasso: faDrawPolygon,
  circle: faCircle,
  rect: faSquare,
};

/*
 * Numeric size entry for circle radius and rectangle width/height. Parked while
 * the toolbar UI settles; the plumbing behind it (`onRadiusChange`,
 * `onRectSizeChange`, the manager's `setCircleRadius`/`setRectSize`) is still in
 * place, so this only has to be uncommented to come back.
 *
 * const SizeField = ({
 *   label,
 *   value,
 *   step,
 *   onChange,
 *   testId,
 * }: {
 *   label: string;
 *   value: number;
 *   step: number;
 *   onChange: (value: number) => void;
 *   testId: string;
 * }) => (
 *   <div className="flex items-center gap-2 text-xs">
 *     <span className="shrink-0 w-12">{label}</span>
 *     <InputNumber
 *       size="small"
 *       min={step}
 *       step={step}
 *       value={value}
 *       onChange={(next) => {
 *         if (typeof next === "number" && next > 0) onChange(next);
 *       }}
 *       addonAfter="m"
 *       data-test-id={testId}
 *     />
 *   </div>
 * );
 *
 * and inside the toolbar:
 *
 * {shape === "circle" && (
 *   <SizeField label="Radius" value={radius} step={radiusStep}
 *     onChange={onRadiusChange} testId="vector-highlight-radius" />
 * )}
 * {shape === "rect" && (
 *   <>
 *     <SizeField label="Breite" value={rectSize.width} step={radiusStep}
 *       onChange={(width) => onRectSizeChange({ ...rectSize, width })}
 *       testId="vector-highlight-rect-width" />
 *     <SizeField label="Höhe" value={rectSize.height} step={radiusStep}
 *       onChange={(height) => onRectSizeChange({ ...rectSize, height })}
 *       testId="vector-highlight-rect-height" />
 *   </>
 * )}
 */

/**
 * Shape picker, styled like geoportal's `MeasurementDrawTools`: one rounded
 * white pill per tool rather than a panel with buttons inside, so the highlight
 * mode and the measurement mode read as the same kind of tool. It appears with
 * the mode and disappears with it.
 *
 * Unlike the measurement toolbar the active pill keeps its shadow: that one
 * sits inside a layer button which supplies the surface, this one floats free
 * over the map, and dropping the shadow on one of three pills makes the row
 * look broken.
 *
 * The control slot it lands in stretches the full map width and is click-through
 * (`pointerEvents: "none"` in `control-styles.ts`), so the outer row must stay
 * transparent to clicks and only the button strip may take them back.
 */
const TOOL_BUTTON_BASE =
  "flex h-8 w-12 min-w-12 items-center justify-center rounded-[10px] bg-white px-2 transition-colors text-base button-shadow [&_svg]:text-current";
const TOOL_BUTTON_ACTIVE = "!text-[#1677ff] hover:!text-[#1677ff]";
const TOOL_BUTTON_INACTIVE = "text-gray-600 hover:!text-[#1677ff]";

const ShapeToolbar = ({
  shapes,
  shape,
  onShapeChange,
  onClear,
  canClear,
}: {
  shapes: DrawShape[];
  shape: DrawShape;
  onShapeChange: (shape: DrawShape) => void;
  onClear: () => void;
  canClear: boolean;
}) => (
  <div className="w-fit max-w-full flex items-center gap-2 overflow-visible">
    {shapes.map((entry) => {
      const isActive = entry === shape;
      return (
        <Tooltip key={entry} title={SHAPE_LABELS[entry]} placement="top">
          <button
            type="button"
            onClick={(event) => {
              // the toolbar floats over the map; the click is the toolbar's
              event.stopPropagation();
              onShapeChange(entry);
            }}
            aria-pressed={isActive}
            aria-label={SHAPE_LABELS[entry]}
            data-test-id={`vector-highlight-shape-${entry}`}
            className={[
              TOOL_BUTTON_BASE,
              isActive ? TOOL_BUTTON_ACTIVE : TOOL_BUTTON_INACTIVE,
            ].join(" ")}
          >
            <FontAwesomeIcon icon={SHAPE_ICONS[entry]} />
          </button>
        </Tooltip>
      );
    })}
    <Tooltip title="Highlights zurücksetzen" placement="bottom">
      {/* a disabled button swallows its own events, so the tooltip needs a host */}
      <span>
        <button
          type="button"
          disabled={!canClear}
          onClick={(event) => {
            event.stopPropagation();
            onClear();
          }}
          aria-label="Highlights zurücksetzen"
          data-test-id="vector-highlight-clear"
          className={[
            TOOL_BUTTON_BASE,
            canClear
              ? TOOL_BUTTON_INACTIVE
              : "text-gray-600 opacity-45 cursor-not-allowed",
          ].join(" ")}
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </span>
    </Tooltip>
  </div>
);

/**
 * The shape toolbar as the host app mounts it, mirroring geoportal's
 * `MeasurementDrawTools`: the pills belong under the layer bar, in the strip
 * `InteractionView` uses, not in a map-control corner. The control layout's
 * `topcenter` slot is the layer bar's own, and a second item there splits the
 * row in half, which puts the toolbar visibly off-centre.
 *
 * It reads everything from the shared `highlightMode` state, so the app only
 * has to render it next to `InteractionView`; it draws nothing while the mode
 * is off. The outer wrapper repeats `InteractionView`'s container so both
 * strips line up.
 */
export const VectorHighlightShapeTools = () => {
  const [mode, setMode] = useAddonState("highlightMode");
  const { highlightingActive, setHighlightingActive, clearHighlights } =
    useMapHighlight();
  const shapes = mode?.availableShapes ?? DEFAULT_SHAPES;
  const shape = mode?.shape ?? shapes[0] ?? "lasso";

  /** empties the selection but stays in the mode, so the next shape can be
   *  drawn right away. Dropping `highlightingActive` too is what lifts the dim;
   *  leaving it on would dim the whole map with nothing highlighted. */
  const clear = useCallback(() => {
    clearHighlights();
    setHighlightingActive(false);
  }, [clearHighlights, setHighlightingActive]);

  const setShape = useCallback(
    (next: DrawShape) =>
      setMode((previous) => ({
        ...(previous ?? { isOn: false }),
        shape: next,
      })),
    [setMode]
  );

  if (!mode?.isOn || shapes.length < 2) {
    return null;
  }

  return (
    <div className="relative z-[998] pointer-events-none">
      <div className="pt-3 w-full flex items-center justify-center">
        <div className="relative z-10 pointer-events-auto">
          <ShapeToolbar
            shapes={shapes}
            shape={shape}
            onShapeChange={setShape}
            onClear={clear}
            canClear={highlightingActive}
          />
        </div>
      </div>
    </div>
  );
};

/**
 * Presentational: the active shape's icon, blue while the mode runs. The button
 * does one thing — switch the mode on and off. The shape is picked in
 * `ShapeToolbar`, and so is clearing the highlights, which used to be this
 * button's second meaning.
 *
 * Stateless by design — `Control` re-registers its children on every render, so
 * state kept here would be dropped. The mode lives in the addon.
 */
const HighlightModeButton = ({
  isOn,
  shape,
  onClick,
}: {
  isOn: boolean;
  shape: DrawShape;
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
        icon={SHAPE_ICONS[shape]}
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
    combineLayerGeometries = true,
    excludeCombinedLayers,
    shapes,
    defaultRadius = DEFAULT_CIRCLE_RADIUS,
    defaultRectSize,
    radiusStep = DEFAULT_CIRCLE_RADIUS_STEP,
  } = config;

  // key on the content: route configs pass a fresh array per render
  const shapesKey = (shapes ?? DEFAULT_SHAPES).join(" ");
  const availableShapes = useMemo(
    () => shapesKey.split(" ") as DrawShape[],
    [shapesKey]
  );

  const { highlightingActive, setHighlightingActive, clearHighlights } =
    useMapHighlight();

  // covers the one state the context cannot express: the mode started from the
  // button, before anything is highlighted. Temporary, dies with the route.
  const [mode, setMode] = useAddonState("highlightMode");
  const modeActive = mode?.isOn ?? false;

  // shape and radius are session state, not config: they survive a mode
  // restart within the route and die with it, like the mode itself
  const shape = mode?.shape ?? availableShapes[0] ?? "lasso";
  const circleRadius = mode?.circleRadius ?? defaultRadius;
  // key on the numbers: route configs pass a fresh object per render
  const configuredWidth = defaultRectSize?.width ?? DEFAULT_RECT_WIDTH;
  const configuredHeight = defaultRectSize?.height ?? DEFAULT_RECT_HEIGHT;
  const stateWidth = mode?.rectSize?.width;
  const stateHeight = mode?.rectSize?.height;
  const rectSize = useMemo(
    () => ({
      width: stateWidth ?? configuredWidth,
      height: stateHeight ?? configuredHeight,
    }),
    [stateWidth, stateHeight, configuredWidth, configuredHeight]
  );

  const setCircleRadius = useCallback(
    (next: number) =>
      setMode((previous) => ({
        ...(previous ?? { isOn: false }),
        circleRadius: next,
      })),
    [setMode]
  );
  const setRectSize = useCallback(
    (next: RectSize) =>
      setMode((previous) => ({
        ...(previous ?? { isOn: false }),
        rectSize: next,
      })),
    [setMode]
  );

  /** on when the button, an Alt+click or an Alt+drag started it */
  const isOn = modeActive || highlightingActive;

  /** cross button and Escape: clear the highlights, restore the paint */
  const endMode = useCallback(() => {
    setMode((previous) => ({ ...(previous ?? {}), isOn: false }));
    clearHighlights();
    setHighlightingActive(false);
  }, [setMode, clearHighlights, setHighlightingActive]);

  // the toolbar the app mounts is not inside this component; the shape list
  // lives in config, so it has to travel through the shared state to reach it
  useEffect(() => {
    setMode((previous) => ({
      ...(previous ?? { isOn: false }),
      availableShapes,
    }));
  }, [availableShapes, setMode]);

  // owns the `highlighted` feature-state and the click-to-toggle
  useMapHighlighting({ map: libreMap, modifierClick, stateKey });

  // key on the content: route configs pass a fresh array per render
  const excludedCombinedKey = (excludeCombinedLayers ?? [])
    .map((pattern) => pattern.toLowerCase())
    .join(" ");
  const excludedCombined = useMemo(
    () => (excludedCombinedKey ? excludedCombinedKey.split(" ") : []),
    [excludedCombinedKey]
  );
  useCombinedGeometryHighlight(
    libreMap,
    combineLayerGeometries,
    excludedCombined
  );

  // key on the content: route configs pass a fresh array per render
  const excludedKey = (excludedLayerPatterns ?? DEFAULT_EXCLUDED)
    .map((pattern) => pattern.toLowerCase())
    .join(" ");
  const excluded = useMemo(
    () => (excludedKey ? excludedKey.split(" ") : []),
    [excludedKey]
  );

  // `active` switches between the passive Alt+drag manager and the explicit one
  // that draws on a plain drag while the mode is on. Gated by a null map, since
  // hooks cannot be called conditionally. `onDeactivate` (Escape) ends the whole
  // mode, not only the drawing.
  useLassoHighlight({
    map: lasso ? libreMap : null,
    active: lasso && isOn,
    shape,
    circleRadius,
    rectSize,
    radiusStep,
    onCircleRadiusChange: setCircleRadius,
    onRectSizeChange: setRectSize,
    onDeactivate: endMode,
  });

  const controllerRef = useRef<DimController | null>(null);
  // so a controller created while the mode is already on installs the
  // expression right away
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

  // publish the mode when an Alt+click started it. Rising edge only, so the
  // teardown below cannot switch it back on.
  const previousHighlightingActive = useRef(highlightingActive);
  useEffect(() => {
    const started = !previousHighlightingActive.current && highlightingActive;
    previousHighlightingActive.current = highlightingActive;
    if (started) {
      setMode((previous) => ({ ...(previous ?? {}), isOn: true }));
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

  // route switch: leave the map in its untouched state
  useEffect(
    () => () => {
      setMode((previous) => ({ ...(previous ?? {}), isOn: false }));
      clearHighlights();
      setHighlightingActive(false);
    },
    [setMode, clearHighlights, setHighlightingActive]
  );

  // no MapLibre map, no button (leaflet-only hosts, or before the map exists)
  if (!libreMap || !showControl || (!lasso && !isOn)) {
    return null;
  }

  // registers the button into the surrounding `ControlLayout`, which draws it
  // in that corner; nothing is rendered here. The shape toolbar is not a
  // control: it belongs under the layer bar, so the host app places it with
  // `VectorHighlightShapeTools`.
  return (
    <>
      <Control position={controlPosition} order={controlOrder}>
        <HighlightModeButton
          isOn={isOn}
          shape={shape}
          onClick={
            isOn
              ? endMode
              : () =>
                  setMode((previous) => ({ ...(previous ?? {}), isOn: true }))
          }
        />
      </Control>
    </>
  );
};
