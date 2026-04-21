import { useEffect } from "react";
import {
  DEFAULT_HASH_LAUNCH_FLAG_2D_KEY,
  DEFAULT_HASH_LAUNCH_FLAG_3D_KEY,
} from "@carma-commons/utils";
import {
  HASH_CLEAR_STATE_KEY_SET,
  useHashState,
} from "@carma-providers/hash-state";

export type UseRegisterDefaultMapHashClearStateKeySetsOptions = {
  launchModeSetId?: string;
};

export const useRegisterDefaultMapHashClearStateKeySets = (
  options: UseRegisterDefaultMapHashClearStateKeySetsOptions = {}
): string => {
  const { launchModeSetId = HASH_CLEAR_STATE_KEY_SET.LAUNCH_MODE } = options;
  const { registerClearStateKeySet } = useHashState();

  useEffect(() => {
    const keys = [
      DEFAULT_HASH_LAUNCH_FLAG_2D_KEY,
      DEFAULT_HASH_LAUNCH_FLAG_3D_KEY,
    ];

    return registerClearStateKeySet(launchModeSetId, keys);
  }, [registerClearStateKeySet, launchModeSetId]);

  return launchModeSetId;
};
