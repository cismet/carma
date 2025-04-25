import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

export const useSyncToken = () => {
  const [searchParams] = useSearchParams();
  const [syncToken, setSyncToken] = useState(null);
  useEffect(() => {
    if (searchParams.get("sync")) {
      setSyncToken(searchParams.get("sync"));
    }
    // run only once on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return syncToken;
};
