import { useContext, useEffect, useState } from "react";
import localforage from "localforage";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";

const PERSISTED_STYLING_PROPS = [
  "selectedBackground",
  "namedMapStyle",
  "markerSymbolSize",
] as const;

type PersistedStylingProp = (typeof PERSISTED_STYLING_PROPS)[number];
type PersistedStyling = Partial<Record<PersistedStylingProp, unknown>>;

/**
 * TopicMapStylingContextProvider starts with its defaults and restores the
 * persisted styling from localforage in an effect, so a map mounted right away
 * first builds the default background and then switches. This reads the same
 * keys once and reports ready as soon as the context carries the stored values.
 */
export const usePersistedStylingReady = (): boolean => {
  const { appKey } = useContext<typeof TopicMapContext>(TopicMapContext);
  const styling = useContext<typeof TopicMapStylingContext>(
    TopicMapStylingContext
  );
  const [stored, setStored] = useState<PersistedStyling | null>(null);
  // Latches: later user changes no longer match the stored snapshot
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      PERSISTED_STYLING_PROPS.map((prop) =>
        localforage
          .getItem(`@${appKey}.styling.${prop}`)
          .catch(() => null)
          .then((value) => [prop, value] as const)
      )
    ).then((entries) => {
      if (cancelled) {
        return;
      }
      const values: PersistedStyling = {};
      for (const [prop, value] of entries) {
        if (value !== null && value !== undefined) {
          values[prop] = value;
        }
      }
      setStored(values);
    });
    return () => {
      cancelled = true;
    };
  }, [appKey]);

  const restored =
    stored !== null &&
    PERSISTED_STYLING_PROPS.every(
      (prop) =>
        !(prop in stored) ||
        JSON.stringify(styling?.[prop]) === JSON.stringify(stored[prop])
    );

  useEffect(() => {
    if (restored) {
      setReady(true);
    }
  }, [restored]);

  return ready || restored;
};
