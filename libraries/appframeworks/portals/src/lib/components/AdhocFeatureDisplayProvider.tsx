import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { Feature, FeatureCollection } from "geojson";
import type { FeatureInfoProperties } from "@carma/types";

export type AdhocMapLibreStyleData = {
  version?: number;
  metadata?: {
    carmaConf?: {
      instant?: boolean;
      layerInfo?: {
        title?: string;
        header?: string;
        accentColor?: string;
      };
    };
  };
  sources?: Record<
    string,
    {
      type?: string;
      generateId?: boolean;
      data?: Feature | FeatureCollection;
    }
  >;
  layers?: Array<Record<string, unknown>>;
};

export type AdhocModelData = {
  url: string;
  position: {
    lon: number;
    lat: number;
    height?: number;
  };
  heading?: number;
  pitch?: number;
  roll?: number;
  scale?: number;
};

export type AdhocMapLibreStyleFeature = {
  id: string;
  kind: "maplibre-style";
  data: AdhocMapLibreStyleData;
  properties?: FeatureInfoProperties;
  metadata?: Record<string, unknown>;
};

export type AdhocModelFeature = {
  id: string;
  kind: "model";
  data: AdhocModelData;
  properties?: FeatureInfoProperties;
  metadata?: Record<string, unknown>;
};

export type AdhocFeature = AdhocMapLibreStyleFeature | AdhocModelFeature;

interface AdhocFeatureDisplayContextType {
  features: AdhocFeature[];
  activeFeatureId: string | null;
  activeFeature: AdhocFeature | null;
  selectedFeatureId: string | null;
  selectedFeature: AdhocFeature | null;
  shouldFocusSelected: boolean;
  addFeature: (feature: AdhocFeature) => void;
  removeFeature: (id: string) => void;
  setActiveFeatureId: (id: string | null) => void;
  setSelectedFeatureId: (id: string | null) => void;
  setShouldFocusSelected: (shouldFocus: boolean) => void;
  clearFeatures: () => void;
}

const AdhocFeatureDisplayContext = createContext<
  AdhocFeatureDisplayContextType | undefined
>(undefined);

interface AdhocFeatureDisplayProviderProps {
  children: React.ReactNode;
}

export function AdhocFeatureDisplayProvider({
  children,
}: AdhocFeatureDisplayProviderProps) {
  const [features, setFeatures] = useState<AdhocFeature[]>([]);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(
    null
  );
  const [shouldFocusSelected, setShouldFocusSelected] =
    useState<boolean>(false);

  const setActiveFeatureId = useCallback((id: string | null) => {
    setSelectedFeatureId(id);
  }, []);

  const addFeature = useCallback(
    (feature: AdhocFeature) => {
      let isNew = false;
      setFeatures((prev) => {
        const existingIndex = prev.findIndex((item) => item.id === feature.id);
        if (existingIndex === -1) {
          isNew = true;
          return [...prev, feature];
        }
        const next = [...prev];
        next[existingIndex] = feature;
        return next;
      });

      const metadata = feature.metadata as { rehydrated?: boolean } | undefined;
      if (isNew && !metadata?.rehydrated) {
        setSelectedFeatureId(feature.id);
        setShouldFocusSelected(true);
      }
    },
    [setSelectedFeatureId, setShouldFocusSelected]
  );

  const removeFeature = useCallback((id: string) => {
    setFeatures((prev) => prev.filter((feature) => feature.id !== id));
    setSelectedFeatureId((current) => (current === id ? null : current));
  }, []);

  const clearFeatures = useCallback(() => {
    setFeatures([]);
    setSelectedFeatureId(null);
  }, []);

  const selectedFeature = useMemo(
    () => features.find((feature) => feature.id === selectedFeatureId) ?? null,
    [features, selectedFeatureId]
  );

  const activeFeatureId = selectedFeatureId;
  const activeFeature = selectedFeature;

  const value = useMemo(
    () => ({
      features,
      activeFeatureId,
      activeFeature,
      selectedFeatureId,
      selectedFeature,
      shouldFocusSelected,
      addFeature,
      removeFeature,
      setActiveFeatureId,
      setSelectedFeatureId,
      setShouldFocusSelected,
      clearFeatures,
    }),
    [
      features,
      activeFeatureId,
      activeFeature,
      selectedFeatureId,
      selectedFeature,
      shouldFocusSelected,
      addFeature,
      removeFeature,
      setActiveFeatureId,
      setSelectedFeatureId,
      setShouldFocusSelected,
      clearFeatures,
    ]
  );

  return (
    <AdhocFeatureDisplayContext.Provider value={value}>
      {children}
    </AdhocFeatureDisplayContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdhocFeatureDisplay() {
  const context = useContext(AdhocFeatureDisplayContext);
  if (context === undefined) {
    throw new Error(
      "useAdhocFeatureDisplay must be used within an AdhocFeatureDisplayProvider"
    );
  }
  return context;
}
