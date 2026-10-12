import { useEffect, useMemo, useRef, useState } from "react";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import {
  defaultStateKeyToHashParamValueCodecMap,
  useHashState,
} from "@carma-providers/hash-state";
import type { Degrees } from "@carma-units";
import {
  parseObliquePreviewHash,
  obliquePreviewHashParams,
} from "./preview-state-hash";

import {
  useAdHocObliqueDatasets,
  ObliqueViewer as FeatureViewer,
  ObliquePanel as FeaturePanel,
  ObliqueViewerActionsProvider,
  type ObliquePreviewState,
} from "@carma-mapping/oblique-viewer";
import type { AddonComponentProps } from "../../lib/registry";
import { useAddonState } from "../../lib/AddonStateContext";
import { useObliqueViewerActions } from "./oblique-actions";

const useObliqueExtensions = (nextInterface: boolean) => {
  const [objectViews] = useAddonState("obliqueObjectViews");
  return useMemo(
    () =>
      nextInterface && objectViews?.extension ? [objectViews.extension] : [],
    [nextInterface, objectViews?.extension]
  );
};

export const ObliqueViewer = (props: AddonComponentProps<"obliqueViewer">) => {
  const actions = useObliqueViewerActions();
  const adHocDatasets = useAdHocObliqueDatasets();
  const nextInterface = Boolean(useFeatureFlags().featureFlagObliqueNextUi);
  const extensions = useObliqueExtensions(nextInterface);
  const { getHashParams, getInitialHashParams, updateHashState } =
    useHashState();
  const [initialHash] = useState(() =>
    actions.isOn ? getInitialHashParams() : getHashParams()
  );
  const initialView = useMemo(() => {
    const bearing = defaultStateKeyToHashParamValueCodecMap.bearing.decode(
      initialHash.b ?? initialHash.bearing
    );
    const pitch = defaultStateKeyToHashParamValueCodecMap.pitch.decode(
      initialHash.p ?? initialHash.pitch
    );
    return {
      bearingDeg:
        typeof bearing === "number" && Number.isFinite(bearing)
          ? (bearing as Degrees)
          : undefined,
      pitchDeg:
        typeof pitch === "number" &&
        Number.isFinite(pitch) &&
        pitch >= 0 &&
        pitch < 90
          ? (pitch as Degrees)
          : undefined,
    };
  }, [initialHash]);
  const initial = useMemo(() => {
    const preview = parseObliquePreviewHash(initialHash);
    return preview?.seriesId.startsWith("adhoc-avif-") ? null : preview;
  }, [initialHash]);
  const prioritySeriesId =
    initialHash.obs &&
    initialHash.obs.length <= 256 &&
    !initialHash.obs.startsWith("adhoc-avif-")
      ? initialHash.obs
      : undefined;
  const viewerConfig = useMemo(
    () => ({
      ...props.config,
      series: [
        ...(props.config?.series ?? []),
        ...adHocDatasets.map((entry) => entry.dataset),
      ],
      nextInterface,
      prioritySeriesId,
      initialView,
      previewState: {
        initial,
        onChange: (state: ObliquePreviewState | null) =>
          updateHashState(
            obliquePreviewHashParams(
              state?.seriesId.startsWith("adhoc-avif-") ? null : state
            ),
            {
              replace: true,
              label: "oblique-preview",
            }
          ),
      },
    }),
    [
      props.config,
      adHocDatasets,
      nextInterface,
      initial,
      initialView,
      prioritySeriesId,
      updateHashState,
    ]
  );
  const { setOn, setPanelOpen } = actions;
  const started = useRef(false);
  useEffect(() => {
    if ((!props.config?.startEnabled && !initial) || started.current) return;
    started.current = true;
    setOn(true);
    setPanelOpen(true);
  }, [props.config?.startEnabled, initial, setOn, setPanelOpen]);
  return (
    <ObliqueViewerActionsProvider actions={actions}>
      <FeatureViewer
        config={viewerConfig}
        libreMap={props.libreMap}
        extensions={extensions}
      />
    </ObliqueViewerActionsProvider>
  );
};

export const ObliquePanel = () => {
  const actions = useObliqueViewerActions();
  const nextInterface = Boolean(useFeatureFlags().featureFlagObliqueNextUi);
  const extensions = useObliqueExtensions(nextInterface);
  return (
    <ObliqueViewerActionsProvider actions={actions}>
      <FeaturePanel nextInterface={nextInterface} extensions={extensions} />
    </ObliqueViewerActionsProvider>
  );
};

export const ObliqueInteractionPanel = () => <ObliquePanel />;
