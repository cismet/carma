import {
  createContext,
  createElement,
  useContext,
  type ReactNode,
} from "react";
import type { Degrees } from "@carma-units";

import { BACKDROP_LOOK_BOUNDS, BACKDROP_LOOK_DEFAULT } from "../core/config";
import type {
  CardinalDirection,
  ObliqueBackdropLook,
  ObliqueViewMode,
  ObliqueViewQuery,
} from "../core/types";
import { cardinalLetter } from "../core/utils/orientation";
import { strings } from "./strings.de";
import type { ObliqueDownloadOptions } from "./utils/imageUrls";

/** what the ribbon can ask the engine to do */
export type ObliqueCommand =
  /** Continuous true-north bearing; optional pitch is measured from nadir. */
  | { type: "orbit"; bearingDeg: number; pitchDeg?: number }
  | { type: "setViewMode"; mode: ObliqueViewMode }
  | { type: "rotate"; clockwise: boolean }
  | { type: "rotateTo"; direction: CardinalDirection }
  /** Positive horizontal moves right; positive vertical moves forward on the ground. */
  | { type: "pan"; horizontal: number; vertical: number }
  | { type: "flyToImage" }
  /** Finish preview camera cleanup before the host moves or changes engines. */
  | { type: "leavePreviewForNavigation"; onComplete: () => void }
  | { type: "closePreview" };

/** a command with the sequence number that tells one request from the next */
export type ObliqueRequest = ObliqueCommand & { seq: number };

export type ViewerSeriesStatus = {
  id: string;
  label: string;
  shortLabel?: string;
  enabled: boolean;
  isLoading: boolean;
  error: string | null;
  imageCount: number;
  acquisitionMonth?: number;
  acquisitionYear?: number;
  availableCameraViews?: readonly string[];
};

export const OBLIQUE_NAVIGATION_KEYS = {
  Left: "left",
  Right: "right",
  Up: "up",
  Down: "down",
  RotateLeft: "rotateLeft",
  RotateRight: "rotateRight",
} as const;
export type ObliqueNavigationKey =
  (typeof OBLIQUE_NAVIGATION_KEYS)[keyof typeof OBLIQUE_NAVIGATION_KEYS];

export type ObliqueNavigationTargets = {
  imageId: string;
  images: Record<ObliqueNavigationKey, string | null>;
  cardinalImages?: Record<CardinalDirection, string | null>;
};

export type ObliqueViewerState = {
  /** null uses each series default; [] deliberately disables every series. */
  enabledSeriesIds: string[] | null;
  series: ViewerSeriesStatus[];
  /** Persisted selection policy; both interfaces share the same calibrated catalogs. */
  selectionStrategy: NonNullable<ObliqueViewQuery["selectionStrategy"]>;
  viewMode: ObliqueViewMode;
  selectedSeriesId: string | null;
  selectedSourceImageId: string | null;
  /** whether the viewer runs; the row exists exactly while it does */
  isOn: boolean;
  title: string;
  /** whether the host shows the ribbon; the row's icon is blue then */
  panelOpen: boolean;
  /** the dataset is being fetched or indexed */
  isLoading: boolean;
  isAllDataReady: boolean;
  error: string | null;
  /** the image nearest the map centre in the current sector, or the one flown to */
  selectedImageId: string | null;
  /** Qualified selected photo with an evidenced, currently cached missing preview. */
  missingPreviewImageId: string | null;
  selectedCameraId: string | null;
  selectedImageBearingDeg: Degrees | null;
  /** the sector the camera looks into, null until the map is tilted */
  activeDirection: CardinalDirection | null;
  /** Current viewport angles, rounded to degrees; bearing is clockwise from north. */
  bearingDeg: Degrees | null;
  pitchDeg: Degrees | null;
  /** the neighbours of the selected image, by the direction they lie in */
  canPan: boolean;
  /** Geometry-only targets; media readiness never controls these buttons. */
  navigationTargets: ObliqueNavigationTargets | null;
  /** Capability, not current pointer presence; touch retains the flight button. */
  hoverAvailable: boolean;
  /** the image is shown over the map, aligned with the camera */
  previewVisible: boolean;
  /** Flight status; prepared geometric navigation remains interactive. */
  isBusy: boolean;
  /** the selected image at download quality, for the ribbon's buttons */
  downloadUrl: string | null;
  /** Native geometry and publisher watermark for downloadable TIFF originals. */
  downloadOptions: ObliqueDownloadOptions | null;
  /** the ribbon's last command for the engine; the engine clears it */
  request: ObliqueRequest | null;
  /** Monotonic across acknowledgements, so consecutive commands remain distinct. */
  requestSequence: number;
};

export const OBLIQUE_STATE_DEFAULT: ObliqueViewerState = {
  enabledSeriesIds: null,
  series: [],
  selectionStrategy: "nearest-axis",
  viewMode: "oblique",
  selectedSeriesId: null,
  selectedSourceImageId: null,
  isOn: false,
  title: strings.title,
  panelOpen: false,
  isLoading: false,
  isAllDataReady: false,
  error: null,
  selectedImageId: null,
  missingPreviewImageId: null,
  selectedCameraId: null,
  selectedImageBearingDeg: null,
  activeDirection: null,
  bearingDeg: null,
  pitchDeg: null,
  canPan: false,
  navigationTargets: null,
  hoverAvailable: false,
  previewVisible: false,
  isBusy: false,
  downloadUrl: null,
  downloadOptions: null,
  request: null,
  requestSequence: 0,
};

/** defaults filled in and every knob clamped to its slider's bounds */
export const resolveBackdropLook = (
  look?: Partial<ObliqueBackdropLook>
): ObliqueBackdropLook => {
  const resolved: ObliqueBackdropLook = { ...BACKDROP_LOOK_DEFAULT };
  if (!look) return resolved;
  for (const key of Object.keys(
    BACKDROP_LOOK_BOUNDS
  ) as (keyof ObliqueBackdropLook)[]) {
    const value = look[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      const [min, max] = BACKDROP_LOOK_BOUNDS[key];
      resolved[key] = Math.min(max, Math.max(min, value));
    }
  }
  return resolved;
};

export const sameBackdropLook = (
  a: ObliqueBackdropLook,
  b: ObliqueBackdropLook
): boolean =>
  a.brightness === b.brightness &&
  a.contrast === b.contrast &&
  a.saturation === b.saturation;

/** "N · 12_034_1700123", what the row and the ribbon call the selected image */
export const formatImageLabel = (
  direction: CardinalDirection | null,
  imageId: string | null
): string => {
  if (!imageId) return "…";
  const letter = direction === null ? "" : `${cardinalLetter(direction)} · `;
  return `${letter}${imageId}`;
};

export type ObliqueStatePatch = Partial<Omit<ObliqueViewerState, "request">>;

/** Host-owned channel; the feature has no dependency on an addon registry. */
export type ObliqueViewerActions = ObliqueViewerState & {
  label: string;
  publish: (patch: ObliqueStatePatch) => void;
  setOn: (next: boolean) => void;
  toggle: () => void;
  setPanelOpen: (next: boolean) => void;
  setEnabledSeriesIds: (ids: string[]) => void;
  sendRequest: (command: ObliqueCommand) => void;
  clearRequest: (seq: number) => void;
};

const ActionsContext = createContext<ObliqueViewerActions | null>(null);

export const ObliqueViewerActionsProvider = ({
  actions,
  children,
}: {
  actions: ObliqueViewerActions;
  children: ReactNode;
}) => createElement(ActionsContext.Provider, { value: actions }, children);

export const useObliqueViewerActions = (): ObliqueViewerActions => {
  const actions = useContext(ActionsContext);
  if (!actions)
    throw new Error("Oblique viewer requires its host actions provider");
  return actions;
};

/** Acknowledging a command must never reset the sequence of the next command. */
export const requestObliqueCommand = (
  state: ObliqueViewerState,
  command: ObliqueCommand
): ObliqueViewerState => {
  const seq = state.requestSequence + 1;
  return { ...state, requestSequence: seq, request: { ...command, seq } };
};

export const acknowledgeObliqueRequest = (
  state: ObliqueViewerState,
  seq: number
): ObliqueViewerState =>
  state.request?.seq === seq ? { ...state, request: null } : state;
