import { useCallback, useMemo } from "react";

import { useAddonState, useRouteAddons } from "../../lib/AddonStateContext";
import { BACKDROP_LOOK_BOUNDS, BACKDROP_LOOK_DEFAULT } from "./config";
import type { PreviewQualityChoice } from "./constants";
import {
  loadObliqueState,
  obliqueStateStorageKey,
  saveObliqueState,
} from "./oblique-storage";
import { strings } from "./strings.de";
import type { CardinalDirection, ObliqueBackdropLook } from "./types";
import { cardinalLetter } from "./utils/orientation";

/**
 * Everything about the oblique viewer, in one channel.
 *
 * The engine (`ObliqueViewer`) holds the map and the image data and writes
 * what it knows: loading, the selected image, the sector the camera looks
 * into, the siblings, whether the preview is up. The layer-bar row and the
 * ribbon sit in the host's tree, read the channel and write the user's
 * choices back: on/off, quality, the backdrop look. What the ribbon cannot
 * do itself, turning the camera or flying to an image, it asks for through
 * `request`, which the engine answers and clears.
 */

export type ObliqueRequest =
  | { seq: number; type: "rotate"; clockwise: boolean }
  | { seq: number; type: "rotateTo"; direction: CardinalDirection }
  | { seq: number; type: "sibling"; direction: CardinalDirection }
  | { seq: number; type: "flyToImage" }
  | { seq: number; type: "closePreview" };

export type ObliqueViewerState = {
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
  siblingIds: Partial<Record<CardinalDirection, string>>;
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
};

export const OBLIQUE_STATE_DEFAULT: ObliqueViewerState = {
  isOn: false,
  title: strings.title,
  panelOpen: false,
  isLoading: false,
  isAllDataReady: false,
  error: null,
  selectedImageId: null,
  selectedCameraId: null,
  activeDirection: null,
  siblingIds: {},
  previewVisible: false,
  isBusy: false,
  previewQuality: "standard",
  backdropLook: BACKDROP_LOOK_DEFAULT,
  downloadUrl: null,
  request: null,
};

/** defaults filled in and every knob clamped to its slider's bounds */
export const resolveBackdropLook = (
  look?: Partial<ObliqueBackdropLook>
): ObliqueBackdropLook => {
  const resolved: ObliqueBackdropLook = { ...BACKDROP_LOOK_DEFAULT };
  if (!look) return resolved;
  for (const key of Object.keys(BACKDROP_LOOK_BOUNDS) as (keyof ObliqueBackdropLook)[]) {
    const value = look[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      const [min, max] = BACKDROP_LOOK_BOUNDS[key];
      resolved[key] = Math.min(max, Math.max(min, value));
    }
  }
  return resolved;
};

const sameLook = (a: ObliqueBackdropLook, b: ObliqueBackdropLook): boolean =>
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

/**
 * The channel with its `localStorage` mirror in front of it, the way the
 * flood keeps its state: a viewer the user switched on is on again after a
 * reload, and the row the host restores finds it running.
 */
const useStoredObliqueState = () => {
  const [sessionState, setSessionState] = useAddonState("obliqueViewer");
  const addons = useRouteAddons();
  const storageKey = useMemo(() => obliqueStateStorageKey(addons), [addons]);
  const storedState = useMemo(() => loadObliqueState(storageKey), [storageKey]);
  const state = sessionState ?? storedState ?? OBLIQUE_STATE_DEFAULT;

  const setState = useCallback(
    (updater: (previous: ObliqueViewerState) => ObliqueViewerState) =>
      setSessionState((previous) => {
        const next = updater(
          previous ?? loadObliqueState(storageKey) ?? OBLIQUE_STATE_DEFAULT
        );
        saveObliqueState(storageKey, next);
        return next;
      }),
    [setSessionState, storageKey]
  );

  return { state, setState };
};

type Patch = Partial<Omit<ObliqueViewerState, "request">>;

const samePatch = (state: ObliqueViewerState, patch: Patch): boolean =>
  (Object.keys(patch) as (keyof Patch)[]).every((key) => {
    const next = patch[key];
    const previous = state[key];
    if (key === "backdropLook") {
      return sameLook(previous as ObliqueBackdropLook, next as ObliqueBackdropLook);
    }
    if (key === "siblingIds") {
      const a = previous as ObliqueViewerState["siblingIds"];
      const b = next as ObliqueViewerState["siblingIds"];
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      return [...keys].every(
        (k) => a[k as unknown as CardinalDirection] === b[k as unknown as CardinalDirection]
      );
    }
    return previous === next;
  });

/**
 * One entry point for every writer, so the row, the ribbon and the engine
 * cannot drift.
 */
export const useObliqueViewerActions = () => {
  const { state, setState } = useStoredObliqueState();

  /** several fields at once; a patch that changes nothing is dropped */
  const publish = useCallback(
    (patch: Patch) =>
      setState((previous) =>
        samePatch(previous, patch) ? previous : { ...previous, ...patch }
      ),
    [setState]
  );

  const setOn = useCallback(
    (next: boolean) =>
      setState((previous) =>
        previous.isOn === next
          ? previous
          : next
          ? { ...previous, isOn: true }
          : {
              ...previous,
              isOn: false,
              previewVisible: false,
              isBusy: false,
              request: null,
            }
      ),
    [setState]
  );

  const toggle = useCallback(() => setOn(!state.isOn), [setOn, state.isOn]);

  const setPanelOpen = useCallback(
    (next: boolean) => publish({ panelOpen: next }),
    [publish]
  );

  const setPreviewQuality = useCallback(
    (next: PreviewQualityChoice) => publish({ previewQuality: next }),
    [publish]
  );

  const setBackdropLook = useCallback(
    (patch: Partial<ObliqueBackdropLook>) =>
      setState((previous) => {
        const backdropLook = resolveBackdropLook({
          ...previous.backdropLook,
          ...patch,
        });
        return sameLook(previous.backdropLook, backdropLook)
          ? previous
          : { ...previous, backdropLook };
      }),
    [setState]
  );

  const resetLook = useCallback(
    () =>
      publish({
        backdropLook: BACKDROP_LOOK_DEFAULT,
        previewQuality: "standard",
      }),
    [publish]
  );

  /** the ribbon's commands; each gets a fresh sequence number */
  const sendRequest = useCallback(
    (command: Omit<ObliqueRequest, "seq">) =>
      setState((previous) => ({
        ...previous,
        request: {
          ...command,
          seq: (previous.request?.seq ?? 0) + 1,
        } as ObliqueRequest,
      })),
    [setState]
  );

  /** the engine took the command with this sequence number */
  const clearRequest = useCallback(
    (seq: number) =>
      setState((previous) =>
        previous.request?.seq === seq ? { ...previous, request: null } : previous
      ),
    [setState]
  );

  return {
    ...state,
    label: formatImageLabel(state.activeDirection, state.selectedImageId),
    publish,
    setOn,
    toggle,
    setPanelOpen,
    setPreviewQuality,
    setBackdropLook,
    resetLook,
    sendRequest,
    clearRequest,
  };
};
