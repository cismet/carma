import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { FilterConfig } from "@carma-mapping/layers";
import { CarmaMap } from "@carma-mapping/core";
import { Control } from "@carma-mapping/map-controls-layout";
import {
  createFilterButtons,
  type GenericFilterButtonsProps,
} from "@carma-mapping/components";

import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "leaflet/dist/leaflet.css";

type FilterableLayer = {
  name: string;
  style: string;
  opacity?: number;
};

const FILTERABLE_LAYERS: FilterableLayer[] = [
  {
    name: "Wohnlagen 2026",
    style: "https://tiles.cismet.de/wohnlagen2026/style.json",
    opacity: 0.7,
  },
  {
    name: "Toiletten",
    style: "https://tiles.cismet.de/toiletten/style.json",
  },
];

type LayerFilterControlsProps = {
  layer: FilterableLayer;
  libreMap: MaplibreMap | null;
};

function LayerFilterControls({ layer, libreMap }: LayerFilterControlsProps) {
  const [filterConfig, setFilterConfig] = useState<FilterConfig | null>(null);
  const [feature, setFeature] = useState<unknown>(undefined);
  const [layersReady, setLayersReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(layer.style)
      .then((res) => res.json())
      .then((style) => {
        if (cancelled) {
          return;
        }
        const cfg = style?.metadata?.carmaConf?.filterConfig as
          | FilterConfig
          | undefined;
        if (cfg) {
          setFilterConfig(cfg);
        } else {
          console.warn(
            `[Wohnlagenkarte] No metadata.carmaConf.filterConfig found in ${layer.style}`
          );
        }
      })
      .catch((err) => {
        console.error(`[Wohnlagenkarte] Failed to fetch ${layer.style}`, err);
      });
    return () => {
      cancelled = true;
    };
  }, [layer.style]);

  useEffect(() => {
    if (!libreMap || !filterConfig) {
      return;
    }
    const pattern = filterConfig.layerPattern.toLowerCase();
    const check = () => {
      const layers = libreMap.getStyle()?.layers ?? [];
      return layers.some((l) => l.id.toLowerCase().includes(pattern));
    };
    if (check()) {
      setLayersReady(true);
      return;
    }
    setLayersReady(false);
    const onStyleData = () => {
      if (check()) {
        setLayersReady(true);
        libreMap.off("styledata", onStyleData);
      }
    };
    libreMap.on("styledata", onStyleData);
    return () => {
      libreMap.off("styledata", onStyleData);
    };
  }, [libreMap, filterConfig]);

  const FilterButtonsComponent = useMemo<ComponentType<
    Omit<GenericFilterButtonsProps, "config">
  > | null>(() => {
    if (!filterConfig) {
      return null;
    }
    return createFilterButtons(filterConfig);
  }, [filterConfig]);

  if (!FilterButtonsComponent) {
    return null;
  }

  return (
    <div style={{ pointerEvents: "auto" }}>
      <FilterButtonsComponent
        maplibreMap={layersReady ? libreMap : null}
        selectedFeature={feature}
        setSelectedFeature={setFeature}
      />
    </div>
  );
}

export function FilterMap() {
  const mapRef = useRef<MaplibreMap | null>(null);
  const [libreMap, setLibreMap] = useState<MaplibreMap | null>(null);

  const handleLibreMapReady = useCallback((map: MaplibreMap) => {
    mapRef.current = map;
    setLibreMap(map);
  }, []);

  const libreLayers = useMemo(
    () =>
      FILTERABLE_LAYERS.map((l) => ({
        type: "vector" as const,
        name: l.name,
        style: l.style,
        ...(l.opacity !== undefined ? { opacity: l.opacity } : {}),
      })),
    []
  );

  return (
    <div className="w-full h-screen relative">
      <CarmaMap
        appKey="ng-topicmap-playground-wohnlagen"
        mapEngine="maplibre"
        exposeMapToWindow
        backgroundLayers="basemap_grey@20"
        overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
        setLibreMap={handleLibreMapReady}
        libreLayers={libreLayers}
        extraControls={
          <Control position="topcenter" order={10}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                alignItems: "center",
              }}
            >
              {FILTERABLE_LAYERS.map((layer) => (
                <LayerFilterControls
                  key={layer.style}
                  layer={layer}
                  libreMap={libreMap}
                />
              ))}
            </div>
          </Control>
        }
      />
    </div>
  );
}

export default FilterMap;
