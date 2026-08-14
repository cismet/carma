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
  DEFAULT_CENTER_RAY_BONUS,
  DEFAULT_EDGE_BEHAVIOR,
  DEFAULT_EXPLAIN,
  DEFAULT_EXPLAIN_MS,
  DEFAULT_FAN_DEG,
  DEFAULT_MAX_CANDIDATES,
  DEFAULT_MIN_STEP_PX,
  DEFAULT_ORIGIN_DOT_OPACITY,
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
  FeatureOriginDots,
  toExplainSnapshot,
  type ExplainSnapshot,
  type OriginDot,
} from "./feature-keyboard-nav/ExplainOverlay";
import { chordMidpoint } from "./feature-keyboard-nav/geometry";
import {
  isTypingTarget,
  navHintRows,
  resolveNavBinding,
  type NavKeyBinding,
} from "./feature-keyboard-nav/keymap";
import {
  interiorPointOf,
  isAreaGeometry,
  originCandidatesOf,
  type OriginStrategy,
} from "./feature-keyboard-nav/origin";
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
/**
 * One colour per way of placing the origin, so all of them can be read at once
 * while the strategy is still being chosen by hand. A filled dot is usable, a
 * hollow one fell outside the feature and is why the pole is used instead.
 */
const ORIGIN_COLORS: Readonly<Record<OriginStrategy | "arrival", string>> = {
  /** where a walk entered the feature */
  arrival: "#e8323c",
  /** furthest from any edge */
  pole: "#1677ff",
  /** half way along the shape */
  spine: "#13a10e",
  /** the area centroid */
  centroid: "#b37feb",
};
const FADE_MS = 400;
/** half-size of the box `verifyWithRenderer` asks about, in pixels */
const VERIFY_PROBE_PX = 3;

/** the direction that undoes a step */
const OPPOSITE_DIRECTION: Readonly<Record<NavDirection, NavDirection>> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};
/** features the path remembers; older ones are dropped from the far end */
const MAX_NAV_TRAIL = 100;

/** One visited feature, with the direction that led into it. */
type NavPathEntry = {
  /** the feature as queried, so re-selecting it needs no new query */
  feature: MapGeoJSONFeature;
  /** `undefined` on the feature the walk started from */
  direction?: NavDirection;
};

/**
 * The walk as a path with a position on it, rather than a stack.
 *
 * A stack only replays backwards: stepping back pops the entry, which throws
 * the way forward away, so up-up-up-down-down-up runs the picker again for that
 * last up although the answer was known. With a cursor, both directions replay
 * — back while the pressed key undoes the step that led here, forward while it
 * repeats the step that was taken from here — and only a step that leaves the
 * remembered path asks the picker. Stepping off the middle of the path drops
 * what lay ahead, the way an edit after an undo does.
 */
type NavPath = { entries: NavPathEntry[]; cursor: number };

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
  feature: MapGeoJSONFeature | null,
  candidates: CandidateSet,
  arrivals: Map<string, [number, number]>,
  strategy: OriginStrategy,
  mode: "dynamic" | "static"
): NavOrigin | undefined => {
  if (feature) {
    const key = candidateKeyOf(feature);
    // where the walk actually entered this feature, when it was walked into:
    // the middle of the stretch the step's ray spent inside it. Closer to what
    // the user is looking at than the pole, which on a long street can sit far
    // down the road and send the next step off from there
    const arrival = mode === "static" || !key ? undefined : arrivals.get(key);
    // the candidate holds every tile piece of this feature merged into one
    // geometry; `feature.geometry` is whichever piece the query returned first,
    // and on a feature that spans tiles its interior point is not the feature's
    const merged = key ? candidates.byKey.get(key)?.geometry : undefined;
    const interior =
      arrival ?? interiorPointOf(merged ?? feature.geometry, strategy);
    if (interior) {
      const projected = map.project([interior[0], interior[1]]);
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
    centerRayBonus = DEFAULT_CENTER_RAY_BONUS,
    verifyWithRenderer = false,
    verifyMaxRetries = DEFAULT_VERIFY_MAX_RETRIES,
    edgeBehavior = DEFAULT_EDGE_BEHAVIOR,
    panStepFraction = DEFAULT_PAN_STEP_FRACTION,
    panDurationMs = DEFAULT_PAN_DURATION_MS,
    explain = DEFAULT_EXPLAIN,
    explainMs = DEFAULT_EXPLAIN_MS,
    showOrigins = false,
    originDotOpacity = DEFAULT_ORIGIN_DOT_OPACITY,
    originStrategy = "pole",
    originMode = "dynamic",
    autoActivateOnSelect = false,
    startActive = false,
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
  /**
   * `startActive` is what the channel falls back to, not something written into
   * it on mount. The addon state provider drops every channel when its scope
   * identity changes, and a route rebuilding its `addons` array on a render is
   * exactly that, so a value written once is lost again. Read as a fallback the
   * mode is on from the first render and survives every reset, while switching
   * off by hand stores `isOn: false`, a value, which wins over the fallback.
   */
  const isActive = isToolShape ? !suspended : mode?.isOn ?? startActive;

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

  /**
   * The key the last step published, so the selection it causes can be told
   * apart from one the user made.
   *
   * Held until a different feature is selected rather than consumed on arrival.
   * A host may republish the addon's own selection: the geoportal builds its
   * infobox feature from what the addon selected and pushes that back into the
   * selection context, so the same key arrives a second time. Consuming the
   * claim made that echo look hand-made, which erased the picture a keypress
   * had just drawn and dropped the walk with it. The price is that re-selecting
   * the already selected feature by hand no longer clears anything, which is
   * fine: the picture still describes the selection on screen.
   */
  const navSelectedKeyRef = useRef<string | undefined>(undefined);

  /**
   * The features walked so far, and where on that path the walk stands.
   *
   * Up and then down has to land on the feature it started from, and picking
   * cannot guarantee that: the reverse step measures from a different origin
   * through a different cone, so a neighbour that came second on the way out
   * can win on the way back. Replaying the path makes the return exact rather
   * than merely likely, and it is also the cheaper path, since it projects no
   * candidates at all.
   */
  const pathRef = useRef<NavPath>({ entries: [], cursor: -1 });

  /**
   * Where a step entered each feature it walked into, in lng/lat.
   *
   * Kept per feature rather than for the selection alone, so walking back along
   * the trail returns to the same origin the walk had there. Cleared whenever
   * the walk itself is dropped: a hand-made selection or leaving the mode.
   */
  const arrivalsRef = useRef(new Map<string, [number, number]>());
  /** the key whose arrival origin is currently drawn, for the dot's colour */
  const [arrivalKey, setArrivalKey] = useState<string | undefined>(undefined);

  /**
   * A selection the addon did not make erases the picture at once.
   *
   * The explanation describes one step: which candidates were considered, from
   * where, and why one of them won. The moment the user picks a feature by
   * hand, it describes a decision that no longer led to what is selected, and a
   * held picture (`explain: "hold"`) would otherwise stay on screen indefinitely
   * next to the wrong feature.
   *
   * The trail goes with it: the walk it recorded started somewhere the user has
   * now left, so stepping back into it would jump across the map.
   */
  useEffect(() => {
    const selectedKey = rawFeature ? candidateKeyOf(rawFeature) : undefined;
    if (selectedKey !== undefined && selectedKey === navSelectedKeyRef.current) {
      return;
    }
    navSelectedKeyRef.current = undefined;
    pathRef.current = { entries: [], cursor: -1 };
    arrivalsRef.current.clear();
    setArrivalKey(undefined);
    setSnapshot(null);
    setFaded(false);
  }, [rawFeature, selectionVersion]);

  const publishExplanation = useCallback(
    (map: MaplibreMap, explanation: PickExplanation) => {
      if (explain === "off") return;
      explainIdRef.current += 1;
      setFaded(false);
      setSnapshot(toExplainSnapshot(map, explanation, explainIdRef.current));
    },
    [explain]
  );

  /**
   * The interior point drawn while the mode runs: the one of the selected
   * feature, whether the selection came from a click or from an arrow key.
   *
   * One dot, not one per visible shape. The dots are re-projected on every map
   * frame, and a viewport of ALKIS parcels holds thousands of them, so drawing
   * the whole candidate set stalled the main thread while panning. The point
   * that explains a step is the origin the step measured from; the others were
   * never the question.
   *
   * Not part of the keypress snapshot: it describes the selection as it stands,
   * so it survives every pan rather than fading with the last arrow.
   */
  const featureOrigins = useMemo(
    () => {
      if (!showOrigins || explain === "off" || !rawFeature) return [];
      // the merged geometry, for the same reason `resolveOrigin` uses it: the
      // dot has to mark the point a step actually measures from
      const key = candidateKeyOf(rawFeature);
      const arrival =
        originMode === "static" || !key
          ? undefined
          : arrivalsRef.current.get(key);
      const merged = key ? candidateSet.byKey.get(key)?.geometry : undefined;
      const geometry = merged ?? rawFeature.geometry;

      // every strategy at once, so they can be compared on real features while
      // the choice is still being made. The one in force is drawn larger
      const candidates = originCandidatesOf(geometry);
      const dots: OriginDot[] = (
        ["pole", "spine", "centroid"] as const
      ).flatMap((name) => {
        const candidate = candidates[name];
        if (!candidate) return [];
        // a strategy that fell outside is drawn hollow and never counts as the
        // one in force, since the origin then falls back to the pole
        const usable = candidate.inside;
        const inForce =
          !arrival &&
          (originStrategy === name ||
            (name === "pole" && !candidates[originStrategy]?.inside));
        return [
          {
            lngLat: candidate.point,
            color: ORIGIN_COLORS[name],
            filled: usable,
            active: inForce,
          },
        ];
      });

      if (arrival) {
        dots.push({
          lngLat: arrival,
          color: ORIGIN_COLORS.arrival,
          filled: true,
          active: true,
        });
      }

      if (dots.length > 0) return dots;

      // points and lines have no strategy to compare
      const origin = interiorPointOf(geometry, originStrategy);
      return origin
        ? [{ lngLat: origin, color: ORIGIN_COLORS.pole, active: true }]
        : [];
    },
    // `selectionVersion` stands for a reselection of the same feature object,
    // `arrivalKey` for a fresh arrival point written into the ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      showOrigins,
      explain,
      rawFeature,
      selectionVersion,
      candidateSet,
      arrivalKey,
      originStrategy,
      originMode,
    ]
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
    pathRef.current = { entries: [], cursor: -1 };
    arrivalsRef.current.clear();
    setArrivalKey(undefined);
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

      /**
       * Replaying the path, in either direction.
       *
       * Backwards while the pressed key undoes the step that led to where the
       * walk stands, forwards while it repeats the step that was taken from
       * there. Either way the feature is already known, so nothing is projected
       * and nothing is picked, and the walk returns exactly where it was.
       */
      const path = pathRef.current;
      const here = path.entries[path.cursor];
      const ahead = path.entries[path.cursor + 1];
      const goesBack =
        path.cursor > 0 &&
        here?.direction !== undefined &&
        direction === OPPOSITE_DIRECTION[here.direction];
      const goesForward = !goesBack && ahead?.direction === direction;

      if (goesBack || goesForward) {
        path.cursor += goesBack ? -1 : 1;
        const remembered = path.entries[path.cursor].feature;
        originFeatureRef.current = remembered;
        navSelectedKeyRef.current = candidateKeyOf(remembered);
        // replaying is not a decision, so it leaves no picture behind
        setSnapshot(null);
        selectFeature(
          {
            source: remembered.source,
            sourceLayer: remembered.sourceLayer,
            id: remembered.id,
          },
          remembered
        );
        const restored = resolveOrigin(
          map,
          remembered,
          candidateSetRef.current,
          arrivalsRef.current,
          originStrategy,
          originMode
        );
        if (restored) keepInView(map, restored.point, panDurationMs);
        return;
      }

      const axis = NAV_AXES[direction];
      const constants = resolveNavConstants(config);
      const maxAttempts = edgeBehavior === "pan" ? 2 : 1;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidateSetNow = candidateSetRef.current;
        const origin = resolveOrigin(
          map,
          originFeatureRef.current,
          candidateSetNow,
          arrivalsRef.current,
          originStrategy,
          originMode
        );
        if (!origin) return;

        const { candidates, byKey, degraded } = candidateSetNow;

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
          centerRayBonus,
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
          // half the stretch the axis ray spends inside the feature it just
          // entered, which is where the walk arrived rather than where the
          // feature happens to be widest
          const winnerOutline =
            originMode === "static"
              ? undefined
              : projected.find((entry) => entry.key === winnerKey);
          const arrival = winnerOutline
            ? chordMidpoint(
                origin.point,
                axis,
                winnerOutline,
                viewportDiagonalPx(map)
              )
            : undefined;
          if (arrival && winnerKey) {
            const lngLat = map.unproject([arrival.x, arrival.y]);
            arrivalsRef.current.set(winnerKey, [lngLat.lng, lngLat.lat]);
            setArrivalKey(winnerKey);
          } else if (winnerKey) {
            arrivalsRef.current.delete(winnerKey);
            setArrivalKey(undefined);
          }

          const cameFrom = originFeatureRef.current;
          // the walk started somewhere: seed the path with that feature so the
          // first step can be undone. A bootstrap step has none, since it
          // started from the middle of the screen
          if (path.entries.length === 0 && cameFrom) {
            path.entries.push({ feature: cameFrom });
            path.cursor = 0;
          }
          // a step off the middle of the path drops what lay ahead of it, the
          // way an edit after an undo does
          path.entries.length = path.cursor + 1;
          path.entries.push({ feature: winner.feature, direction });
          if (path.entries.length > MAX_NAV_TRAIL) path.entries.shift();
          path.cursor = path.entries.length - 1;

          originFeatureRef.current = winner.feature;
          // claims the selection about to arrive, so the picture just published
          // survives it while a hand-made selection still wipes it
          navSelectedKeyRef.current = winnerKey;
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
      originStrategy,
      originMode,
      crossLayer,
      currentLayerBonus,
      centerRayBonus,
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

  /** A step is running; further step keys are dropped until it finishes. */
  const steppingRef = useRef(false);

  /** The action table, behind a ref so the key listener binds once per mode. */
  const runActionRef = useRef<(binding: NavKeyBinding) => void>(
    () => undefined
  );
  runActionRef.current = (binding) => {
    const map = libreMap;
    switch (binding.action) {
      case "step":
        if (binding.direction) {
          // One step at a time. A held arrow repeats at the OS rate, and a step
          // spans an awaited edge pan, so without this every repeat started
          // another one: the steps overlapped, each measuring from a selection
          // its predecessor had already replaced, and the selection ran behind
          // the key by as much as a second. Dropped rather than queued, since a
          // queue would keep moving after the key is released.
          if (steppingRef.current) return;
          steppingRef.current = true;
          // a step spans an awaited edge pan, so it is a promise; a failing key
          // must stay a failing key and not an unhandled rejection
          step(binding.direction)
            .catch((error: unknown) => {
              console.warn("[FEATURE_KEYBOARD_NAV] step failed", error);
            })
            .finally(() => {
              steppingRef.current = false;
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
      {/* on while the mode is, independent of any keypress */}
      {isActive && (
        <FeatureOriginDots
          map={libreMap}
          origins={featureOrigins}
          opacity={originDotOpacity}
        />
      )}
      <ExplainOverlay map={libreMap} snapshot={snapshot} faded={faded} />
      {/* the readout belongs to the mode, not to a keypress: on for as long as
          the mode runs with `explain` on, and gone entirely when it is off */}
      {isActive && explain !== "off" && (
        <Control position="bottomcenter" order={LEGEND_CONTROL_ORDER}>
          <ExplainLegend
            snapshot={snapshot}
            faded={faded}
            degraded={degraded}
            strategy={strategy}
            constants={resolveNavConstants(config)}
            candidateCount={candidateSet.candidates.length}
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
