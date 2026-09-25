import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { run } from "./api";
import wizardQueries from "./queries";

const cache = { gemarkungen: undefined, arten: undefined };

/**
 * Gemarkungen (with their ids, which the app's own gemarkung query omits) and
 * the Flurstücksarten. Both are small, never change during a session, and are
 * needed by almost every step, so they are fetched once and kept.
 */
const useStammdaten = () => {
  const jwt = useSelector((state) => state.auth.jwt);
  const [state, setState] = useState({
    gemarkungen: cache.gemarkungen,
    arten: cache.arten,
    loading: !cache.gemarkungen || !cache.arten,
    error: undefined,
  });

  useEffect(() => {
    if (!jwt || (cache.gemarkungen && cache.arten)) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [gemarkungData, artenData] = await Promise.all([
          run(wizardQueries.gemarkungen, {}, jwt),
          run(wizardQueries.flurstueckArten, {}, jwt),
        ]);
        cache.gemarkungen = gemarkungData.gemarkung ?? [];
        cache.arten = artenData.flurstueck_art ?? [];
        if (!cancelled) {
          setState({
            gemarkungen: cache.gemarkungen,
            arten: cache.arten,
            loading: false,
            error: undefined,
          });
        }
      } catch (e) {
        if (!cancelled) {
          setState((previous) => ({
            ...previous,
            loading: false,
            error: e.message,
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jwt]);

  return state;
};

export default useStammdaten;
