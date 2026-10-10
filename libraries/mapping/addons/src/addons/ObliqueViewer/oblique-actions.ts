import { useCallback, useMemo } from "react";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import {
  OBLIQUE_STATE_DEFAULT,
  formatImageLabel,
  requestObliqueCommand,
  acknowledgeObliqueRequest,
  useAdHocObliqueDatasets,
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
  const adHocDatasets = useAdHocObliqueDatasets();
  const nextInterface =
    Boolean(useFeatureFlags().featureFlagObliqueNextUi) ||
    adHocDatasets.length > 0;
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
        // Local file identities and view state are session-only. Restoring a
        // persisted ad-hoc ID cannot restore its File handle after a reload.
        const adHocSession =
          next.enabledSeriesIds?.some((id) => id.startsWith("adhoc-avif-")) ||
          current.enabledSeriesIds?.some((id) => id.startsWith("adhoc-avif-"));
        if (
          !adHocSession &&
          next !== current &&
          (next.isOn !== current.isOn ||
            next.title !== current.title ||
            next.selectionStrategy !== current.selectionStrategy ||
            next.lastActiveSeriesId !== current.lastActiveSeriesId ||
            next.rotationSurface !== current.rotationSurface ||
            next.mapStyle3dEnabled !== current.mapStyle3dEnabled ||
            next.previewBasemapLabels !== current.previewBasemapLabels ||
            next.previewRotationDrape !== current.previewRotationDrape ||
            next.previewNavigationMode !== current.previewNavigationMode ||
            next.previewHoverDrape !== current.previewHoverDrape ||
            next.previewCenterDebug !== current.previewCenterDebug ||
            next.previewOpticalCenterDebug !==
              current.previewOpticalCenterDebug ||
            next.previewScreenCenterDebug !==
              current.previewScreenCenterDebug ||
            next.previewPoolDebug !== current.previewPoolDebug ||
            next.previewSeamless !== current.previewSeamless ||
            next.previewSeamlessMode !== current.previewSeamlessMode ||
            next.previewUprightOnlyWhenCovered !==
              current.previewUprightOnlyWhenCovered ||
            next.previewSeamlessCenterY !== current.previewSeamlessCenterY ||
            (next.enabledSeriesIds !== current.enabledSeriesIds &&
              !samePatch(current, { enabledSeriesIds: next.enabledSeriesIds })))
        )
          saveObliqueState(storageKey, next);
        return next;
      }),
    [setSessionState, storageKey, storedState, defaults]
  );

  return { state, setState };
};

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
        const normalized =
          patch.previewSeamless === true
            ? {
                ...patch,
                previewHoverDrape: false,
                previewRotationDrape: false,
              }
            : patch.previewHoverDrape === true ||
              patch.previewRotationDrape === true
            ? { ...patch, previewSeamless: false }
            : patch;
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
    (ids: string[]) => publish({ enabledSeriesIds: [...new Set(ids)] }),
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
