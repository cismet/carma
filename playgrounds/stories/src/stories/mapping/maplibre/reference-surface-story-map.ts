import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";

import type { buildRasterDemTerrainRuntime } from "@carma-mapping/engines/maplibre/terrain";
import type { ThreeTilesRuntime } from "@carma-mapping/engines/maplibre";

import { createWuppertalStoryStyle } from "./maplibre-story-style";
import type { Gcg2016ShaderField } from "./reference-gcg2016-field";

type TerrainRuntime = ReturnType<typeof buildRasterDemTerrainRuntime>;

export type ReferenceSurfaceStoryDiagnostics = {
  panelLabel?: string;
  map?: MapLibreMap;
  terrain?: TerrainRuntime;
  mesh?: ThreeTilesRuntime;
  gcg2016?: Gcg2016ShaderField;
  projectTerrainComparisonPoint?: (
    longitude: number,
    latitude: number,
    normalHeightMeters: number
  ) => {
    raw: readonly [x: number, y: number];
    corrected: readonly [x: number, y: number];
    deltaPixels: number;
    undulationMeters: number;
    visible: boolean;
  };
};

type ReferenceDiagnosticsWindow = typeof window & {
  __carmaReferenceSurfacesMap?: MapLibreMap;
  __carmaReferenceSurfaces?: ReferenceSurfaceStoryDiagnostics;
  __carmaReferenceSurfacesPanels?: Record<
    string,
    ReferenceSurfaceStoryDiagnostics
  >;
};

const isIgnorableMapError = (message: string | undefined) =>
  !message ||
  message === "__publicField is not defined" ||
  message === "Ge is not defined" ||
  message.startsWith(
    "AJAXError:  (400): https://geodaten.metropoleruhr.de/spw2"
  );

type ReferenceMapOptions = Readonly<{
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
  fovDegrees: number;
  lockCamera?: boolean;
  showTerrain: boolean;
  terrainAppearance: "viridis" | "basemap" | "pixel-error";
  panelLabel?: string;
  onMapReady?: (map: MapLibreMap) => void | (() => void);
}>;

export const useReferenceSurfaceStoryMap = (options: ReferenceMapOptions) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sharedLayerOriginRef = useRef<[number, number] | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [styleReady, setStyleReady] = useState(false);
  useEffect(() => {
    if (map) return options.onMapReady?.(map);
    return undefined;
  }, [map, options.onMapReady]);
  const [viewAngles, setViewAngles] = useState({
    pitch: options.pitch,
    fov: options.fovDegrees,
    bearing: options.bearing,
    aspect: 1,
  });
  return {
    containerRef,
    sharedLayerOriginRef,
    mapRef,
    map,
    setMap,
    styleReady,
    setStyleReady,
    viewAngles,
    setViewAngles,
  };
};

export const useReferenceSurfaceMapLifecycle = (
  diagnosticId: string,
  diagnosticRef: { current: ReferenceSurfaceStoryDiagnostics },
  options: ReferenceMapOptions,
  state: ReturnType<typeof useReferenceSurfaceStoryMap>
) => {
  const {
    containerRef,
    sharedLayerOriginRef,
    mapRef,
    setMap,
    setStyleReady,
    setViewAngles,
  } = state;
  const storyDiagnostics = () => diagnosticRef.current;
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const style = createWuppertalStoryStyle("stadtplan");
    if (!(options.showTerrain && options.terrainAppearance === "basemap")) {
      style.layers.forEach((layer) => {
        layer.layout = { ...layer.layout, visibility: "none" };
      });
    }
    const instance = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [options.longitude, options.latitude],
      zoom: options.zoom,
      pitch: options.pitch,
      bearing: options.bearing,
      maxPitch: 89.9,
      centerClampedToGround: false,
      attributionControl: false,
      canvasContextAttributes: { antialias: true },
      interactive: !options.lockCamera,
    });
    if (!options.lockCamera) {
      instance.addControl(
        new maplibregl.NavigationControl({ showZoom: true, showCompass: true }),
        "top-right"
      );
    }
    const onLoad = () => setStyleReady(true);
    const onStyleProgress = () => {
      // Custom geometry only needs the style graph, not every unrelated WMTS
      // download to finish. Otherwise a missing basemap blocks reference planes.
      if (instance.getStyle()) setStyleReady(true);
    };
    const onError = (event: { error?: Error }) => {
      if (!isIgnorableMapError(event.error?.message)) {
        console.warn("[MapLibre Three reference surfaces]", event.error);
      }
    };
    instance.on("load", onLoad);
    instance.on("style.load", onLoad);
    instance.on("idle", onLoad);
    instance.on("styledata", onStyleProgress);
    instance.on("render", onStyleProgress);
    instance.on("error", onError);
    const syncViewAngles = () =>
      setViewAngles({
        pitch: instance.getPitch(),
        fov: instance.getVerticalFieldOfView(),
        bearing: instance.getBearing(),
        aspect:
          instance.getCanvas().clientWidth /
          Math.max(1, instance.getCanvas().clientHeight),
      });
    instance.on("move", syncViewAngles);
    instance.on("resize", syncViewAngles);
    syncViewAngles();
    instance.triggerRepaint();
    mapRef.current = instance;
    sharedLayerOriginRef.current = [options.longitude, options.latitude];
    const diagnostics = storyDiagnostics();
    diagnostics.map = instance;
    diagnostics.panelLabel = options.panelLabel;
    const diagnosticWindow = window as ReferenceDiagnosticsWindow;
    (diagnosticWindow.__carmaReferenceSurfacesPanels ??= {})[diagnosticId] =
      diagnostics;
    // Compatibility alias for old single-panel probes; paired probes use the
    // registry. Cleanup must never delete another live panel's diagnostics.
    diagnosticWindow.__carmaReferenceSurfaces = diagnostics;
    diagnosticWindow.__carmaReferenceSurfacesMap = instance;
    setMap(instance);
    const resizeFrame = window.requestAnimationFrame(() => {
      instance.resize();
      // An in-memory Storybook style can finish between Map construction and
      // the load listener above, especially across Vite hot reloads.
      if (instance.getStyle()) setStyleReady(true);
    });

    return () => {
      window.cancelAnimationFrame(resizeFrame);
      instance.off("load", onLoad);
      instance.off("style.load", onLoad);
      instance.off("idle", onLoad);
      instance.off("styledata", onStyleProgress);
      instance.off("render", onStyleProgress);
      instance.off("error", onError);
      instance.off("move", syncViewAngles);
      instance.off("resize", syncViewAngles);
      setMap(null);
      setStyleReady(false);
      instance.remove();
      mapRef.current = null;
      sharedLayerOriginRef.current = null;
      delete diagnosticWindow.__carmaReferenceSurfacesPanels?.[diagnosticId];
      const remaining = Object.values(
        diagnosticWindow.__carmaReferenceSurfacesPanels ?? {}
      ).at(-1);
      if (diagnosticWindow.__carmaReferenceSurfaces === diagnostics)
        diagnosticWindow.__carmaReferenceSurfaces = remaining;
      if (diagnosticWindow.__carmaReferenceSurfacesMap === instance)
        diagnosticWindow.__carmaReferenceSurfacesMap = remaining?.map;
    };
    // Camera args update below without rebuilding the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
