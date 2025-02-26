import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
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

  return (
    <GazDataContext.Provider value={{ gazData, crs, isLoading, error }}>
      {children}
    </GazDataContext.Provider>
  );
}

export function useGazData() {
  const context = useContext(GazDataContext);
  if (context === undefined) {
    throw new Error("useGazData must be used within a GazDataProvider");
  }
  return context;
}
