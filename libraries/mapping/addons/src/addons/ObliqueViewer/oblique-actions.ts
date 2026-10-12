import { useCallback, useMemo } from "react";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import {
  OBLIQUE_STATE_DEFAULT,
  formatImageLabel,
  normalizePreferredImagePitchDeg,
  requestObliqueCommand,
  acknowledgeObliqueRequest,
  type ObliqueViewerState,
  type ObliqueViewerActions,
  type ObliqueStatePatch,
  type ObliqueCommand,
} from "@carma-mapping/oblique-viewer";
import { useAddonState, useRouteAddons } from "../../lib/AddonStateContext";
import {
  loadObliqueState,
  obliqueStateStorageKey,
  saveObliqueState,
  persistentObliqueState,
} from "./oblique-storage";

const NG_DEFAULTS: ObliqueViewerState = {
  ...OBLIQUE_STATE_DEFAULT,
  previewHoverDrape: true,
  previewRotationDrape: true,
};

/**
 * The channel with its `localStorage` mirror in front of it, the way the
 * flood keeps its state: a viewer the user switched on is on again after a
 * reload, and the row the host restores finds it running.
 */
const useStoredObliqueState = () => {
  const [sessionState, setSessionState] = useAddonState("obliqueViewer");
  const addons = useRouteAddons();
  const nextInterface = Boolean(useFeatureFlags().featureFlagObliqueNextUi);
  const defaults = nextInterface ? NG_DEFAULTS : OBLIQUE_STATE_DEFAULT;
  const storageKey = useMemo(() => obliqueStateStorageKey(addons), [addons]);
  const storedState = useMemo(
    () => loadObliqueState(storageKey, defaults),
    [storageKey, defaults]
  );
  const state = sessionState ?? storedState ?? defaults;

  const setState = useCallback(
    (updater: (previous: ObliqueViewerState) => ObliqueViewerState) =>
      setSessionState((previous) => {
        const current = previous ?? storedState ?? defaults;
        const next = updater(current);
        if (next !== current && !samePersistentOptions(current, next)) {
          // Several hosts use this channel. Read the last durable state only
          // for actual option changes, so runtime publications neither write
          // storage nor reuse a stale per-hook snapshot.
          const localSession =
            next.enabledSeriesIds?.some((id) => id.startsWith("adhoc-avif-")) ||
            current.enabledSeriesIds?.some((id) =>
              id.startsWith("adhoc-avif-")
            );
          const durable = localSession
            ? loadObliqueState(storageKey, defaults) ?? defaults
            : defaults;
          const nextPersistent = persistentObliqueState(
            next,
            durable,
            localSession === true
          );
          const currentPersistent = persistentObliqueState(
            current,
            durable,
            localSession === true
          );
          if (!samePersistentOptions(currentPersistent, nextPersistent)) {
            saveObliqueState(storageKey, nextPersistent);
          }
        }
        return next;
      }),
    [setSessionState, storageKey, storedState, defaults]
  );

  return { state, setState };
};

const PERSISTENT_OPTION_KEYS = [
  "isOn",
  "title",
  "selectionStrategy",
  "lastActiveSeriesId",
  "rotationSurface",
  "mapStyle3dEnabled",
  "previewBasemapLabels",
  "previewRotationDrape",
  "previewGapFill",
  "previewNavigationMode",
  "previewHoverDrape",
  "previewCenterDebug",
  "previewBestImageDebug",
  "previewOpticalCenterDebug",
  "previewScreenCenterDebug",
  "previewPoolDebug",
  "previewSeamless",
  "previewSeamlessMode",
  "previewUprightOnlyWhenCovered",
  "previewSeamlessCenterY",
  "preferredImageSeriesDirection",
  "preferredImagePitchDeg",
  "enabledSeriesIds",
] as const satisfies readonly (keyof ObliqueViewerState)[];

const samePersistentOptions = (
  previous: ObliqueViewerState,
  next: ObliqueViewerState
): boolean =>
  PERSISTENT_OPTION_KEYS.every((key) =>
    key === "enabledSeriesIds"
      ? JSON.stringify(previous[key]) === JSON.stringify(next[key])
      : previous[key] === next[key]
  );

type Patch = ObliqueStatePatch;

const samePatch = (state: ObliqueViewerState, patch: Patch): boolean =>
  (Object.keys(patch) as (keyof Patch)[]).every((key) => {
    const next = patch[key];
    const previous = state[key];
    if (key === "enabledSeriesIds" || key === "series") {
      return JSON.stringify(previous) === JSON.stringify(next);
    }
    return previous === next;
  });

/**
 * One entry point for every writer, so the row, the ribbon and the engine
 * cannot drift.
 */
export const useObliqueViewerActions = (): ObliqueViewerActions => {
  const { state, setState } = useStoredObliqueState();

  /** several fields at once; a patch that changes nothing is dropped */
  const publish = useCallback(
    (patch: Patch) =>
      setState((previous) => {
        // A positive mode choice wins over the previous mode. A conflicting
        // patch gives seamless priority, matching legacy-state restoration.
        const pitchNormalizedPatch = Object.prototype.hasOwnProperty.call(
          patch,
          "preferredImagePitchDeg"
        )
          ? {
              ...patch,
              preferredImagePitchDeg: normalizePreferredImagePitchDeg(
                patch.preferredImagePitchDeg
              ),
            }
          : patch;
        const debugNormalizedPatch = Object.prototype.hasOwnProperty.call(
          pitchNormalizedPatch,
          "previewBestImageDebug"
        )
          ? {
              ...pitchNormalizedPatch,
              previewBestImageDebug:
                pitchNormalizedPatch.previewBestImageDebug === true,
            }
          : pitchNormalizedPatch;
        const normalized =
          debugNormalizedPatch.previewSeamless === true
            ? {
                ...debugNormalizedPatch,
                previewHoverDrape: false,
                previewRotationDrape: false,
              }
            : debugNormalizedPatch.previewHoverDrape === true ||
              debugNormalizedPatch.previewRotationDrape === true
            ? { ...debugNormalizedPatch, previewSeamless: false }
            : debugNormalizedPatch;
        return samePatch(previous, normalized)
          ? previous
          : { ...previous, ...normalized };
      }),
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
              isTargetImageLoading: false,
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

  const setEnabledSeriesIds = useCallback(
    (ids: string[]) => {
      const enabledSeriesIds = [...new Set(ids)];
      // Controlled selection must commit immediately; catalog work is asynchronous.
      publish({ enabledSeriesIds });
    },
    [publish]
  );

  /** the ribbon's commands; each gets a fresh sequence number */
  const sendRequest = useCallback(
    (command: ObliqueCommand) =>
      setState((previous) => requestObliqueCommand(previous, command)),
    [setState]
  );

  /** the engine took the command with this sequence number */
  const clearRequest = useCallback(
    (seq: number) =>
      setState((previous) => acknowledgeObliqueRequest(previous, seq)),
    [setState]
  );

  return {
    ...state,
    label: [
      state.series.find((entry) => entry.id === state.selectedSeriesId)?.label,
      formatImageLabel(
        state.activeDirection,
        state.selectedSourceImageId ?? state.selectedImageId
      ),
    ]
      .filter(Boolean)
      .join(" · "),
    publish,
    setOn,
    toggle,
    setPanelOpen,
    setEnabledSeriesIds,
    sendRequest,
    clearRequest,
  };
};
