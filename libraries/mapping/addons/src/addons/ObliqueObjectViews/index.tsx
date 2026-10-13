import { useEffect } from "react";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import {
  OBLIQUE_OBJECT_VIEWS_EXTENSION,
  type ObliqueViewerExtension,
} from "@carma-mapping/oblique-viewer";
import { useAddonState } from "../../lib/AddonStateContext";

export type ObliqueObjectViewsConfig = Record<string, never>;
export type ObliqueObjectViewsState = Readonly<{
  extension: ObliqueViewerExtension | null;
}>;
const ENABLED_STATE: ObliqueObjectViewsState = {
  extension: OBLIQUE_OBJECT_VIEWS_EXTENSION,
};
const DISABLED_STATE: ObliqueObjectViewsState = { extension: null };

/** Registers the optional mode; sphere/query resources live in the lazy extension. */
export const ObliqueObjectViews = () => {
  const nextInterface = Boolean(useFeatureFlags().featureFlagObliqueNextUi);
  const [, setState] = useAddonState("obliqueObjectViews");
  useEffect(() => {
    setState(nextInterface ? ENABLED_STATE : DISABLED_STATE);
    return () => setState(DISABLED_STATE);
  }, [nextInterface, setState]);
  return null;
};
