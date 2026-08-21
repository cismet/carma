import { useCallback } from "react";
import maplibregl from "maplibre-gl";
import {
  SelectionProvider,
} from "@carma-appframeworks/portals";
import {
  LibreContextProvider,
  type LibreLayer,
} from "@carma-mapping/engines/maplibre";
import { CarmaMap } from "../CarmaMap";

export interface CompareMapConfig {
  engine: "maplibre" | "cesium";
  label?: string;
  backgroundLayers?: string | null;
  layers?: LibreLayer[];
  layerMode?: "merged" | "imperative";
  // Reserved for Phase 4 (Cesium)
  tilesetUrl?: string;
  cesiumPosition?: { longitude: number; latitude: number; altitude?: number };
  cesiumRange?: number;
}

interface ComparePanelProps {
  config: CompareMapConfig;
  onMapReady?: (map: maplibregl.Map) => void;
  overrideGlyphs?: string;
  preserveDrawingBuffer?: boolean;
  interactive?: boolean;
  debugLog?: boolean;
  logErrors?: boolean;
}

/**
 * Compare panel for a single map. Follows the same provider pattern as
 * every other playground route (`SelectionProvider` > `LibreContextProvider`
 * > `CarmaMap`), so each panel has its own isolated map ref and selection
 * state while still sharing the outer `TopicMapContextProvider` from main.tsx.
 *
 * `CarmaMap` already wraps its subtree in `HashStateProvider` and
 * `MapFrameworkSwitcherProvider`, so no extra plumbing is needed here.
 */
export function ComparePanel({
  config,
  onMapReady,
  overrideGlyphs,
  preserveDrawingBuffer,
  interactive,
  debugLog,
  logErrors,
}: ComparePanelProps) {
  const handleMapReady = useCallback(
    (map: maplibregl.Map) => {
      // Trace that LibreMap → CarmaMap → ComparePanel chain landed here.
      // If you see [COMPARE-PANEL] but NOT the [COMPARE] handlePanelReady
      // line that follows it, the break is between ComparePanel and
      // CarmaMapCompare (stale / undefined onMapReady prop).
      console.log(
        "[COMPARE-PANEL] handleMapReady received map; onMapReady defined?",
        typeof onMapReady === "function"
      );
      onMapReady?.(map);
    },
    [onMapReady]
  );

  if (config.engine === "maplibre") {
    // The label lives outside this component now: CarmaMapCompare renders
    // it as a sibling overlay pinned to the visible strip's corner. A
    // label rendered here would be clipped away with the panel in the
    // parent's clip-path.
    return (
      <div className="carma-compare-panel">
        <SelectionProvider>
          <LibreContextProvider>
            <CarmaMap
              mapEngine="maplibre"
              embedded
              backgroundLayers={config.backgroundLayers}
              libreLayers={config.layers}
              layerMode={config.layerMode}
              overrideGlyphs={overrideGlyphs}
              preserveDrawingBuffer={preserveDrawingBuffer}
              interactive={interactive}
              debugLog={debugLog}
              logErrors={logErrors}
              setLibreMap={handleMapReady}
              // Disable the chrome; the playground provides its own top bar.
              zoomControls={false}
              fullScreenControl={false}
              terrainControl={false}
              locatorControl={false}
              gazetteerSearchControl={false}
              appKey="ng-topicmap-playground-compare"
            />
          </LibreContextProvider>
        </SelectionProvider>
      </div>
    );
  }

  // Phase 4: Cesium support goes here.
  return <div className="carma-compare-panel" />;
}
