/**
 * MapSelectionContext - Shared context for programmatic map feature selection
 *
 * Enables bidirectional selection between UI components (lists, sidebars)
 * and the map engine (LibreMap). Eliminates the need for synthetic click events.
 *
 * - External callers (lists) use selectFeature() to request selection
 * - LibreMap watches selectedFeatureId and applies visual highlighting + createFeature()
 * - LibreMap writes the processed result back via setSelectedFeature()
 */

import type { MapGeoJSONFeature } from "maplibre-gl";
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

export interface SelectedFeatureIdentifier {
  source: string;
  sourceLayer?: string;
  id?: string | number;
}

export interface MapSelectionContextType {
  /** The currently selected feature identifier (source/sourceLayer/id) */
  selectedFeatureId: SelectedFeatureIdentifier | null;
  /** The processed feature after createFeature() (set by LibreMap) */
  selectedFeature: any | null;
  /** The raw MapGeoJSONFeature passed along with selectFeature() */
  rawFeature: MapGeoJSONFeature | null;
  /** Request selection of a feature; optionally pass the raw feature data */
  selectFeature: (
    id: SelectedFeatureIdentifier,
    rawFeature?: MapGeoJSONFeature
  ) => void;
  /** Clear the current selection */
  clearSelection: () => void;
  /** Write-back for LibreMap after createFeature() processes the raw feature */
  setSelectedFeature: (feature: any | null) => void;
  /** Counter incremented on each selectFeature() call; used by LibreMap to detect external changes */
  selectionVersion: number;
}

const defaultContext: MapSelectionContextType = {
  selectedFeatureId: null,
  selectedFeature: null,
  rawFeature: null,
  selectFeature: () => {},
  clearSelection: () => {},
  setSelectedFeature: () => {},
  selectionVersion: 0,
};

export const MapSelectionContext =
  createContext<MapSelectionContextType>(defaultContext);

interface MapSelectionProviderProps {
  children: ReactNode;
  /** Enable console.log output for selection changes. Defaults to false. */
  debug?: boolean;
}

export const MapSelectionProvider = ({
  children,
  debug = false,
}: MapSelectionProviderProps) => {
  const [selectedFeatureId, setSelectedFeatureId] =
    useState<SelectedFeatureIdentifier | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<any | null>(null);
  const [rawFeature, setRawFeature] = useState<MapGeoJSONFeature | null>(null);
  const [selectionVersion, setSelectionVersion] = useState(0);

  const selectFeature = useCallback(
    (id: SelectedFeatureIdentifier, raw?: MapGeoJSONFeature) => {
      if (debug) {
        console.log("[MapSelection] selectFeature", {
          identifier: id,
          maplibreFeature: raw,
        });
      }
      setSelectedFeatureId(id);
      setRawFeature(raw ?? null);
      setSelectedFeature(null);
      setSelectionVersion((v) => v + 1);
    },
    [debug]
  );

  const clearSelection = useCallback(() => {
    if (debug) {
      console.log("[MapSelection] clearSelection");
    }
    setSelectedFeatureId(null);
    setSelectedFeature(null);
    setRawFeature(null);
    setSelectionVersion((v) => v + 1);
  }, [debug]);

  const value = useMemo(
    () => ({
      selectedFeatureId,
      selectedFeature,
      rawFeature,
      selectFeature,
      clearSelection,
      setSelectedFeature,
      selectionVersion,
    }),
    [
      selectedFeatureId,
      selectedFeature,
      rawFeature,
      selectFeature,
      clearSelection,
      selectionVersion,
    ]
  );

  return (
    <MapSelectionContext.Provider value={value}>
      {children}
    </MapSelectionContext.Provider>
  );
};

export const useMapSelection = () => useContext(MapSelectionContext);
