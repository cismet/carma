import { getHashParams } from "@carma-commons/utils";
import { useEffect, useState } from "react";

const SYNC_HASHPARAM_KEY = "sync";

export const useSyncToken = () => {
  const [syncToken, setSyncToken] = useState(null);
  useEffect(() => {
    const hashParams = getHashParams();
    if (hashParams[SYNC_HASHPARAM_KEY] !== undefined) {
      const syncTokenString = hashParams[SYNC_HASHPARAM_KEY];
      if (
        syncTokenString !== null &&
        syncTokenString !== undefined &&
        syncTokenString.trim().length > 0
      ) {
        setSyncToken(syncToken);
      }
    }
    // run only once on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return syncToken;
};
