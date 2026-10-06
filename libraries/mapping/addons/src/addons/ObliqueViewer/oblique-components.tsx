import { useEffect, useMemo, useRef, useState } from "react";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import { useHashState } from "@carma-providers/hash-state";
import {
  parseObliquePreviewHash,
  obliquePreviewHashParams,
} from "./preview-state-hash";

import {
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
  const nextInterface = Boolean(useFeatureFlags().featureFlagObliqueNextUi);
  const extensions = useObliqueExtensions(nextInterface);
  const { getHashParams, updateHashState } = useHashState();
  const [initialHash] = useState(getHashParams);
  const initial = useMemo(
    () => parseObliquePreviewHash(initialHash),
    [initialHash]
  );
  const prioritySeriesId =
    initialHash.obs && initialHash.obs.length <= 256
      ? initialHash.obs
      : undefined;
  const viewerConfig = useMemo(
    () => ({
      ...props.config,
      nextInterface,
      prioritySeriesId,
      previewState: {
        initial,
        onChange: (state: ObliquePreviewState | null) =>
          updateHashState(obliquePreviewHashParams(state), {
            replace: true,
            label: "oblique-preview",
          }),
      },
    }),
    [props.config, nextInterface, initial, prioritySeriesId, updateHashState]
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
