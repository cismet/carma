import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  BoundingSphere,
  Color,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  flyToBoundingSphereExtent,
  type Cartesian2,
  type CesiumTerrainProvider,
  type Scene,
} from "@carma/cesium";

import { type Easing as EasingFunction } from "@carma-commons/math";
import type { ModelConfig } from "@carma-commons/resources";
import type {
  CarmaConf3D,
  CarmaMapLibreFeatureProperties,
  FeatureInfo,
} from "@carma/types";
import {
  createExtrudedWallVisualizer,
  createGroundPolylineVisualizer,
  type ExtrudedWallVisualizer,
  type GroundPolylineVisualizer,
} from "@carma-mapping/engines/cesium";
import type { Feature, Polygon } from "geojson";

import {
  useAdhocFeatureDisplay,
  type AdhocFeature,
} from "../components/AdhocFeatureDisplayProvider";
import {
  buildAdhocFeatureInfo,
  getAdhocAccentColor,
  getGeoJsonFromFeature,
  getPolygonFromGeoJson,
  isAdhocModelFeature,
} from "../utils/adhoc-feature-utils";
import { useCesiumModels } from "./useCesiumModels";

export type UseAdhocCesiumFeatureDisplayOptions = {
  isCesiumEnabled: boolean;
  getScene: () => Scene | null | undefined;
  getTerrainProvider: () => CesiumTerrainProvider | null | undefined;
  getSurfaceProvider: () => CesiumTerrainProvider | null | undefined;
  baseModels?: ModelConfig[];
  wallOpacity?: {
    selected: number;
    default: number;
  };
  wallOpacityAnimation?: {
    durationMs?: number;
    easing?: EasingFunction;
  };
  selectionLineWidthPixels?: number;
  onFeatureInfoChange?: (feature: FeatureInfo | null) => void;
};

export type UseAdhocCesiumFeatureDisplayResult = {
  getAdhocBoundingSphere: (feature: FeatureInfo) => BoundingSphere | null;
};

const getCarmaConf3D = (feature: AdhocFeature): CarmaConf3D | undefined => {
  const properties = feature.properties as
    | CarmaMapLibreFeatureProperties
    | undefined;
  return properties?.carmaConf3D;
};

const getWallHeights = (feature: AdhocFeature): number[] | undefined => {
  const metadata = feature.metadata;
  if (!metadata) return undefined;
  const wallHeights = metadata.wallHeights;
  if (Array.isArray(wallHeights)) {
    return wallHeights as number[];
  }
  return undefined;
};

const getDefaultWallHeight = (feature: AdhocFeature): number => {
  const metadata = feature.metadata;
  if (!metadata) return 15;
  const wallHeightMeters = metadata.wallHeightMeters;
  if (typeof wallHeightMeters === "number") {
    return wallHeightMeters;
  }
  return 15;
};

const shouldUseGroundPolyline = (feature: AdhocFeature): boolean => {
  const carmaConf3D = getCarmaConf3D(feature);
  if (
    typeof carmaConf3D?.groundPolyline === "object" &&
    carmaConf3D.groundPolyline !== null
  ) {
    return true;
  }
  if (carmaConf3D?.groundPolyline === true) return true;
  if (carmaConf3D?.wall === false) return true;
  return false;
};

const isRehydratedFeature = (feature: AdhocFeature): boolean => {
  const metadata = feature.metadata as { rehydrated?: boolean } | undefined;
  return Boolean(metadata?.rehydrated);
};

const getGroundPolylineOptions = (
  feature: AdhocFeature
): { lineColor?: string; opacity?: number; lineWidth?: number } => {
  const carmaConf3D = getCarmaConf3D(feature);
  const groundPolyline = carmaConf3D?.groundPolyline;
  if (typeof groundPolyline === "object" && groundPolyline !== null) {
    return {
      lineColor: groundPolyline.lineColor,
      opacity: groundPolyline.opacity,
      lineWidth: groundPolyline.lineWidth,
    };
  }
  return {};
};

export const useAdhocCesiumFeatureDisplay = (
  options: UseAdhocCesiumFeatureDisplayOptions
): UseAdhocCesiumFeatureDisplayResult => {
  const {
    baseModels = [],
    getScene,
    getSurfaceProvider,
    getTerrainProvider,
    isCesiumEnabled,
    wallOpacity,
    wallOpacityAnimation,
    selectionLineWidthPixels,
    onFeatureInfoChange,
  } = options;

  const {
    features: adhocFeatures,
    selectedFeatureId,
    setSelectedFeatureId,
    shouldFocusSelected,
    setShouldFocusSelected,
  } = useAdhocFeatureDisplay();

  // Single ref for all visualizers - union type for different visualizer implementations
  const visualizersRef = useRef<
    Map<string, ExtrudedWallVisualizer | GroundPolylineVisualizer>
  >(new Map());
  // Track which features have been successfully registered to Cesium
  const [registeredFeatureIds, setRegisteredFeatureIds] = useState<Set<string>>(
    new Set()
  );
  // Refs to access current values in async code without triggering re-renders
  const selectedFeatureIdRef = useRef<string | null>(null);
  const shouldFocusSelectedRef = useRef<boolean>(false);
  selectedFeatureIdRef.current = selectedFeatureId ?? null;
  shouldFocusSelectedRef.current = shouldFocusSelected;

  // Track pending selection/focus requests for features that don't have visualizers yet
  const pendingSelectionRef = useRef<{
    featureId: string;
    shouldFocus: boolean;
  } | null>(null);

  // Compute which geojson features need visualizers
  const geojsonFeatureIds = useMemo(() => {
    return new Set(
      adhocFeatures
        .filter((feature) => !!getGeoJsonFromFeature(feature))
        .map((feature) => feature.id)
    );
  }, [adhocFeatures]);

  // Check if there are features that need to be synced to Cesium
  const needsSync = useMemo(() => {
    if (!isCesiumEnabled) return false;
    // Check if any feature ID is not yet registered
    for (const id of geojsonFeatureIds) {
      if (!registeredFeatureIds.has(id)) return true;
    }
    // Check if any registered ID is no longer in features (needs cleanup)
    for (const id of registeredFeatureIds) {
      if (!geojsonFeatureIds.has(id)) return true;
    }
    return false;
  }, [geojsonFeatureIds, isCesiumEnabled, registeredFeatureIds]);

  const adhocModelConfigs = useMemo(() => {
    return adhocFeatures.filter(isAdhocModelFeature).map((feature) => {
      const { data } = feature;
      const metadataTitle = feature.metadata?.title;
      const fallbackTitle =
        typeof metadataTitle === "string" ? metadataTitle : feature.id;

      const baseProperties = feature.properties ?? { title: fallbackTitle };

      const modelConfig: ModelConfig = {
        position: {
          longitude: data.position.lon,
          latitude: data.position.lat,
          altitude: data.position.height ?? 0,
        },
        orientation: {
          heading: data.heading,
          pitch: data.pitch,
          roll: data.roll,
        },
        model: {
          uri: data.url,
          ...(data.scale !== undefined ? { scale: data.scale } : {}),
        },
        properties: baseProperties,
        name: feature.id,
      };

      return modelConfig;
    });
  }, [adhocFeatures]);

  const cesiumModelConfigs = useMemo(
    () => [...baseModels, ...adhocModelConfigs],
    [adhocModelConfigs, baseModels]
  );

  const hasCesiumModels = cesiumModelConfigs.length > 0;

  const useCesiumModelOptions = useMemo(() => {
    return {
      models: cesiumModelConfigs,
      enabled: isCesiumEnabled && hasCesiumModels,
      selection: {
        enabled: isCesiumEnabled && hasCesiumModels,
        deselectOnEmptyClick: true,
        onSelect: (feature: unknown) => {
          const featureInfo = feature as FeatureInfo | null;
          onFeatureInfoChange?.(featureInfo);
          if (typeof featureInfo?.id === "string") {
            setSelectedFeatureId(featureInfo.id);
          }
        },
      },
    };
  }, [
    cesiumModelConfigs,
    hasCesiumModels,
    isCesiumEnabled,
    onFeatureInfoChange,
    setSelectedFeatureId,
  ]);

  useCesiumModels(useCesiumModelOptions);

  // Main effect: sync visualizers with features when needed
  useEffect(() => {
    console.log("[CESIUM|SYNC] Effect running, needsSync:", needsSync);
    if (!needsSync) return;

    const scene = getScene();
    console.log("[CESIUM|SYNC] Scene ready:", !!scene && !scene.isDestroyed());
    if (!scene || scene.isDestroyed()) {
      // Scene not ready yet, poll for it
      const interval = setInterval(() => {
        const s = getScene();
        if (s && !s.isDestroyed()) {
          clearInterval(interval);
          // Trigger re-render to run sync
          setRegisteredFeatureIds((prev) => new Set(prev));
        }
      }, 100);
      return () => clearInterval(interval);
    }

    // Clean up visualizers for removed features
    for (const id of registeredFeatureIds) {
      if (!geojsonFeatureIds.has(id)) {
        const visualizer = visualizersRef.current.get(id);
        if (visualizer) {
          visualizer.destroy();
          visualizersRef.current.delete(id);
        }
      }
    }

    // Get features that need visualizers created
    const featuresToCreate = adhocFeatures.filter(
      (feature) =>
        getGeoJsonFromFeature(feature) && !registeredFeatureIds.has(feature.id)
    );

    console.log("[CESIUM|SYNC] featuresToCreate:", featuresToCreate.length);
    console.log("[CESIUM|SYNC] adhocFeatures count:", adhocFeatures.length);

    if (featuresToCreate.length === 0) {
      // Just update registered IDs to match current features
      setRegisteredFeatureIds(geojsonFeatureIds);
      scene.requestRender();
      return;
    }

    let cancelled = false;

    const createVisualizers = async () => {
      const newlyRegistered: string[] = [];

      for (const feature of featuresToCreate) {
        if (cancelled) break;

        const geojson = getGeoJsonFromFeature(feature);
        console.log(
          "[CESIUM|SYNC] Creating visualizer for:",
          feature.id,
          "has geojson:",
          !!geojson
        );
        const polygon = getPolygonFromGeoJson(geojson);
        if (!polygon?.[0]) continue;

        // Create GeoJSON Feature for the visualizer
        const geoJsonFeature: Feature<Polygon> = {
          type: "Feature",
          properties: feature.properties ?? {},
          geometry: {
            type: "Polygon",
            coordinates: polygon,
          },
        };

        const terrainProvider = getTerrainProvider();
        const surfaceProvider = getSurfaceProvider();

        const useGroundPolyline = shouldUseGroundPolyline(feature);

        let visualizer: ExtrudedWallVisualizer | GroundPolylineVisualizer;

        if (useGroundPolyline) {
          const gpOptions = getGroundPolylineOptions(feature);
          visualizer = createGroundPolylineVisualizer(
            feature.id,
            geoJsonFeature,
            {
              lineColor:
                gpOptions.lineColor ??
                getAdhocAccentColor(feature) ??
                "#3A7CEB",
              opacity: gpOptions.opacity ?? wallOpacity?.default ?? 0.7,
              lineWidth: gpOptions.lineWidth ?? 5,
            }
          );
        } else {
          const wallHeights = getWallHeights(feature);
          const defaultWallHeight = getDefaultWallHeight(feature);

          visualizer = createExtrudedWallVisualizer(
            feature.id,
            geoJsonFeature,
            terrainProvider ?? undefined,
            {
              wallColor: getAdhocAccentColor(feature) ?? "#3A7CEB",
              opacity: wallOpacity?.default ?? 0.7,
              selectedOpacity: wallOpacity?.selected ?? 0.4,
              selectionLineWidth: selectionLineWidthPixels,
              selectionColor: Color.YELLOW,
              wallHeight: wallHeights ?? defaultWallHeight,
              animationDurationMs: wallOpacityAnimation?.durationMs ?? 200,
              animationEasing: wallOpacityAnimation?.easing,
            }
          );
        }

        visualizersRef.current.set(feature.id, visualizer);

        try {
          await visualizer.attach(scene, () => scene.requestRender());
          newlyRegistered.push(feature.id);
          console.log("[CESIUM|SYNC] Visualizer attached:", feature.id);
        } catch {
          // Visualizer failed to attach, remove from map
          visualizersRef.current.delete(feature.id);
          continue;
        }

        if (cancelled) {
          visualizer.destroy();
          visualizersRef.current.delete(feature.id);
          break;
        }

        // Set initial selection state and potentially fly to
        const pending = pendingSelectionRef.current;
        if (pending?.featureId === feature.id) {
          console.log(
            "[CESIUM|SYNC] Applying pending selection/focus for:",
            feature.id
          );
          visualizer.selected = true;

          const featureInfo = buildAdhocFeatureInfo(feature);
          onFeatureInfoChange?.(featureInfo);

          if (pending.shouldFocus) {
            const isRehydrated = isRehydratedFeature(feature);
            if (!isRehydrated) {
              const sphere = visualizer.getBoundingSphere();
              if (sphere) {
                flyToBoundingSphereExtent(scene.camera, sphere, {
                  minRange: 50,
                  paddingFactor: 1.1,
                });
              }
            }
            // Clear the global focus flag since we handled it (or skipped on rehydrate)
            setShouldFocusSelected(false);
          }
          pendingSelectionRef.current = null;
        } else if (selectedFeatureIdRef.current === feature.id) {
          visualizer.selected = true;

          const featureInfo = buildAdhocFeatureInfo(feature);
          onFeatureInfoChange?.(featureInfo);

          // If focus was requested, fly to this feature
          if (shouldFocusSelectedRef.current) {
            const isRehydrated = isRehydratedFeature(feature);
            if (!isRehydrated) {
              const sphere = visualizer.getBoundingSphere();
              if (sphere) {
                flyToBoundingSphereExtent(scene.camera, sphere, {
                  minRange: 50,
                  paddingFactor: 1.1,
                });
              }
            }
            setShouldFocusSelected(false);
          }
        } else if (!isRehydratedFeature(feature)) {
          setSelectedFeatureId(feature.id);
          visualizer.selected = true;
          const featureInfo = buildAdhocFeatureInfo(feature);
          onFeatureInfoChange?.(featureInfo);
          const sphere = visualizer.getBoundingSphere();
          if (sphere) {
            flyToBoundingSphereExtent(scene.camera, sphere, {
              minRange: 50,
              paddingFactor: 1.1,
            });
          }
          setShouldFocusSelected(false);
        }
      }

      if (!cancelled) {
        // Update registered IDs with successfully attached visualizers
        setRegisteredFeatureIds((prev) => {
          const next = new Set(prev);
          // Remove IDs no longer in features
          for (const id of prev) {
            if (!geojsonFeatureIds.has(id)) {
              next.delete(id);
            }
          }
          // Add newly registered IDs
          for (const id of newlyRegistered) {
            next.add(id);
          }
          return next;
        });
        scene.requestRender();
      }
    };

    void createVisualizers();

    return () => {
      cancelled = true;
    };
    // Note: selectedFeatureId/shouldFocusSelected intentionally excluded via refs - handled by separate effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    adhocFeatures,
    geojsonFeatureIds,
    getScene,
    getSurfaceProvider,
    getTerrainProvider,
    needsSync,
    registeredFeatureIds,
    selectionLineWidthPixels,
    setShouldFocusSelected,
    wallOpacity?.default,
    wallOpacity?.selected,
    wallOpacityAnimation?.durationMs,
    wallOpacityAnimation?.easing,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      visualizersRef.current.forEach((visualizer) => visualizer.destroy());
      visualizersRef.current.clear();
    };
  }, []);

  // Consolidated selection effect: handles selection state, focus, and infobox
  useEffect(() => {
    if (!isCesiumEnabled) return;

    // Update all visualizer selection states
    visualizersRef.current.forEach((visualizer, id) => {
      visualizer.selected = id === selectedFeatureId;
    });

    // Build and notify feature info
    const selectedFeature = selectedFeatureId
      ? adhocFeatures.find((f) => f.id === selectedFeatureId)
      : null;
    const featureInfo = selectedFeature
      ? buildAdhocFeatureInfo(selectedFeature)
      : null;
    onFeatureInfoChange?.(featureInfo);

    // If feature doesn't have a visualizer yet, queue pending selection/focus
    if (selectedFeatureId && !visualizersRef.current.has(selectedFeatureId)) {
      pendingSelectionRef.current = {
        featureId: selectedFeatureId,
        shouldFocus: shouldFocusSelected,
      };
      console.log(
        "[CESIUM|SELECT] Queued pending selection for:",
        selectedFeatureId,
        "focus:",
        shouldFocusSelected
      );
    }

    // Handle fly-to if requested (only reset flag if fly-to actually happens)
    if (shouldFocusSelected && selectedFeatureId) {
      const scene = getScene();
      const visualizer = visualizersRef.current.get(selectedFeatureId);
      const sphere = visualizer?.getBoundingSphere();
      if (scene && !scene.isDestroyed() && sphere) {
        flyToBoundingSphereExtent(scene.camera, sphere, {
          minRange: 50,
          paddingFactor: 1.1,
        });
        setShouldFocusSelected(false);
      }
      // If visualizer doesn't exist yet, keep flag true - main effect will handle it
    }
  }, [
    adhocFeatures,
    getScene,
    isCesiumEnabled,
    onFeatureInfoChange,
    selectedFeatureId,
    setShouldFocusSelected,
    shouldFocusSelected,
  ]);

  // Click handler
  useEffect(() => {
    console.log(
      "[CESIUM|CLICK] Effect running, isCesiumEnabled:",
      isCesiumEnabled
    );
    if (!isCesiumEnabled) return;

    const scene = getScene();
    console.log("[CESIUM|CLICK] Scene:", scene?.isDestroyed?.());
    if (!scene || scene.isDestroyed()) return;

    console.log("[CESIUM|CLICK] Setting up click handler");
    const handler = new ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((event: { position: Cartesian2 }) => {
      const picked = scene.pick(event.position);
      const pickedId = picked?.id;

      console.log("[CESIUM|CLICK] picked:", picked, "pickedId:", pickedId);
      console.log(
        "[CESIUM|CLICK] visualizers count:",
        visualizersRef.current.size
      );
      console.log("[CESIUM|CLICK] visualizer IDs:", [
        ...visualizersRef.current.keys(),
      ]);

      // Check if any visualizer was picked
      for (const [id, visualizer] of visualizersRef.current) {
        const isPicked = visualizer.isPicked(pickedId);
        console.log(`[CESIUM|CLICK] visualizer ${id} isPicked:`, isPicked);
        if (isPicked) {
          if (id === selectedFeatureId) {
            setSelectedFeatureId(null);
            onFeatureInfoChange?.(null);
            return;
          }

          setShouldFocusSelected(false);
          setSelectedFeatureId(id);
          const adhocFeature = adhocFeatures.find((f) => f.id === id);
          const info = adhocFeature
            ? buildAdhocFeatureInfo(adhocFeature)
            : null;
          if (info) {
            onFeatureInfoChange?.(info);
          }
          return;
        }
      }

      // No visualizer picked - deselect if not a model pick
      const isModelPick =
        typeof (picked as { id?: { model?: unknown } } | undefined)?.id
          ?.model !== "undefined";
      if (!isModelPick) {
        setShouldFocusSelected(false);
        setSelectedFeatureId(null);
        onFeatureInfoChange?.(null);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
    };
  }, [
    adhocFeatures,
    getScene,
    isCesiumEnabled,
    onFeatureInfoChange,
    selectedFeatureId,
    setSelectedFeatureId,
    setShouldFocusSelected,
    registeredFeatureIds,
  ]);

  // Get bounding sphere for a feature
  const getAdhocBoundingSphere = useCallback((feature: FeatureInfo) => {
    if (typeof feature.id !== "string") return null;
    const visualizer = visualizersRef.current.get(feature.id);
    return visualizer?.getBoundingSphere() ?? null;
  }, []);

  return { getAdhocBoundingSphere };
};
