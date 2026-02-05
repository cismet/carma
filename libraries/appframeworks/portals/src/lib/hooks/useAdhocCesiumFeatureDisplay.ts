import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  BoundingSphere,
  Cartesian3,
  Color,
  Model,
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
  addElevationsToGeoJson,
  createExtrudedWallVisualizer,
  createGroundPolylineVisualizer,
  geoJsonHasMissingElevations,
  type ExtrudedWallVisualizer,
  type GeoJsonElevationOptions,
  type GroundPolylineVisualizer,
} from "@carma-mapping/engines/cesium";
import type { Feature, FeatureCollection, Polygon } from "geojson";

import {
  useAdhocFeatureDisplay,
  type AdhocFeature,
} from "../components/AdhocFeatureDisplayProvider";
import {
  buildAdhocFeatureInfo,
  getAdhocAccentColor,
  getGeoJsonFromFeature,
  getPolygonFromGeoJson,
} from "../utils/adhoc-feature-utils";
import { useCesiumModels } from "./useCesiumModels";

export type UseAdhocCesiumFeatureDisplayOptions = {
  isCesiumEnabled: boolean;
  getScene: () => Scene | null | undefined;
  getTerrainProvider: () => CesiumTerrainProvider | null | undefined;
  baseModels?: ModelConfig[];
  elevationSampling?: GeoJsonElevationOptions;
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
  if (properties?.carmaConf3D) {
    return properties.carmaConf3D;
  }

  const geojson = getGeoJsonFromFeature(feature);
  const geojsonFeature =
    geojson?.type === "FeatureCollection" ? geojson.features[0] : geojson;
  const geojsonProperties = geojsonFeature?.properties as
    | CarmaMapLibreFeatureProperties
    | undefined;
  return geojsonProperties?.carmaConf3D;
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
  if (!metadata) return 2;
  const wallHeightMeters = metadata.wallHeightMeters;
  if (typeof wallHeightMeters === "number") {
    return wallHeightMeters;
  }
  return 2;
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

const getModelConfig = (feature: AdhocFeature) => {
  const carmaConf3D = getCarmaConf3D(feature);
  return carmaConf3D?.model;
};

const shouldShowFootprintIn3d = (feature: AdhocFeature): boolean => {
  const modelConfig = getModelConfig(feature);
  return modelConfig?.showFootprintIn3d !== false;
};

const getModelProperties = (feature: AdhocFeature): FeatureInfo["properties"] => {
  const metadataTitle =
    typeof feature.metadata?.title === "string"
      ? feature.metadata?.title
      : undefined;
  const fallbackTitle = metadataTitle ?? feature.id;
  const geojson = getGeoJsonFromFeature(feature);
  const geojsonFeature =
    geojson?.type === "FeatureCollection" ? geojson.features[0] : geojson;
  const geojsonProperties = geojsonFeature?.properties as
    | FeatureInfo["properties"]
    | undefined;
  const baseProperties =
    feature.properties ?? geojsonProperties ?? { title: fallbackTitle };
  const title =
    typeof baseProperties.title === "string" ? baseProperties.title : fallbackTitle;
  return {
    ...baseProperties,
    title,
  };
};

const getBoundingSphereFromGeojson = (
  geojson: Feature | FeatureCollection
): BoundingSphere | null => {
  const polygon = getPolygonFromGeoJson(geojson);
  if (!polygon) return null;

  const points: Cartesian3[] = [];
  for (const ring of polygon) {
    for (const coord of ring) {
      if (!coord || coord.length < 2) continue;
      points.push(Cartesian3.fromDegrees(coord[0], coord[1], coord[2] ?? 0));
    }
  }

  if (points.length === 0) return null;
  return BoundingSphere.fromPoints(points);
};

const getGeojsonBoundingSphere = (
  feature: AdhocFeature
): BoundingSphere | null => {
  const geojson = getGeoJsonFromFeature(feature);
  if (!geojson) return null;
  return getBoundingSphereFromGeojson(geojson);
};

export const useAdhocCesiumFeatureDisplay = (
  options: UseAdhocCesiumFeatureDisplayOptions
): UseAdhocCesiumFeatureDisplayResult => {
  const {
    baseModels = [],
    elevationSampling,
    getScene,
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
    updateFeatureMetadata,
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
  const pendingElevationSamplesRef = useRef<Set<string>>(new Set());

  const getFeatureBoundingSphere = useCallback(
    (featureId: string): BoundingSphere | null => {
      const visualizer = visualizersRef.current.get(featureId);
      if (visualizer) {
        return visualizer.getBoundingSphere();
      }

      const adhocFeature = adhocFeatures.find(
        (feature) => feature.id === featureId
      );
      if (!adhocFeature) return null;
      const geojson = getGeoJsonFromFeature(adhocFeature);
      if (!geojson) return null;

      const terrainProvider = getTerrainProvider();
      const overrideExisting = elevationSampling?.overrideExisting ?? false;
      const shouldSampleElevations =
        !!terrainProvider &&
        (overrideExisting ||
          (!adhocFeature.metadata?.hasElevations &&
            geoJsonHasMissingElevations(geojson)));

      if (shouldSampleElevations && !adhocFeature.metadata?.elevatedGeoJson) {
        return null;
      }

      return getGeojsonBoundingSphere(adhocFeature);
    },
    [adhocFeatures, elevationSampling?.overrideExisting, getTerrainProvider]
  );

  // Compute which geojson features need visualizers
  const geojsonFeatureIds = useMemo(() => {
    return new Set(
      adhocFeatures
        .filter(
          (feature) =>
            shouldShowFootprintIn3d(feature) && !!getGeoJsonFromFeature(feature)
        )
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
    return adhocFeatures.flatMap((feature) => {
      const modelConfig = getModelConfig(feature);
      if (!modelConfig) return [];

      const baseProperties = getModelProperties(feature);

      return [
        {
          position: {
            longitude: modelConfig.position.lon,
            latitude: modelConfig.position.lat,
            altitude: modelConfig.position.height ?? 0,
          },
          orientation: {
            heading: modelConfig.heading,
            pitch: modelConfig.pitch,
            roll: modelConfig.roll,
          },
          model: {
            uri: modelConfig.url,
            ...(modelConfig.scale !== undefined
              ? { scale: modelConfig.scale }
              : {}),
          },
          properties: baseProperties,
          name: feature.id,
        } satisfies ModelConfig,
      ];
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
        selectedId: selectedFeatureId,
        onSelect: (feature: unknown) => {
          const featureInfo = feature as FeatureInfo | null;
          if (!featureInfo || typeof featureInfo.id !== "string") {
            onFeatureInfoChange?.(null);
            setSelectedFeatureId(null);
            return;
          }

          const adhocFeature = adhocFeatures.find(
            (item) => item.id === featureInfo.id
          );
          const resolvedInfo = adhocFeature
            ? buildAdhocFeatureInfo(adhocFeature)
            : null;
          onFeatureInfoChange?.(resolvedInfo ?? featureInfo);
          setSelectedFeatureId(featureInfo.id);
        },
      },
    };
  }, [
    adhocFeatures,
    cesiumModelConfigs,
    hasCesiumModels,
    isCesiumEnabled,
    onFeatureInfoChange,
    selectedFeatureId,
    setSelectedFeatureId,
  ]);

  useCesiumModels(useCesiumModelOptions);

  // Main effect: sync visualizers with features when needed
  useEffect(() => {
    console.debug("[CESIUM|SYNC] Effect running, needsSync:", needsSync);
    if (!needsSync) return;

    const scene = getScene();
    console.debug("[CESIUM|SYNC] Scene ready:", !!scene && !scene.isDestroyed());
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
        geojsonFeatureIds.has(feature.id) &&
        !registeredFeatureIds.has(feature.id)
    );

    console.debug("[CESIUM|SYNC] featuresToCreate:", featuresToCreate.length);
    console.debug("[CESIUM|SYNC] adhocFeatures count:", adhocFeatures.length);

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
        console.debug(
          "[CESIUM|SYNC] Creating visualizer for:",
          feature.id,
          "has geojson:",
          !!geojson
        );
        if (!geojson) continue;

        let resolvedGeojson = geojson;
        const terrainProvider = getTerrainProvider();
        const overrideExisting = elevationSampling?.overrideExisting ?? false;
        const shouldSampleElevations =
          !!terrainProvider &&
          (overrideExisting ||
            (!feature.metadata?.hasElevations &&
              geoJsonHasMissingElevations(geojson)));

        if (shouldSampleElevations) {
          const elevationResult = await addElevationsToGeoJson(
            geojson,
            terrainProvider,
            elevationSampling
          );

          if (cancelled) break;

          if (elevationResult.hasAugmentedElevation) {
            resolvedGeojson = elevationResult.geojson;
            updateFeatureMetadata({
              id: feature.id,
              metadata: {
                elevatedGeoJson: elevationResult.geojson,
                hasElevations: true,
              },
            });
          }
        }

        const polygon = getPolygonFromGeoJson(resolvedGeojson);
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
          console.debug("[CESIUM|SYNC] Visualizer attached:", feature.id);
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
          console.debug(
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
    getTerrainProvider,
    needsSync,
    registeredFeatureIds,
    elevationSampling,
    updateFeatureMetadata,
    selectionLineWidthPixels,
    setShouldFocusSelected,
    wallOpacity?.default,
    wallOpacity?.selected,
    wallOpacityAnimation?.durationMs,
    wallOpacityAnimation?.easing,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    const visualizers = visualizersRef.current;
    return () => {
      visualizers.forEach((visualizer) => visualizer.destroy());
      visualizers.clear();
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
      const shouldQueueSelection =
        !!selectedFeature &&
        shouldShowFootprintIn3d(selectedFeature) &&
        !!getGeoJsonFromFeature(selectedFeature);
      if (shouldQueueSelection) {
        pendingSelectionRef.current = {
          featureId: selectedFeatureId,
          shouldFocus: shouldFocusSelected,
        };
        console.debug(
          "[CESIUM|SELECT] Queued pending selection for:",
          selectedFeatureId,
          "focus:",
          shouldFocusSelected
        );
      }
    }

    let cancelled = false;

    const runFlyTo = async () => {
      if (!shouldFocusSelected || !selectedFeatureId) return;
      const scene = getScene();
      if (!scene || scene.isDestroyed()) return;

      const sphere = getFeatureBoundingSphere(selectedFeatureId);
      if (sphere) {
        flyToBoundingSphereExtent(scene.camera, sphere, {
          minRange: 50,
          paddingFactor: 1.1,
        });
        setShouldFocusSelected(false);
        return;
      }

      const selectedFeature = adhocFeatures.find(
        (feature) => feature.id === selectedFeatureId
      );
      if (!selectedFeature || shouldShowFootprintIn3d(selectedFeature)) {
        return;
      }

      const geojson = getGeoJsonFromFeature(selectedFeature);
      if (!geojson) return;

      const terrainProvider = getTerrainProvider();
      const overrideExisting = elevationSampling?.overrideExisting ?? false;
      const shouldSampleElevations =
        !!terrainProvider &&
        (overrideExisting ||
          (!selectedFeature.metadata?.hasElevations &&
            geoJsonHasMissingElevations(geojson)));

      if (!shouldSampleElevations || selectedFeature.metadata?.elevatedGeoJson) {
        const fallbackSphere = getBoundingSphereFromGeojson(geojson);
        if (fallbackSphere) {
          flyToBoundingSphereExtent(scene.camera, fallbackSphere, {
            minRange: 50,
            paddingFactor: 1.1,
          });
          setShouldFocusSelected(false);
        }
        return;
      }

      const pendingSamples = pendingElevationSamplesRef.current;
      if (pendingSamples.has(selectedFeature.id)) return;
      pendingSamples.add(selectedFeature.id);

      try {
        const elevationResult = await addElevationsToGeoJson(
          geojson,
          terrainProvider,
          elevationSampling
        );

        if (cancelled) return;

        if (elevationResult.hasAugmentedElevation) {
          updateFeatureMetadata({
            id: selectedFeature.id,
            metadata: {
              elevatedGeoJson: elevationResult.geojson,
              hasElevations: true,
            },
          });
        }

        const flyToGeojson = elevationResult.hasAugmentedElevation
          ? elevationResult.geojson
          : geojson;
        const elevatedSphere = getBoundingSphereFromGeojson(flyToGeojson);
        if (elevatedSphere) {
          flyToBoundingSphereExtent(scene.camera, elevatedSphere, {
            minRange: 50,
            paddingFactor: 1.1,
          });
          setShouldFocusSelected(false);
        }
      } finally {
        pendingSamples.delete(selectedFeature.id);
      }
    };

    void runFlyTo();

    return () => {
      cancelled = true;
    };
  }, [
    adhocFeatures,
    elevationSampling,
    getFeatureBoundingSphere,
    getScene,
    getTerrainProvider,
    isCesiumEnabled,
    onFeatureInfoChange,
    selectedFeatureId,
    setShouldFocusSelected,
    shouldFocusSelected,
    updateFeatureMetadata,
  ]);

  // Click handler
  useEffect(() => {
    console.debug(
      "[CESIUM|CLICK] Effect running, isCesiumEnabled:",
      isCesiumEnabled
    );
    if (!isCesiumEnabled) return;

    const scene = getScene();
    console.debug("[CESIUM|CLICK] Scene:", scene?.isDestroyed?.());
    if (!scene || scene.isDestroyed()) return;

    console.debug("[CESIUM|CLICK] Setting up click handler");
    const handler = new ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((event: { position: Cartesian2 }) => {
      const picked = scene.pick(event.position);
      const pickedId = picked?.id;

      console.debug("[CESIUM|CLICK] picked:", picked, "pickedId:", pickedId);
      console.debug(
        "[CESIUM|CLICK] visualizers count:",
        visualizersRef.current.size
      );
      console.debug("[CESIUM|CLICK] visualizer IDs:", [
        ...visualizersRef.current.keys(),
      ]);

      // Check if any visualizer was picked
      for (const [id, visualizer] of visualizersRef.current) {
        const isPicked = visualizer.isPicked(pickedId);
        console.debug(`[CESIUM|CLICK] visualizer ${id} isPicked:`, isPicked);
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
      const isModelPickId =
        (pickedId as { is3dModel?: boolean } | undefined)?.is3dModel === true;
      const isModelPickPrimitive =
        (picked as { primitive?: unknown } | undefined)?.primitive instanceof
        Model;
      const isModelPick = isModelPickId || isModelPickPrimitive;
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
    return getFeatureBoundingSphere(feature.id);
  }, [getFeatureBoundingSphere]);

  return { getAdhocBoundingSphere };
};
