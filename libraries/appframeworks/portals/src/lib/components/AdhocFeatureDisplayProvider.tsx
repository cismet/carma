import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Feature, FeatureCollection } from "geojson";
import type { FeatureInfoProperties } from "@carma/types";

export type AdhocGeoJsonPayload = {
  kind: "geojson";
  data: Feature | FeatureCollection;
  crs?: string;
};

export type AdhocModelPayload = {
  kind: "model";
  data: {
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
};

export type AdhocSpatialPayload = AdhocGeoJsonPayload | AdhocModelPayload;

export type AdhocFeature = {
  id: string;
  payload: AdhocSpatialPayload;
  properties?: FeatureInfoProperties;
  metadata?: Record<string, unknown>;
};

interface AdhocFeatureDisplayContextType {
  features: AdhocFeature[];
  activeFeatureId: string | null;
  activeFeature: AdhocFeature | null;
  selectedFeatureId: string | null;
  selectedFeature: AdhocFeature | null;
  addFeature: (feature: AdhocFeature) => void;
  removeFeature: (id: string) => void;
  setActiveFeatureId: (id: string | null) => void;
  setSelectedFeatureId: (id: string | null) => void;
  clearFeatures: () => void;
}

const AdhocFeatureDisplayContext =
  createContext<AdhocFeatureDisplayContextType | undefined>(undefined);

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

  const setActiveFeatureId = useCallback(
    (id: string | null) => {
      setSelectedFeatureId(id);
    },
    []
  );

  const addFeature = useCallback((feature: AdhocFeature) => {
    setFeatures((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === feature.id);
      if (existingIndex === -1) {
        return [...prev, feature];
      }
      const next = [...prev];
      next[existingIndex] = feature;
      return next;
    });
  }, []);

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
      addFeature,
      removeFeature,
      setActiveFeatureId,
      setSelectedFeatureId,
      clearFeatures,
    }),
    [
      features,
      activeFeatureId,
      activeFeature,
      selectedFeatureId,
      selectedFeature,
      addFeature,
      removeFeature,
      setActiveFeatureId,
      setSelectedFeatureId,
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
