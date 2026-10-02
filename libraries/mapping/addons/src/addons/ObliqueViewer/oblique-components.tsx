import { useEffect, useRef } from "react";

import {
  ObliqueViewer as FeatureViewer,
  ObliquePanel as FeaturePanel,
  ObliqueViewerActionsProvider,
} from "@carma-mapping/oblique-viewer";
import type { AddonComponentProps } from "../../lib/registry";
import { useObliqueViewerActions } from "./oblique-actions";

export const ObliqueViewer = (props: AddonComponentProps<"obliqueViewer">) => {
  const actions = useObliqueViewerActions();
  const { setOn, setPanelOpen } = actions;
  const started = useRef(false);
  useEffect(() => {
    if (!props.config?.startEnabled || started.current) return;
    started.current = true;
    setOn(true);
    setPanelOpen(true);
  }, [props.config?.startEnabled, setOn, setPanelOpen]);
  return (
    <ObliqueViewerActionsProvider actions={actions}>
      <FeatureViewer config={props.config} libreMap={props.libreMap} />
    </ObliqueViewerActionsProvider>
  );
};

export const ObliquePanel = () => {
  const actions = useObliqueViewerActions();
  return (
    <ObliqueViewerActionsProvider actions={actions}>
      <FeaturePanel />
    </ObliqueViewerActionsProvider>
  );
};

export const ObliqueInteractionPanel = () => <ObliquePanel />;
