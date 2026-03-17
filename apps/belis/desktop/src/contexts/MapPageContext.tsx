import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

export interface MapPageConfig {
  title: string;
  filterPanel: ReactNode;
  activeSourceLayers: Set<string>;
  isMapRoute: boolean;
  showSearch: boolean;
}

const DEFAULT_CONFIG: MapPageConfig = {
  title: "",
  filterPanel: null,
  activeSourceLayers: new Set(),
  isMapRoute: false,
  showSearch: true,
};

interface MapPageContextValue {
  config: MapPageConfig;
  setConfig: (c: Partial<MapPageConfig>) => void;
}

const MapPageContext = createContext<MapPageContextValue>({
  config: DEFAULT_CONFIG,
  setConfig: () => undefined,
});

export const MapPageProvider = ({ children }: { children: ReactNode }) => {
  const [config, setConfigState] = useState<MapPageConfig>(DEFAULT_CONFIG);

  const setConfig = useCallback((c: Partial<MapPageConfig>) => {
    setConfigState((prev) => ({ ...prev, ...c }));
  }, []);

  return (
    <MapPageContext.Provider value={{ config, setConfig }}>
      {children}
    </MapPageContext.Provider>
  );
};

export const useMapPage = () => useContext(MapPageContext);
