import {
  createContext,
  createElement,
  useContext,
  type ReactNode,
} from "react";
import { BACKDROP_LOOK_BOUNDS, BACKDROP_LOOK_DEFAULT } from "../core/config";
import type { PreviewQualityChoice } from "../core/constants";
import type {
  CardinalDirection,
  ObliqueBackdropLook,
  ObliqueViewMode,
} from "../core/types";
import { cardinalLetter } from "../core/utils/orientation";
import { strings } from "./strings.de";

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
  | { type: "closePreview" };

/** a command with the sequence number that tells one request from the next */
export type ObliqueRequest = ObliqueCommand & { seq: number };

export type ViewerSeriesStatus = {
  id: string;
  label: string;
  enabled: boolean;
  isLoading: boolean;
  error: string | null;
  imageCount: number;
  availableCameraViews?: readonly string[];
};

export type ObliqueViewerState = {
  /** null uses each series default; [] deliberately disables every series. */
  enabledSeriesIds: string[] | null;
  series: ViewerSeriesStatus[];
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
  selectedCameraId: string | null;
  /** the sector the camera looks into, null until the map is tilted */
  activeDirection: CardinalDirection | null;
  /** the neighbours of the selected image, by the direction they lie in */
  canPan: boolean;
  /** the image is shown over the map, aligned with the camera */
  previewVisible: boolean;
  /** a flight or a turn is under way; the ribbon holds its buttons meanwhile */
  isBusy: boolean;
  previewQuality: PreviewQualityChoice;
  backdropLook: ObliqueBackdropLook;
  /** the selected image at download quality, for the ribbon's buttons */
  downloadUrl: string | null;
  /** the ribbon's last command for the engine; the engine clears it */
  request: ObliqueRequest | null;
  /** Monotonic across acknowledgements, so consecutive commands remain distinct. */
  requestSequence: number;
};

export const OBLIQUE_STATE_DEFAULT: ObliqueViewerState = {
  enabledSeriesIds: null,
  series: [],
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
  selectedCameraId: null,
  activeDirection: null,
  canPan: false,
  previewVisible: false,
  isBusy: false,
  previewQuality: "standard",
  backdropLook: BACKDROP_LOOK_DEFAULT,
  downloadUrl: null,
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
  setPreviewQuality: (next: PreviewQualityChoice) => void;
  setBackdropLook: (patch: Partial<ObliqueBackdropLook>) => void;
  resetLook: () => void;
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
