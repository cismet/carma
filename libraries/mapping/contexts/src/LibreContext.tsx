/**
 * LibreContext - Shared context for MapLibre map state
 *
 * This context is in a separate library to avoid circular dependencies
 * between @carma-mapping/engines/maplibre and @carma-appframeworks/portals.
 *
 * TODO: Long-term, the better solution is to move the portals imports
 * (FeatureInfobox, useSelection, defaultLayerConf, useMapHashRouting)
 * out of engines-maplibre to eliminate the dependency entirely.
 */

import type { StyleSpecification } from "maplibre-gl";
import type maplibregl from "maplibre-gl";
import { createContext, useContext, useState, ReactNode } from "react";

export interface GeoJsonMetadata {
  sourceId: string;
  uniqueColors: string[];
}

/**
 * How a layer's user filter is shown on the map.
 *
 * A host app says *what* is selected, by putting a filter expression on its
 * layer; this says what that selection *does*. `null`, the default, is the
 * plain reading: the features that do not match are dropped. Set, the covered
 * layers keep them and draw them faded instead, so the selection reads as a
 * highlight without losing its surroundings.
 *
 * It lives here rather than on the layers because it is nobody's layer
 * property: it is a map-wide policy that an addon can switch at runtime,
 * without the host app knowing the addon exists.
 *
 * `layerIds: null` means every layer that carries a filter, an empty array
 * means none, which is what an unmounted producer leaves behind.
 */
export type FilterPresentation = {
  layerIds: string[] | null;
  /** opacity factor for the features the filter does not match */
  dimOpacity: number;
} | null;

export interface LibreContextType {
  mapStyle: StyleSpecification | null;
  setMapStyle: (style: StyleSpecification) => void;
  geoJsonMetadata: GeoJsonMetadata[];
  setGeoJsonMetadata: (metadata: GeoJsonMetadata[]) => void;
  map: maplibregl.Map | null;
  setMap: (map: maplibregl.Map | null) => void;
  filterPresentation: FilterPresentation;
  setFilterPresentation: (presentation: FilterPresentation) => void;
}

const defaultContext: LibreContextType = {
  mapStyle: null,
  setMapStyle: () => {},
  geoJsonMetadata: [],
  setGeoJsonMetadata: () => {},
  map: null,
  setMap: () => {},
  filterPresentation: null,
  setFilterPresentation: () => {},
};

export const LibreContext = createContext<LibreContextType>(defaultContext);

interface LibreContextProviderProps {
  children: ReactNode;
}

export const LibreContextProvider = ({
  children,
}: LibreContextProviderProps) => {
  const [mapStyle, setMapStyle] = useState<StyleSpecification | null>(null);
  const [geoJsonMetadata, setGeoJsonMetadata] = useState<GeoJsonMetadata[]>([]);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [filterPresentation, setFilterPresentation] =
    useState<FilterPresentation>(null);

  return (
    <LibreContext.Provider
      value={{
        mapStyle,
        setMapStyle,
        geoJsonMetadata,
        setGeoJsonMetadata,
        map,
        setMap,
        filterPresentation,
        setFilterPresentation,
      }}
    >
      {children}
    </LibreContext.Provider>
  );
};

export const useLibreContext = () => useContext(LibreContext);
