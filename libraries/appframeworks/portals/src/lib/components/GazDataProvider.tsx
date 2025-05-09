import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
  useMemo,
} from "react";

import { type GazDataItem, getGazData } from "@carma-commons/utils";
import { GazDataConfig } from "@carma-commons/utils/gazData";
import { defaultGazDataConfig } from "@carma-commons/resources";

interface GazDataContextType {
  gazData: GazDataItem[];
  crs: string;
  isLoading: boolean;
  error: Error | null;
}

const GazDataContext = createContext<GazDataContextType | undefined>(undefined);

interface GazDataProviderProps {
  children: ReactNode;
  config?: GazDataConfig;
}

export function GazDataProvider({
  children,
  config = defaultGazDataConfig,
}: GazDataProviderProps) {
  const [gazData, setGazData] = useState<GazDataItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const crs = config.crs;

  useEffect(() => {
    const loadGazData = async () => {
      try {
        setIsLoading(true);
        await getGazData(config, setGazData);
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

  // Memoize the context value to prevent unnecessary rerenders
  const value = useMemo(
    () => ({
      gazData,
      crs,
      isLoading,
      error,
    }),
    [gazData, crs, isLoading, error]
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
