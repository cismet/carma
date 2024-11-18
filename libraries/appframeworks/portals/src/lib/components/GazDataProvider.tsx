import { createContext, useContext, useEffect, useState } from "react";

import { SearchResultItem } from "@carma-mapping/fuzzy-search";
import { type GazDataItem } from "@carma-commons/utils";

interface GazDataContextType {
  gazData: SearchResultItem[];
  isLoading: boolean;
  error: Error | null;
}

const GazDataContext = createContext<GazDataContextType | undefined>(undefined);

interface GazDataProviderProps {
  children: React.ReactNode;
  getGazData: () => Promise<SearchResultItem[]>;
}

export function GazDataProvider({
  children,
  getGazData,
}: GazDataProviderProps) {
  const [gazData, setGazData] = useState<GazDataItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadGazData = async () => {
      try {
        setIsLoading(true);
        await getGazData(setGazData);
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
  }, []);

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
