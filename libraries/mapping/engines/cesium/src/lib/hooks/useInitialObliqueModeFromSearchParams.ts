import { useEffect, useState } from "react";
import { getHashParams } from "@carma-commons/utils";
import { VIEWERSTATE_KEYS } from "../constants";

/**
 * Hook to determine the initial oblique mode state from URL hash parameters.
 * Returns true if 'oblq=1' is found in the hash, false otherwise.
 * The state is only evaluated once on initial load.
 */
export const useInitialObliqueModeFromSearchParams = (): boolean => {
  const [isObliqueMode, setIsObliqueMode] = useState<boolean>(false);

  useEffect(() => {
    const hashParams = getHashParams();
    const obliqueParam = hashParams[VIEWERSTATE_KEYS.isOblique];

    if (obliqueParam === "1") {
      setIsObliqueMode(true);
    } else {
      setIsObliqueMode(false);
    }
    // Only evaluate URL once on load for initial state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return isObliqueMode;
};
