import { useEffect } from "react";

import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import {
  DEFAULT_HASH_LAUNCH_FLAG_2D_KEY,
  DEFAULT_HASH_LAUNCH_FLAG_3D_KEY,
  DEFAULT_HASH_LAUNCH_LEGACY_FLAG_2D_KEY,
  DEFAULT_HASH_LAUNCH_LEGACY_FLAG_3D_KEY,
  getHashParams,
  HASH_LAUNCH_MODE,
  resolveHashLaunchMode,
  type HashLaunchModeConfig,
} from "@carma-commons/utils";
import { useHashState } from "@carma-providers/hash-state";

export type UseHashLaunchModeOptions = Pick<
  HashLaunchModeConfig,
  "defaultMode"
>;

const HASH_LAUNCH_FLAG_KEYS = [
  DEFAULT_HASH_LAUNCH_FLAG_2D_KEY,
  DEFAULT_HASH_LAUNCH_FLAG_3D_KEY,
  DEFAULT_HASH_LAUNCH_LEGACY_FLAG_2D_KEY,
  DEFAULT_HASH_LAUNCH_LEGACY_FLAG_3D_KEY,
] as const;

/**
 * Reads the launch-mode hint (`2d` / `3d`) from the URL hash on mount,
 * activates the corresponding map framework, then strips the consumed
 * flags from the hash so they don't linger.
 *
 * Returns the resolved launch mode so the caller can act on it.
 */
export const useHashLaunchMode = (
  options: UseHashLaunchModeOptions = {}
): void => {
  const { setActiveFrameworkCesium, setActiveFrameworkLeaflet } =
    useMapFrameworkSwitcherContext();
  const { updateHashState } = useHashState();

  useEffect(() => {
    const hashParams = getHashParams();
    const launchMode = resolveHashLaunchMode(hashParams, {
      defaultMode: options.defaultMode,
    });

    if (launchMode === HASH_LAUNCH_MODE.THREE_D) {
      setActiveFrameworkCesium();
    } else {
      setActiveFrameworkLeaflet();
    }

    if (HASH_LAUNCH_FLAG_KEYS.some((key) => hashParams[key] !== undefined)) {
      updateHashState(
        {
          [DEFAULT_HASH_LAUNCH_FLAG_2D_KEY]: undefined,
          [DEFAULT_HASH_LAUNCH_FLAG_3D_KEY]: undefined,
          [DEFAULT_HASH_LAUNCH_LEGACY_FLAG_2D_KEY]: undefined,
          [DEFAULT_HASH_LAUNCH_LEGACY_FLAG_3D_KEY]: undefined,
        },
        {
          label: "hash-launch-mode:clear",
          replace: true,
        }
      );
    }
    // run only once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
