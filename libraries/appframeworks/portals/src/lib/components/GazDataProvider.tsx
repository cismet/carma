import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  type GazDataItem,
  type SourceConfig,
  getGazData,
} from "@carma-commons/utils";
import { defaultSourcesConfig, gazDataPrefix } from "@carma-commons/resources";

interface GazDataContextType {
  gazData: GazDataItem[];
  isLoading: boolean;
  error: Error | null;
}

const GazDataContext = createContext<GazDataContextType | undefined>(undefined);

export type GazDataOptions = {
  sourcesConfig?: SourceConfig[];
  prefix?: string;
};

interface GazDataProviderProps extends GazDataOptions {
  children: ReactNode;
}

export function GazDataProvider({
  children,
  sourcesConfig = defaultSourcesConfig,
  prefix = gazDataPrefix,
}: GazDataProviderProps) {
  const [gazData, setGazData] = useState<GazDataItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadGazData = async () => {
      try {
        setIsLoading(true);
        await getGazData(sourcesConfig, prefix, setGazData);
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
  }, [sourcesConfig, prefix]);

  return (
    <GazDataContext.Provider value={{ gazData, isLoading, error }}>
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
