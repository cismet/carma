import { useEffect, useRef } from "react";
import { useLibreContext } from "../contexts/LibreContext";
import type {
  Carma3dConfig,
  ThreePerfData,
  MappedFeature,
  FactoryStats,
  GenericCustomLayer,
} from "@carma-mapping/engines/threejs";
import {
  buildGenericLayer,
  syncGenericLayerFromSource,
  buildLatheInstances,
  buildLoftMeshes,
} from "@carma-mapping/engines/threejs";
import type { Scene } from "three";
import type { MercatorCoordinate } from "maplibre-gl";

// ─────────────────────────────────────────────────────────────
//  ThreeLayerManager: bridges carma3d configs to the threejs engine
// ─────────────────────────────────────────────────────────────

export interface ThreeLayerManagerProps {
  config: Carma3dConfig;
  runtimeParams: Record<string, number>;
  perfRef?: React.MutableRefObject<ThreePerfData>;
}

const EMPTY_PERF: ThreePerfData = {
  mode: "",
  treeCount: 0,
  triangles: 0,
  drawCalls: 0,
  syncMs: 0,
};

export function ThreeLayerManager({
  config,
  runtimeParams,
  perfRef,
}: ThreeLayerManagerProps) {
  const { map } = useLibreContext();
  const layerRef = useRef<GenericCustomLayer | null>(null);

  const useLoft = (runtimeParams.useLoft ?? 0) > 0;
  const radiusMix = runtimeParams.radiusMix ?? 0;

  // Effect 1: Layer lifecycle (tear down on mode change or unmount)
  useEffect(() => {
    if (!map) return;
    return () => {
      const layerId = layerRef.current?.id;
      if (layerId && map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      layerRef.current = null;
    };
  }, [map, useLoft]);

  // Effect 2: Data sync (re-runs on radius change without tearing down)
  useEffect(() => {
    if (!map) return;

    const rebuildFn = useLoft
      ? (
          features: MappedFeature[],
          scene: Scene,
          originMerc: MercatorCoordinate,
          mScale: number,
          cfg: Carma3dConfig,
        ): FactoryStats => buildLoftMeshes(features, scene, originMerc, mScale, cfg, 14)
      : buildLatheInstances;

    const addLayerIfReady = () => {
      if (layerRef.current) return;
      if (!map.getSource(config.sourceId)) return;

      const layerId = useLoft ? "3d-generic-loft" : "3d-generic";
      const customLayer = buildGenericLayer(config, rebuildFn, layerId);
      layerRef.current = customLayer;

      // Insert before the first fill-extrusion layer for correct depth
      const styleLayers = map.getStyle().layers ?? [];
      const firstExtrusion = styleLayers.find(
        (l) => l.type === "fill-extrusion",
      );
      map.addLayer(customLayer, firstExtrusion?.id);
    };

    const trySync = () => {
      addLayerIfReady();
      if (!layerRef.current || !map.getSource(config.sourceId)) return;

      const result = syncGenericLayerFromSource(
        map,
        layerRef.current,
        radiusMix,
      );
      if (result && perfRef) {
        perfRef.current = {
          ...result,
          mode: useLoft ? "umring" : "kreis",
        };
      }
    };

    map.on("moveend", trySync);

    const handleSourceData = (e: {
      sourceId: string;
      isSourceLoaded: boolean;
    }) => {
      if (e.sourceId === config.sourceId && e.isSourceLoaded) {
        trySync();
      }
    };
    map.on("sourcedata", handleSourceData);

    // Sync immediately if the map is already idle
    if (map.isStyleLoaded()) {
      trySync();
    } else {
      map.once("idle", trySync);
    }

    return () => {
      map.off("moveend", trySync);
      map.off("sourcedata", handleSourceData);
      if (perfRef) {
        perfRef.current = EMPTY_PERF;
      }
    };
  }, [map, useLoft, radiusMix, config, perfRef]);

  return null;
}
