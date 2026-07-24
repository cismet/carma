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

import { GazDataContext } from "./GazDataContext";

interface GazDataProviderProps {
  children: ReactNode;
  config?: GazDataConfig;
}

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

  const [landParcelData, setLandParcelData] = useState<
    Record<string, unknown> | undefined
  >(undefined);
  const [landParcelLoading, setLandParcelLoading] = useState(false);
  const landParcelFetchedRef = useRef(false);

  useEffect(() => {
    const loadGazData = async () => {
      try {
        setIsLoading(true);
        const [, loadedModes] = await Promise.all([
          getGazData(config, setGazData),
          Promise.all(
            (config.additionalModes ?? []).map(async (mode) => ({
              ...mode,
              gazData: await getGazData({
                crs: config.crs,
                prefix: config.prefix,
                sources: mode.sources,
              }),
            }))
          ),
        ]);
        setAdditionalModes(loadedModes);
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error("Failed to load gazetteer data")
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadGazData();
  }, [config]);

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
