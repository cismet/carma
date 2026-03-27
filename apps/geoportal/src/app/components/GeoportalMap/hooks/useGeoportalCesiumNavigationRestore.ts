import { useCallback, useEffect } from "react";
import type { Scene } from "@carma-mapping/engines/cesium/api";
import {
  VIEW_STATE_NAVIGATION_EVENT,
  flyViewStateInCesium,
  useOnViewStateNavigationEvent,
  useViewStateNavigationRestore,
} from "@carma-mapping/engines-interop/view-state";

type UseGeoportalCesiumNavigationRestoreOptions = {
  scene?: Scene | null;
  enabled?: boolean;
  suppressCommitsUntilInteraction: () => void;
};

export const useGeoportalCesiumNavigationRestore = ({
  scene = null,
  enabled = true,
  suppressCommitsUntilInteraction,
}: UseGeoportalCesiumNavigationRestoreOptions) => {
  const { restoreState } = useViewStateNavigationRestore();

  useEffect(() => {
    if (!enabled || !scene || scene.isDestroyed() || !restoreState) {
      return;
    }

    // The restored hash state should remain traversable with browser back/forward
    // until the next actual user interaction in the Cesium canvas.
    suppressCommitsUntilInteraction();
  }, [enabled, restoreState, scene, suppressCommitsUntilInteraction]);

  useOnViewStateNavigationEvent(
    useCallback(
      (event) => {
        if (!enabled || !scene || scene.isDestroyed()) {
          return;
        }

        if (
          event.type !== VIEW_STATE_NAVIGATION_EVENT.BROWSER_POPSTATE_RESTORE
        ) {
          return;
        }

        suppressCommitsUntilInteraction();
        flyViewStateInCesium(scene, event.state, {
          duration: 1.2,
          applyFov:
            typeof event.state.metadata.restoreHints?.shareable
              ?.fovLongerEdge === "number",
        });
      },
      [enabled, scene, suppressCommitsUntilInteraction]
    )
  );
};
