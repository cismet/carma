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
  buildOverlayLayer,
  syncGenericLayerFromSource,
  buildLatheInstances,
  buildLoftMeshes,
  ensureProfiles,
} from "@carma-mapping/engines/threejs";
import type { Scene } from "three";
import type { MercatorCoordinate, Map as MaplibreMap } from "maplibre-gl";

// ─────────────────────────────────────────────────────────────
//  ThreeLayerManager: bridges carma3d configs to the threejs engine
// ─────────────────────────────────────────────────────────────

/** MapLibre paint properties that control opacity, keyed by layer type. */
const OPACITY_PROPS: Record<string, string[]> = {
  circle: ["circle-opacity", "circle-stroke-opacity"],
  fill: ["fill-opacity"],
  line: ["line-opacity"],
  symbol: ["icon-opacity", "text-opacity"],
  "fill-extrusion": ["fill-extrusion-opacity"],
  raster: ["raster-opacity"],
  heatmap: ["heatmap-opacity"],
};

export interface ThreeLayerManagerProps {
  config: Carma3dConfig;
  runtimeParams: Record<string, number>;
  perfRef?: React.MutableRefObject<ThreePerfData>;
}

// ─────────────────────────────────────────────────────────────
//  Registry: expose 3D layers on the map instance for click handling
// ─────────────────────────────────────────────────────────────

const LAYER_REGISTRY_KEY = "__carma3dLayers";

function register3dLayer(map: MaplibreMap, layer: GenericCustomLayer): void {
  const registry =
    ((map as any)[LAYER_REGISTRY_KEY] as GenericCustomLayer[] | undefined) ?? [];
  if (!registry.includes(layer)) {
    registry.push(layer);
  }
  (map as any)[LAYER_REGISTRY_KEY] = registry;
  console.log("[3D-SELECT] registered layer:", layer.id, "total:", registry.length);
}

function unregister3dLayer(map: MaplibreMap, layer: GenericCustomLayer): void {
  const registry =
    ((map as any)[LAYER_REGISTRY_KEY] as GenericCustomLayer[] | undefined) ?? [];
  const idx = registry.indexOf(layer);
  if (idx >= 0) {
    registry.splice(idx, 1);
    console.log("[3D-SELECT] unregistered layer:", layer.id, "remaining:", registry.length);
  }
  (map as any)[LAYER_REGISTRY_KEY] = registry;
}

/** Get all registered 3D layers from a map instance. */
export function get3dLayers(map: MaplibreMap): GenericCustomLayer[] {
  return ((map as any)[LAYER_REGISTRY_KEY] as GenericCustomLayer[] | undefined) ?? [];
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
  const overlayIdRef = useRef<string | null>(null);
  const profilesEnsuredRef = useRef(false);
  const addingRef = useRef(false);
  const origGlDisableRef = useRef<((cap: number) => void) | null>(null);

  const useLoft = (runtimeParams.useLoft ?? 0) > 0;
  const radiusMix = runtimeParams.radiusMix ?? 0;
  const viewportPadding = runtimeParams.viewportPadding;
  const useStencilOcclusion = (runtimeParams.useStencilOcclusion ?? 0) > 0;

  // Merge runtime overrides into config
  const effectiveConfig: Carma3dConfig = {
    ...config,
    ...(viewportPadding != null ? { viewportPadding } : {}),
    useStencilOcclusion: useStencilOcclusion || config.useStencilOcclusion,
  };

  // Effect 1: Layer lifecycle (tear down on mode change or unmount)
  useEffect(() => {
    if (!map) return;
    return () => {
      if (overlayIdRef.current && map.getLayer(overlayIdRef.current)) {
        map.removeLayer(overlayIdRef.current);
      }
      overlayIdRef.current = null;

      // Restore original gl.disable if we patched it
      if (origGlDisableRef.current) {
        const canvas = map.getCanvas();
        const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
        if (gl) {
          gl.disable = origGlDisableRef.current as typeof gl.disable;
        }
        origGlDisableRef.current = null;
      }

      if (layerRef.current) {
        layerRef.current.unhighlight();
        unregister3dLayer(map, layerRef.current);
        const layerId = layerRef.current.id;
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId);
        }
        map.triggerRepaint();
      }
      layerRef.current = null;
      addingRef.current = false;
    };
  }, [map, useLoft, useStencilOcclusion]);

  // Effect 2: Hide 2D layers with skipIn2D (set opacity to near-zero, restore on cleanup)
  useEffect(() => {
    if (!map || !config.skipIn2DLayerIds?.length) return;

    const saved = new Map<string, Array<[string, unknown]>>();

    for (const layerId of config.skipIn2DLayerIds) {
      const layer = map.getLayer(layerId);
      if (!layer) continue;
      const props = OPACITY_PROPS[layer.type];
      if (!props) continue;

      const originals: Array<[string, unknown]> = [];
      for (const prop of props) {
        originals.push([prop, map.getPaintProperty(layerId, prop)]);
        map.setPaintProperty(layerId, prop, 0.00001);
      }
      saved.set(layerId, originals);
    }

    return () => {
      for (const [layerId, originals] of saved) {
        if (!map.getLayer(layerId)) continue;
        for (const [prop, value] of originals) {
          map.setPaintProperty(layerId, prop, (value as number) ?? 1);
        }
      }
    };
  }, [map, config.skipIn2DLayerIds]);

  // Effect 3: Data sync (re-runs on radius change without tearing down)
  useEffect(() => {
    if (!map) return;

    const rebuildFn = useLoft
      ? (
          features: MappedFeature[],
          scene: Scene,
          originMerc: MercatorCoordinate,
          mScale: number,
          cfg: Carma3dConfig
        ): FactoryStats =>
          buildLoftMeshes(features, scene, originMerc, mScale, cfg, 14)
      : buildLatheInstances;

    const addLayerIfReady = async () => {
      if (layerRef.current || addingRef.current) return;
      if (!map.getSource(config.sourceId)) return;
      addingRef.current = true;

      // Compile any inline JS profiles before the first synchronous rebuild
      if (!profilesEnsuredRef.current) {
        await ensureProfiles(effectiveConfig);
        profilesEnsuredRef.current = true;
      }

      const layerId = useLoft ? "3d-generic-loft" : "3d-generic";
      const customLayer = buildGenericLayer(effectiveConfig, rebuildFn, layerId);
      layerRef.current = customLayer;

      // Insert before fill-extrusion so trees render first and show through
      // semi-transparent buildings. Label occlusion relies on depthWrite + depth range restore.
      const styleLayers = map.getStyle().layers ?? [];
      const firstExtrusion = styleLayers.find(
        (l) => l.type === "fill-extrusion"
      );
      try {
        map.addLayer(customLayer, firstExtrusion?.id);
        register3dLayer(map, customLayer);

        if (effectiveConfig.useStencilOcclusion) {
          // Stencil occlusion: intercept gl.disable(GL_STENCIL_TEST) during the
          // translucent render pass. Instead of disabling stencil, switch to the
          // tree-mask test so symbols behind trees are rejected.
          const canvas = map.getCanvas();
          const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
          if (gl) {
            const painter = (map as any).painter;
            const origDisable = gl.disable.bind(gl);
            origGlDisableRef.current = origDisable;
            gl.disable = ((cap: number) => {
              if (cap === gl.STENCIL_TEST && painter?.renderPass === "translucent") {
                gl.stencilFunc(gl.NOTEQUAL, 0x80, 0x80);
                gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
                gl.stencilMask(0x00);
                return;
              }
              origDisable(cap);
            }) as typeof gl.disable;
          }
        } else {
          // Fallback: dual-pass overlay (re-renders trees after symbols)
          const oId = layerId + "-overlay";
          const overlay = buildOverlayLayer(customLayer, oId);
          map.addLayer(overlay);
          overlayIdRef.current = oId;
        }
      } catch (err) {
        console.warn("[3D-SELECT] addLayer failed:", err);
        layerRef.current = null;
      } finally {
        addingRef.current = false;
      }
    };

    const trySync = async () => {
      await addLayerIfReady();
      if (!layerRef.current || !map.getSource(config.sourceId)) return;

      const result = syncGenericLayerFromSource(
        map,
        layerRef.current,
        radiusMix
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

    // Force rebuild when terrain is toggled so elevation is applied/removed
    const handleTerrain = () => {
      trySync();
    };
    map.on("terrain", handleTerrain);

    // Re-add layer after background style change (style swap removes custom layers)
    const handleStyleData = () => {
      if (layerRef.current && !map.getLayer(layerRef.current.id)) {
        overlayIdRef.current = null;
        layerRef.current = null;
        addingRef.current = false;
        trySync();
      }
    };
    map.on("styledata", handleStyleData);

    // Sync immediately if the map is already idle
    if (map.isStyleLoaded()) {
      trySync();
    } else {
      map.once("idle", trySync);
    }

    return () => {
      map.off("moveend", trySync);
      map.off("sourcedata", handleSourceData);
      map.off("terrain", handleTerrain);
      map.off("styledata", handleStyleData);
      if (perfRef) {
        perfRef.current = EMPTY_PERF;
      }
    };
  }, [map, useLoft, radiusMix, config, effectiveConfig, perfRef]);

  return null;
}
