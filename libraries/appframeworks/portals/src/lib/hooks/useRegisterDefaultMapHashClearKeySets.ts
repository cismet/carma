import { useEffect } from "react";
import {
  DEFAULT_HASH_LAUNCH_FLAG_2D_KEY,
  DEFAULT_HASH_LAUNCH_FLAG_3D_KEY,
} from "@carma-commons/utils";
import { HASH_CLEAR_KEY_SET, useHashState } from "@carma-providers/hash-state";

export type UseRegisterDefaultMapHashClearKeySetsOptions = {
  launchModeSetId?: string;
};

export const useRegisterDefaultMapHashClearKeySets = (
  options: UseRegisterDefaultMapHashClearKeySetsOptions = {}
): string => {
  const { launchModeSetId = HASH_CLEAR_KEY_SET.LAUNCH_MODE } = options;
  const { registerClearKeySet } = useHashState();

  useEffect(() => {
    const keys = [
      DEFAULT_HASH_LAUNCH_FLAG_2D_KEY,
      DEFAULT_HASH_LAUNCH_FLAG_3D_KEY,
    ];

    return registerClearKeySet(launchModeSetId, keys);
  }, [registerClearKeySet, launchModeSetId]);

  return launchModeSetId;
};
