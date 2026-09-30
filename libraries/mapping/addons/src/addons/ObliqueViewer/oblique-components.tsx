import {
  ObliqueViewer as FeatureViewer,
  ObliquePanel as FeaturePanel,
  ObliqueViewerActionsProvider,
} from "@carma-mapping/oblique-viewer";
import type { AddonComponentProps } from "../../lib/registry";
import { useObliqueViewerActions } from "./oblique-actions";

export const ObliqueViewer = (props: AddonComponentProps<"obliqueViewer">) => {
  const actions = useObliqueViewerActions();
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
