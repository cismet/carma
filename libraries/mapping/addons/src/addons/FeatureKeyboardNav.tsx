import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MaplibreMap, MapGeoJSONFeature } from "maplibre-gl";

import {
  faArrowsUpDownLeftRight,
  faTriangleExclamation,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";

import { useDatasheet, useMapSelection } from "@carma-mapping/contexts";
import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";

import { useAddonState } from "../lib/AddonStateContext";
import type { AddonComponentProps, AddonTrigger } from "../lib/registry";

import {
  candidateKeyOf,
  type CandidateSet,
  type NavCandidate,
} from "./feature-keyboard-nav/candidates";
import {
  DEFAULT_CANDIDATE_DEBOUNCE_MS,
  DEFAULT_CROSS_LAYER,
  DEFAULT_CURRENT_LAYER_BONUS,
  DEFAULT_EDGE_BEHAVIOR,
  DEFAULT_EXPLAIN,
  DEFAULT_EXPLAIN_MS,
  DEFAULT_FAN_DEG,
  DEFAULT_MAX_CANDIDATES,
  DEFAULT_MIN_STEP_PX,
  DEFAULT_PAN_DURATION_MS,
  DEFAULT_PAN_STEP_FRACTION,
  DEFAULT_STRATEGY,
  DEFAULT_VERIFY_MAX_RETRIES,
  EDGE_PAN_SETTLE_TIMEOUT_MS,
  KEEP_IN_VIEW_INSET_FRACTION,
  resolveNavConstants,
  SHIFT_PAN_PX,
} from "./feature-keyboard-nav/constants";
import {
  ExplainLegend,
  ExplainOverlay,
  toExplainSnapshot,
  type ExplainSnapshot,
} from "./feature-keyboard-nav/ExplainOverlay";
import {
  isTypingTarget,
  navHintRows,
  resolveNavBinding,
  type NavKeyBinding,
} from "./feature-keyboard-nav/keymap";
import { interiorPointOf, isAreaGeometry } from "./feature-keyboard-nav/origin";
import { pickInDirection, rankedKeys } from "./feature-keyboard-nav/pick";
import {
  projectCandidates,
  viewportDiagonalPx,
} from "./feature-keyboard-nav/projection";
import { catalogLayerIdOfFeature } from "./feature-keyboard-nav/scope";
import { useNavCandidates } from "./feature-keyboard-nav/useNavCandidates";
import { useNavScope } from "./feature-keyboard-nav/useNavScope";
import {
  NAV_AXES,
  type FeatureKeyboardNavConfig,
  type NavDirection,
  type PickExplanation,
  type ScreenPoint,
} from "./feature-keyboard-nav/types";

/**
 * Arrow-key navigation over vector features on the MapLibre map.
 *
 * The arrow keys select "the feature lying in that direction on screen".
 * Direction always means screen direction, never compass direction: with the
 * map rotated by any bearing, `ArrowUp` selects towards the top edge, because
 * every number is computed on projected pixels.
 *
 * One component and one config object serve three deployment shapes,
 * distinguished only by where the addon is declared:
 *
 *   - on a route's addon list: every navigable layer, toggled from the control
 *     column;
 *   - on a workflow's `tools`: the layers of the group that workflow creates,
 *     toggled from the group's own button;
 *   - on a layer entry's `tools`: that one catalog layer, from its own button.
 *
 * In the two tool shapes the addon is only mounted while its trigger is active,
 * so being mounted *is* the mode. Nothing in the picking core knows which shape
 * it is running in; the shapes only differ in what `resolveNavScope` returns.
 *
 * The renderer stays out of the hot path: the candidate set is queried once per
 * settled map movement and every keypress is arithmetic on it. See
 * `useNavCandidates` for why, and for what that costs.
 */

export type FeatureNavigationModeState = {
  isOn: boolean;
  /** the candidate set is bounded or a query failed; surfaced, never hidden */
  degraded: boolean;
};

const DEFAULT_CONTROL_POSITION: Positions = "topleft";
/** geoportal's topleft column: measurement 60, vector highlight 70, terrain 80 */
const DEFAULT_CONTROL_ORDER = 75;
/** nothing else uses the bottom-center column, so the order only has to exist */
const LEGEND_CONTROL_ORDER = 10;
const ACTIVE_COLOR = "#1677ff";
const WARNING_COLOR = "#d4380d";
const FADE_MS = 400;
/** half-size of the box `verifyWithRenderer` asks about, in pixels */
const VERIFY_PROBE_PX = 3;

export const featureKeyboardNavTrigger: AddonTrigger<"featureKeyboardNav"> = {
  icon: faArrowsUpDownLeftRight,
  label: () => "Mit Pfeiltasten durch die Objekte navigieren",
  // the two tool shapes always have a target; the global shape never renders a
  // trigger, since `AddonHost` mounts it directly
  isApplicable: ({ target }) => target !== null,
};

/** The origin of a step: an interior point of the selected feature. */
type NavOrigin = {
  point: ScreenPoint;
  isArea: boolean;
  key?: string;
  layerId?: string;
};

const resolveOrigin = (
  map: MaplibreMap,
  feature: MapGeoJSONFeature | null
): NavOrigin | undefined => {
  if (feature) {
    const interior = interiorPointOf(feature.geometry);
    if (interior) {
      const projected = map.project([interior[0], interior[1]]);
      const key = candidateKeyOf(feature);
      const layerId = catalogLayerIdOfFeature(feature);
      return {
        point: { x: projected.x, y: projected.y },
        isArea: isAreaGeometry(feature.geometry.type),
        ...(key ? { key } : {}),
        ...(layerId ? { layerId } : {}),
      };
    }
  }
  // bootstrap: with nothing selected the first arrow steps in from the middle
  // of the screen, so the dataset can be entered without a click
  const canvas = map.getCanvas();
  if (canvas.clientWidth === 0 || canvas.clientHeight === 0) return undefined;
  return {
    point: { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 },
    isArea: false,
  };
};

/**
 * Confirm the winner against what the renderer actually draws, and walk down
 * the ranking while it says no. An error is not a no: the candidate set is the
 * authority, the check is the second opinion, so a failing query accepts the
 * computed winner rather than dropping the step.
 */
const verifyWinner = (
  map: MaplibreMap,
  explanation: PickExplanation,
  maxRetries: number
): string | undefined => {
  const order = rankedKeys(explanation);
  const computed = order[0];
  if (computed === undefined) return undefined;

  for (
    let attempt = 0;
    attempt <= maxRetries && attempt < order.length;
    attempt++
  ) {
    const key = order[attempt];
    const evaluation = explanation.evaluations.find(
      (entry) => entry.key === key
    );
    if (!evaluation) continue;
    const { x, y } = evaluation.nearestPointPx;
    try {
      // a box rather than the bare point: the nearest point sits exactly on the
      // outline, where a one-pixel query answers on rounding alone
      const probe: [[number, number], [number, number]] = [
        [x - VERIFY_PROBE_PX, y - VERIFY_PROBE_PX],
        [x + VERIFY_PROBE_PX, y + VERIFY_PROBE_PX],
      ];
      const hits = map.queryRenderedFeatures(probe);
      if (hits.some((hit) => candidateKeyOf(hit) === key)) return key;
    } catch {
      return computed;
    }
  }
  return undefined;
};

/** Pan just far enough to bring `point` back inside the safe rectangle. */
const keepInView = (
  map: MaplibreMap,
  point: ScreenPoint,
  durationMs: number
) => {
  const canvas = map.getCanvas();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const insetX = width * KEEP_IN_VIEW_INSET_FRACTION;
  const insetY = height * KEEP_IN_VIEW_INSET_FRACTION;

  let dx = 0;
  let dy = 0;
  if (point.x < insetX) dx = point.x - insetX;
  else if (point.x > width - insetX) dx = point.x - (width - insetX);
  if (point.y < insetY) dy = point.y - insetY;
  else if (point.y > height - insetY) dy = point.y - (height - insetY);

  // zoom is never changed by navigation
  if (dx !== 0 || dy !== 0) map.panBy([dx, dy], { duration: durationMs });
};

/**
 * Presentational, like `VectorHighlight`'s: `Control` re-registers its children
 * on every render, so state kept here would be dropped.
 */
const NavModeButton = ({
  isOn,
  degraded,
  onClick,
}: {
  isOn: boolean;
  degraded: boolean;
  onClick: () => void;
}) => (
  <Tooltip
    title={
      isOn
        ? degraded
          ? "Pfeiltasten-Navigation beenden (Kandidatenmenge unvollständig)"
          : "Pfeiltasten-Navigation beenden"
        : "Mit Pfeiltasten durch die Objekte navigieren"
    }
    placement="right"
  >
    <ControlButtonStyler
      onClick={onClick}
      dataTestId="feature-keyboard-nav-control"
    >
      <FontAwesomeIcon
        icon={isOn ? faXmark : faArrowsUpDownLeftRight}
        style={
          isOn ? { color: degraded ? WARNING_COLOR : ACTIVE_COLOR } : undefined
        }
      />
    </ControlButtonStyler>
  </Tooltip>
);

/** The keymap, rendered from the same table the key handler matches against. */
const NavHintChip = ({
  degraded,
  hasActivateHandler,
}: {
  degraded: boolean;
  hasActivateHandler: boolean;
}) => (
  <div
    className="feature-keyboard-nav-hint"
    style={{
      pointerEvents: "auto",
      display: "flex",
      alignItems: "center",
      gap: 10,
      background: "white",
      padding: "6px 12px",
      borderRadius: 10,
      boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
      fontSize: 13,
      color: "#4b5563",
    }}
    data-test-id="feature-keyboard-nav-hint"
  >
    <FontAwesomeIcon icon={faArrowsUpDownLeftRight} />
    {navHintRows({ hasActivateHandler }).map((row) => (
      <span key={row.label}>
        <span style={{ fontWeight: 600 }}>{row.keys}</span>{" "}
        <span style={{ color: "#9ca3af" }}>{row.label}</span>
      </span>
    ))}
    {degraded && (
      <Tooltip title="Es sind mehr Objekte sichtbar als navigierbar erfasst werden; die Auswahl überspringt möglicherweise Objekte.">
        <span style={{ color: WARNING_COLOR }}>
          <FontAwesomeIcon icon={faTriangleExclamation} /> unvollständig
        </span>
      </Tooltip>
    )}
  </div>
);

export const FeatureKeyboardNav = ({
  config = {},
  libreMap,
  target,
}: AddonComponentProps<"featureKeyboardNav">) => {
  const {
    strategy = DEFAULT_STRATEGY,
    fanDeg = DEFAULT_FAN_DEG,
    minStepPx = DEFAULT_MIN_STEP_PX,
    crossLayer = DEFAULT_CROSS_LAYER,
    currentLayerBonus = DEFAULT_CURRENT_LAYER_BONUS,
    verifyWithRenderer = false,
    verifyMaxRetries = DEFAULT_VERIFY_MAX_RETRIES,
    edgeBehavior = DEFAULT_EDGE_BEHAVIOR,
    panStepFraction = DEFAULT_PAN_STEP_FRACTION,
    panDurationMs = DEFAULT_PAN_DURATION_MS,
    explain = DEFAULT_EXPLAIN,
    explainMs = DEFAULT_EXPLAIN_MS,
    autoActivateOnSelect = false,
    showControl = true,
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
    maxCandidates = DEFAULT_MAX_CANDIDATES,
    candidateDebounceMs = DEFAULT_CANDIDATE_DEBOUNCE_MS,
  } = config;

  const isToolShape = target !== null;
  const [mode, setMode] = useAddonState("featureNavigationMode");
  /**
   * Escape in a tool shape. The trigger that mounted the addon belongs to the
   * app's interaction state, which a library must not write, so leaving the
   * mode suspends navigation until the button is toggled off and on again.
   */
  const [suspended, setSuspended] = useState(false);
  const isActive = isToolShape ? !suspended : mode?.isOn ?? false;

  const { selectFeature, clearSelection, rawFeature, selectionVersion } =
    useMapSelection();
  const datasheet = useDatasheet();
  // "registered only when the host supplies one": without a DatasheetProvider
  // there is nothing to activate, and Enter stays unbound
  const hasActivateHandler = datasheet.isEnabled;

  // key on the content: route configs pass a fresh array per render
  const layerPatternKey = (config.layers ?? []).join("|");
  const layerPatterns = useMemo(
    () => (layerPatternKey ? layerPatternKey.split("|") : []),
    [layerPatternKey]
  );
  const scope = useNavScope(libreMap, target, layerPatterns);

  const { candidateSet, version } = useNavCandidates({
    map: libreMap,
    scope,
    enabled: isActive,
    maxCandidates,
    debounceMs: candidateDebounceMs,
  });

  const candidateSetRef = useRef<CandidateSet>(candidateSet);
  candidateSetRef.current = candidateSet;

  /** The feature steps are measured from, kept in a ref so a fast repeat of a
   *  key does not measure from the selection two steps ago. */
  const originFeatureRef = useRef<MapGeoJSONFeature | null>(null);
  useEffect(() => {
    originFeatureRef.current = rawFeature;
  }, [rawFeature, selectionVersion]);

  const [snapshot, setSnapshot] = useState<ExplainSnapshot | null>(null);
  const [faded, setFaded] = useState(false);
  const explainIdRef = useRef(0);

  const publishExplanation = useCallback(
    (map: MaplibreMap, explanation: PickExplanation) => {
      if (explain === "off") return;
      explainIdRef.current += 1;
      setFaded(false);
      setSnapshot(toExplainSnapshot(map, explanation, explainIdRef.current));
    },
    [explain]
  );

  useEffect(() => {
    if (explain !== "brief" || !snapshot) return;
    const fade = setTimeout(() => setFaded(true), explainMs);
    const clear = setTimeout(() => setSnapshot(null), explainMs + FADE_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(clear);
    };
    // a new decision replaces the picture and restarts both timers
  }, [snapshot, explain, explainMs]);

  useEffect(() => {
    if (isActive) return;
    setSnapshot(null);
  }, [isActive]);

  /** Resolved by the next settled candidate query, so an edge pan can be
   *  waited out before the retry looks again. */
  const settleRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    settleRef.current?.();
  }, [version]);

  const waitForCandidates = useCallback(
    () =>
      new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          settleRef.current = null;
          resolve();
        }, EDGE_PAN_SETTLE_TIMEOUT_MS);
        settleRef.current = () => {
          clearTimeout(timeout);
          settleRef.current = null;
          resolve();
        };
      }),
    []
  );

  /**
   * One direction keypress, from the origin to a published selection.
   *
   * The loop is the edge behaviour of 6.6: nothing in that direction eases the
   * viewport along the axis, waits for the candidate set to settle, and looks
   * once more. One retry, then it gives up.
   */
  const step = useCallback(
    async (direction: NavDirection): Promise<void> => {
      const map = libreMap;
      if (!map) return;

      const axis = NAV_AXES[direction];
      const constants = resolveNavConstants(config);
      const maxAttempts = edgeBehavior === "pan" ? 2 : 1;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const origin = resolveOrigin(map, originFeatureRef.current);
        if (!origin) return;

        const { candidates, byKey, degraded } = candidateSetRef.current;

        const projected = projectCandidates({
          map,
          candidates,
          origin: origin.point,
          axis,
          coneAngleDeg: constants.coneAngleDeg,
          excludeKey: origin.key,
        });

        const { explanation } = pickInDirection({
          origin: origin.point,
          axis,
          candidates: projected,
          constants,
          originIsArea: origin.isArea,
          currentLayerId: origin.layerId,
          strategy,
          crossLayer,
          currentLayerBonus,
          minStepPx,
          fanDeg,
          rayLengthPx: viewportDiagonalPx(map),
        });

        const winnerKey = verifyWithRenderer
          ? verifyWinner(map, explanation, verifyMaxRetries)
          : explanation.winnerKey;

        // the picture shows the selection that was actually made
        publishExplanation(map, { ...explanation, winnerKey });

        const winner: NavCandidate | undefined =
          winnerKey === undefined ? undefined : byKey.get(winnerKey);

        if (winner) {
          originFeatureRef.current = winner.feature;
          // through the application's normal selection path; navigation never
          // writes selection styling itself
          selectFeature(
            {
              source: winner.source,
              sourceLayer: winner.sourceLayer,
              id: winner.feature.id,
            },
            winner.feature
          );

          const evaluation = explanation.evaluations.find(
            (entry) => entry.key === winnerKey
          );
          if (evaluation) {
            keepInView(map, evaluation.nearestPointPx, panDurationMs);
          }

          if (degraded) {
            console.info(
              "[FEATURE_KEYBOARD_NAV] navigating a truncated candidate set",
              { candidates: candidates.length, maxCandidates }
            );
          }
          return;
        }

        if (attempt + 1 >= maxAttempts) return;
        const canvas = map.getCanvas();
        map.panBy(
          [
            axis.x * canvas.clientWidth * panStepFraction,
            axis.y * canvas.clientHeight * panStepFraction,
          ],
          { duration: panDurationMs }
        );
        await waitForCandidates();
      }
    },
    [
      libreMap,
      config,
      strategy,
      crossLayer,
      currentLayerBonus,
      minStepPx,
      fanDeg,
      verifyWithRenderer,
      verifyMaxRetries,
      edgeBehavior,
      panStepFraction,
      panDurationMs,
      maxCandidates,
      publishExplanation,
      selectFeature,
      waitForCandidates,
    ]
  );

  const endMode = useCallback(() => {
    clearSelection();
    originFeatureRef.current = null;
    setSnapshot(null);
    if (isToolShape) setSuspended(true);
    else setMode({ isOn: false, degraded: false });
  }, [clearSelection, isToolShape, setMode]);

  /** The action table, behind a ref so the key listener binds once per mode. */
  const runActionRef = useRef<(binding: NavKeyBinding) => void>(
    () => undefined
  );
  runActionRef.current = (binding) => {
    const map = libreMap;
    switch (binding.action) {
      case "step":
        if (binding.direction) {
          // a step spans an awaited edge pan, so it is a promise; a failing key
          // must stay a failing key and not an unhandled rejection
          step(binding.direction).catch((error: unknown) => {
            console.warn("[FEATURE_KEYBOARD_NAV] step failed", error);
          });
        }
        return;
      case "pan": {
        if (!map || !binding.direction) return;
        const axis = NAV_AXES[binding.direction];
        map.panBy([axis.x * SHIFT_PAN_PX, axis.y * SHIFT_PAN_PX], {
          duration: panDurationMs,
        });
        return;
      }
      case "exit":
        endMode();
        return;
      case "activate":
        datasheet.openDatasheet();
        return;
    }
  };

  useEffect(() => {
    if (!isActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const binding = resolveNavBinding(event, { hasActivateHandler });
      if (!binding) return;
      // the map's own handler is off, so nothing else would scroll the page
      event.preventDefault();
      runActionRef.current(binding);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isActive, hasActivateHandler]);

  /**
   * The map must not pan on the same arrow that steps. Its handler is disabled
   * for as long as the mode runs and restored on exit, so leaving navigation
   * never costs the user arrow-key panning permanently.
   */
  useEffect(() => {
    if (!libreMap || !isActive) return;
    const wasEnabled = libreMap.keyboard.isEnabled();
    libreMap.keyboard.disable();
    return () => {
      if (wasEnabled) libreMap.keyboard.enable();
    };
  }, [libreMap, isActive]);

  // opt-in: selecting a feature by click or from a list enters the mode
  useEffect(() => {
    if (!autoActivateOnSelect || isToolShape || !rawFeature) return;
    setMode((previous) =>
      previous?.isOn ? previous : { isOn: true, degraded: false }
    );
  }, [autoActivateOnSelect, isToolShape, rawFeature, setMode]);

  const degraded = isActive && candidateSet.degraded;

  // published so the host and other addons can see the mode and its health
  useEffect(() => {
    setMode((previous) =>
      previous?.isOn === isActive && previous.degraded === degraded
        ? previous
        : { isOn: isActive, degraded }
    );
  }, [isActive, degraded, setMode]);

  // route switch or trigger off: leave the map as it was found
  useEffect(
    () => () => {
      setMode({ isOn: false, degraded: false });
    },
    [setMode]
  );

  // the drawing follows the geometry, the readout is a caption and belongs with
  // the rest of the map chrome: bottom-center, clear of the gazetteer search box
  const overlay = (
    <>
      <ExplainOverlay map={libreMap} snapshot={snapshot} faded={faded} />
      {snapshot && (
        <Control position="bottomcenter" order={LEGEND_CONTROL_ORDER}>
          <ExplainLegend
            snapshot={snapshot}
            faded={faded}
            degraded={degraded}
          />
        </Control>
      )}
    </>
  );

  if (!libreMap) return null;

  if (isToolShape) {
    if (!isActive) return null;
    return (
      <>
        <NavHintChip
          degraded={degraded}
          hasActivateHandler={hasActivateHandler}
        />
        {overlay}
      </>
    );
  }

  if (!showControl) return overlay;

  return (
    <>
      <Control position={controlPosition} order={controlOrder}>
        <NavModeButton
          isOn={isActive}
          degraded={degraded}
          onClick={
            isActive ? endMode : () => setMode({ isOn: true, degraded: false })
          }
        />
      </Control>
      {overlay}
    </>
  );
};

export type { FeatureKeyboardNavConfig };
