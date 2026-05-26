import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { MapGeoJSONFeatureWithOriginal } from "@carma-mapping/utils";
import type maplibregl from "maplibre-gl";

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

export type CreateFeatureType =
  | "leuchte"
  | "standort"
  | "leitung"
  | "schaltstelle"
  | "mauerlasche"
  | "abzweigdose"
  | null;

interface MapPageContextValue {
  config: MapPageConfig;
  setConfig: (c: Partial<MapPageConfig>) => void;
  activeHighlights: SidebarFeature[] | null;
  setActiveHighlights: (highlights: SidebarFeature[] | null) => void;
  aaModalOpen: boolean;
  setAaModalOpen: (open: boolean) => void;
  createFeatureType: CreateFeatureType;
  setCreateFeatureType: (type: CreateFeatureType) => void;
  onSelectNextDraft?: (removedFeatureId: string) => void;
  setOnSelectNextDraft: (
    fn: ((removedFeatureId: string) => void) | undefined
  ) => void;
  onOpenCreationDraft?: (featureType: string, draftKey: string) => void;
  setOnOpenCreationDraft: (
    fn: ((featureType: string, draftKey: string) => void) | undefined
  ) => void;
  // Live MapLibre instance for the main map. Published by BelisMapWrapper when
  // the map becomes ready, consumed by form components that need to query the
  // vector-tile sources (e.g. the Leuchte creation form lists the parent
  // Standort's existing Leuchten as read-only tabs).
  mainMap: maplibregl.Map | null;
  setMainMap: (m: maplibregl.Map | null) => void;
  // Bumped whenever the regular vector-tile source emits a `sourcedata` event,
  // i.e. new tiles loaded. Consumers can use this as a useEffect dep to re-run
  // `map.querySourceFeatures(...)` after panning/zooming brings new features
  // into the source.
  mainMapSourceTick: number;
  bumpMainMapSourceTick: () => void;
}

const MapPageContext = createContext<MapPageContextValue>({
  config: DEFAULT_CONFIG,
  setConfig: () => undefined,
  activeHighlights: null,
  setActiveHighlights: () => undefined,
  aaModalOpen: false,
  setAaModalOpen: () => undefined,
  createFeatureType: null,
  setCreateFeatureType: () => undefined,
  onSelectNextDraft: undefined,
  setOnSelectNextDraft: () => undefined,
  onOpenCreationDraft: undefined,
  setOnOpenCreationDraft: () => undefined,
  mainMap: null,
  setMainMap: () => undefined,
  mainMapSourceTick: 0,
  bumpMainMapSourceTick: () => undefined,
});

export const MapPageProvider = ({ children }: { children: ReactNode }) => {
  const [config, setConfigState] = useState<MapPageConfig>(DEFAULT_CONFIG);
  const [activeHighlights, setActiveHighlights] = useState<
    SidebarFeature[] | null
  >(null);
  const [aaModalOpen, setAaModalOpen] = useState(false);
  const [createFeatureType, setCreateFeatureType] =
    useState<CreateFeatureType>(null);
  const [onSelectNextDraft, setOnSelectNextDraft] = useState<
    ((removedFeatureId: string) => void) | undefined
  >(undefined);
  const [onOpenCreationDraft, setOnOpenCreationDraft] = useState<
    ((featureType: string, draftKey: string) => void) | undefined
  >(undefined);
  const [mainMap, setMainMap] = useState<maplibregl.Map | null>(null);
  const [mainMapSourceTick, setMainMapSourceTick] = useState(0);
  const bumpMainMapSourceTick = useCallback(
    () => setMainMapSourceTick((t) => t + 1),
    []
  );

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
        createFeatureType,
        setCreateFeatureType,
        onSelectNextDraft,
        setOnSelectNextDraft,
        onOpenCreationDraft,
        setOnOpenCreationDraft,
        mainMap,
        setMainMap,
        mainMapSourceTick,
        bumpMainMapSourceTick,
      }}
    >
      {children}
    </MapPageContext.Provider>
  );
};

export const useMapPage = () => useContext(MapPageContext);
