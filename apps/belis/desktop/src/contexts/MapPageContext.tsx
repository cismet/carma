import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { MapGeoJSONFeatureWithOriginal } from "@carma-mapping/utils";

export type SidebarFeature = MapGeoJSONFeatureWithOriginal;

export type FilterConfig =
  | { variant: "fachobjekte"; enabledFilters: Record<string, boolean> }
  | { variant: "arbeitsauftraege" };

export interface MapPageConfig {
  title: string;
  filterConfig: FilterConfig | null;
  activeSourceLayers: Set<string>;
  isMapRoute: boolean;
  showSearch: boolean;
  sidebarVariant: "fachobjekte" | "arbeitsauftraege";
  onFilterChange: ((key: string, enabled: boolean) => void) | null;
}

const DEFAULT_CONFIG: MapPageConfig = {
  title: "",
  filterConfig: null,
  activeSourceLayers: new Set(),
  isMapRoute: false,
  showSearch: true,
  sidebarVariant: "fachobjekte",
  onFilterChange: null,
};

interface MapPageContextValue {
  config: MapPageConfig;
  setConfig: (c: Partial<MapPageConfig>) => void;
  activeHighlights: SidebarFeature[] | null;
  setActiveHighlights: (highlights: SidebarFeature[] | null) => void;
  aaModalOpen: boolean;
  setAaModalOpen: (open: boolean) => void;
}

const MapPageContext = createContext<MapPageContextValue>({
  config: DEFAULT_CONFIG,
  setConfig: () => undefined,
  activeHighlights: null,
  setActiveHighlights: () => undefined,
  aaModalOpen: false,
  setAaModalOpen: () => undefined,
});

export const MapPageProvider = ({ children }: { children: ReactNode }) => {
  const [config, setConfigState] = useState<MapPageConfig>(DEFAULT_CONFIG);
  const [activeHighlights, setActiveHighlights] = useState<
    SidebarFeature[] | null
  >(null);
  const [aaModalOpen, setAaModalOpen] = useState(false);

  const setConfig = useCallback((c: Partial<MapPageConfig>) => {
    setConfigState((prev) => ({ ...prev, ...c }));
  }, []);

  return (
    <MapPageContext.Provider
      value={{
        config,
        setConfig,
        activeHighlights,
        setActiveHighlights,
        aaModalOpen,
        setAaModalOpen,
      }}
    >
      {children}
    </MapPageContext.Provider>
  );
};

export const useMapPage = () => useContext(MapPageContext);
