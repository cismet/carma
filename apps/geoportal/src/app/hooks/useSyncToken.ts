import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

export const useSyncToken = () => {
  const [searchParams] = useSearchParams();
  const [syncToken, setSyncToken] = useState(null);
  useEffect(() => {
    if (searchParams.get("sync")) {
      setSyncToken(searchParams.get("sync"));
    }
  }, [searchParams]);

  return syncToken;
};
