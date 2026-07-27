import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import { defaultGazDataConfig } from "@carma-commons/resources";
import { md5FetchText } from "@carma-commons/utils";
import {
  type GazDataAdditionalMode,
  type GazDataConfig,
  type GazDataItem,
  getGazData,
} from "@carma-mapping/fuzzy-search";

import { GazDataContext, type GazDataContribution } from "./GazDataContext";

interface GazDataProviderProps {
  children: ReactNode;
  config?: GazDataConfig;
}

type ContributionEntry = {
  id: number;
  contribution: GazDataContribution;
};

export function GazDataProvider({
  children,
  config = defaultGazDataConfig,
}: GazDataProviderProps) {
  const [gazData, setGazData] = useState<GazDataItem[]>([]);
  const [additionalModes, setAdditionalModes] = useState<
    GazDataAdditionalMode[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const crs = config.crs;

  const [contributions, setContributions] = useState<ContributionEntry[]>([]);
  const contributionIdRef = useRef(0);

  const [landParcelData, setLandParcelData] = useState<
    Record<string, unknown> | undefined
  >(undefined);
  const [landParcelLoading, setLandParcelLoading] = useState(false);
  const landParcelFetchedRef = useRef(false);

  const registerGazDataContribution = useCallback(
    (contribution: GazDataContribution) => {
      const id = ++contributionIdRef.current;
      setContributions((prev) => [...prev, { id, contribution }]);
      return () => {
        setContributions((prev) => prev.filter((entry) => entry.id !== id));
      };
    },
    []
  );

  const mergedConfig = useMemo(() => {
    if (contributions.length === 0) {
      return config;
    }
    return {
      ...config,
      sources: [
        ...config.sources,
        ...contributions.flatMap(
          ({ contribution }) => contribution.sources ?? []
        ),
      ],
      additionalModes: [
        ...(config.additionalModes ?? []),
        ...contributions.flatMap(
          ({ contribution }) => contribution.additionalModes ?? []
        ),
      ],
    };
  }, [config, contributions]);

  useEffect(() => {
    let cancelled = false;

    const loadGazData = async () => {
      try {
        setIsLoading(true);
        const [, loadedModes] = await Promise.all([
          getGazData(mergedConfig, (data) => {
            if (!cancelled) {
              setGazData(data);
            }
          }),
          Promise.all(
            (mergedConfig.additionalModes ?? []).map(async (mode) => ({
              ...mode,
              gazData: await getGazData({
                crs: mergedConfig.crs,
                prefix: mergedConfig.prefix,
                sources: mode.sources,
              }),
            }))
          ),
        ]);
        if (!cancelled) {
          setAdditionalModes(loadedModes);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err
              : new Error("Failed to load gazetteer data")
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    // Defer the load by one tick: contributions registered during the same
    // mount commit (e.g. gazetteer addons) then collapse into a single fetch
    // of the merged config instead of a default fetch plus a refetch.
    const timer = setTimeout(() => void loadGazData(), 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mergedConfig]);

  const loadLandParcelData = useCallback(() => {
    if (
      !config.landParcelUrl ||
      landParcelFetchedRef.current ||
      landParcelData
    ) {
      return;
    }
    landParcelFetchedRef.current = true;
    setLandParcelLoading(true);
    md5FetchText("", config.landParcelUrl)
      .then((text) => {
        if (text) {
          try {
            setLandParcelData(JSON.parse(text));
          } catch (e) {
            console.warn("[LAND_PARCEL] Failed to parse land parcel data", e);
          }
        }
      })
      .finally(() => setLandParcelLoading(false));
  }, [config.landParcelUrl, landParcelData]);

  // Memoize the context value to prevent unnecessary rerenders
  const value = useMemo(
    () => ({
      gazData,
      additionalModes,
      crs,
      isLoading,
      error,
      landParcelData,
      landParcelLoading,
      loadLandParcelData,
      registerGazDataContribution,
    }),
    [
      gazData,
      additionalModes,
      crs,
      isLoading,
      error,
      landParcelData,
      landParcelLoading,
      loadLandParcelData,
      registerGazDataContribution,
    ]
  );

  return (
    <GazDataContext.Provider value={value}>{children}</GazDataContext.Provider>
  );
}

export function useGazData() {
  const context = useContext(GazDataContext);
  if (context === undefined) {
    throw new Error("useGazData must be used within a GazDataProvider");
  }
  return context;
}
