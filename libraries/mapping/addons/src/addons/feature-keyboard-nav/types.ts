import type { Positions } from "@carma-mapping/map-controls-layout";

/**
 * Types of the keyboard navigation addon.
 *
 * Split off from the component so the picking core stays importable without
 * React or MapLibre: everything here is data.
 */

/** A point in screen pixels. `y` grows downwards, as on the canvas. */
export type ScreenPoint = { x: number; y: number };

/** The four screen directions the arrow keys map to. */
export type NavDirection = "up" | "down" | "left" | "right";

/** Unit axis per direction. Screen `y` grows downwards, so up is `(0, -1)`. */
export const NAV_AXES: Readonly<Record<NavDirection, ScreenPoint>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export type NavStrategy = "auto" | "first-crossed" | "nearest-in-cone";
export type NavStrategyUsed = "first-crossed" | "nearest-in-cone";
export type NavCrossLayer = "prefer-current" | "free" | "locked";
export type NavEdgeBehavior = "pan" | "stop";
export type NavExplainMode = "off" | "brief" | "hold";

/**
 * One config object for all three deployment shapes (global addon, workflow
 * tool, layer tool). Nothing here is shape-specific except `layers` and the
 * control fields, which the tool shapes ignore because their target already
 * defines the scope and their button already exists.
 */
export type FeatureKeyboardNavConfig = {
  /** Style layer patterns to navigate. Only honoured in the global shape; ignored when a target defines the scope. */
  layers?: string[];

  /** How strictly navigation follows the axis, 0 fuzzy to 1 strict. Derives coneAngleDeg and angleWeight. Default: 0.5 */
  sharpness?: number;
  /** Half angle of the acceptance cone in degrees, the θmax of the spec. Overrides sharpness. Default: derived, 60 */
  coneAngleDeg?: number;
  /** Off-axis penalty w. A candidate inside the cone wins once it is more than (1 + w) times closer. Overrides sharpness. Default: derived, 2.5 */
  angleWeight?: number;
  /** Exponent p on the normalised angle. 2 makes small deviations nearly free. Not driven by sharpness. Default: 1 */
  anglePower?: number;

  /** Picking strategy. "auto" uses first-crossed for polygon origins and the cone otherwise. Default: "auto" */
  strategy?: NavStrategy;
  /** Half angle of the three-ray fan for first-crossed, in degrees. Default: 8 */
  fanDeg?: number;
  /** Candidates nearer than this are ignored, so co-located features cannot trap the cursor. Default: 2 */
  minStepPx?: number;

  /** What happens when another layer in scope offers a better candidate. Default: "prefer-current" */
  crossLayer?: NavCrossLayer;
  /** Cost multiplier for candidates in the current layer under "prefer-current". Default: 0.6 */
  currentLayerBonus?: number;

  /** Confirm the winner against what is actually drawn. Default: false */
  verifyWithRenderer?: boolean;
  /** Next-best retries when that confirmation fails. Default: 3 */
  verifyMaxRetries?: number;

  /** Behaviour when nothing lies in the pressed direction. Default: "pan" */
  edgeBehavior?: NavEdgeBehavior;
  /** Share of the viewport panned per edge step. Default: 0.5 */
  panStepFraction?: number;
  /** Duration of keep-in-view and edge pans, in ms. Default: 300 */
  panDurationMs?: number;

  /** Helper geometry overlay. Default: "brief" */
  explain?: NavExplainMode;
  /** Fade delay for "brief", in ms. Default: 1200 */
  explainMs?: number;
  /**
   * Mark the interior point of the selected feature with a blue dot: the point
   * navigation measures from, which is what makes a surprising step readable.
   * Under `first-crossed` a parcel whose interior point falls inside the
   * building standing on it will cross that building's wall before its own
   * border, and the dot is where that becomes visible.
   *
   * Shown for the selected feature only, from a click as well as from an arrow
   * key, and only while something is selected. One dot per visible shape was
   * what this used to draw, and a viewport of ALKIS parcels then re-projected
   * thousands of them on every map frame. Needs `explain` on. Default: false
   */
  showOrigins?: boolean;
  /**
   * Fill colour of that dot, as any CSS colour. Defaults to the blue the
   * selection itself is drawn in, since it marks the selection. Default:
   * "#1677ff"
   */
  originDotColor?: string;
  /** Opacity of the dot layer, 0 to 1. Default: 1 */
  originDotOpacity?: number;

  /** Enter navigation mode as soon as a feature is selected. Default: false */
  autoActivateOnSelect?: boolean;
  /** Render the mode toggle in the control column. Only relevant in the global shape. Default: true */
  showControl?: boolean;
  /** Corner and sort order of that toggle. */
  controlPosition?: Positions;
  controlOrder?: number;

  /** Upper bound on the candidate set; hitting it raises the degraded state. Default: 4000 */
  maxCandidates?: number;
  /** Debounce after the map settles before the candidate set is rebuilt, in ms. Default: 200 */
  candidateDebounceMs?: number;
};

/** Why a candidate never reached the cost comparison. */
export type CandidateRejection =
  | "outside-cone"
  | "behind-origin"
  | "too-close"
  | "out-of-scope";

export type CandidateEvaluation = {
  key: string;
  nearestPointPx: ScreenPoint;
  distancePx: number;
  angleDeg: number;
  cost: number;
  rejectedBecause?: CandidateRejection;
};

export type PickExplanation = {
  originPx: ScreenPoint;
  axis: ScreenPoint;
  strategyUsed: NavStrategyUsed;
  /** the resolved constants, so the overlay can show what was actually in force */
  coneAngleDeg: number;
  angleWeight: number;
  anglePower: number;
  rays?: Array<{ angleDeg: number; crossingPx?: ScreenPoint }>;
  evaluations: CandidateEvaluation[];
  winnerKey?: string;
};

/**
 * A candidate as the picking core sees it: an outline in screen pixels and the
 * two labels the policies need. No feature, no map, no geographic coordinates —
 * that is what makes the core testable with fixed numbers.
 */
export type ProjectedCandidate = {
  key: string;
  /** catalog layer the feature belongs to, for the cross-layer policy */
  layerId?: string;
  /** rings are closed and enclose an area; lines and points are open outlines */
  isArea: boolean;
  /** every ring, line or point of the feature, in screen pixels */
  parts: ScreenPoint[][];
};

/** The three constants of the cost function, after `sharpness` and overrides. */
export type ResolvedNavConstants = {
  coneAngleDeg: number;
  angleWeight: number;
  anglePower: number;
};

export type PickInput = {
  origin: ScreenPoint;
  /** unit vector of the pressed direction, in screen space */
  axis: ScreenPoint;
  candidates: ProjectedCandidate[];
  constants: ResolvedNavConstants;
  /** the origin feature's own geometry is an area, which selects `first-crossed` under "auto" */
  originIsArea: boolean;
  /** catalog layer of the origin feature, for the cross-layer policy */
  currentLayerId?: string;
  strategy: NavStrategy;
  crossLayer: NavCrossLayer;
  currentLayerBonus: number;
  minStepPx: number;
  fanDeg: number;
  /** how far the rays of `first-crossed` reach; the viewport diagonal in practice */
  rayLengthPx: number;
};

export type PickResult = {
  winnerKey?: string;
  explanation: PickExplanation;
};
