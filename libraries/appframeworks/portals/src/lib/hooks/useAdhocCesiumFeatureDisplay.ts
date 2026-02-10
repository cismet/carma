import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  BoundingSphere,
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
  createGroundPolygonVisualizer,
  createGroundPolylineVisualizer,
  getBoundingSphereFromGeoJson,
  type ExtrudedWallVisualizer,
  type GeoJsonElevationOptions,
  type GroundPolygonVisualizer,
  type GroundPolylineVisualizer,
} from "@carma-mapping/engines/cesium";
import type { Feature, FeatureCollection } from "geojson";
import { extractRingsFromGeoJson } from "@carma/geo/utils";

import {
  useAdhocFeatureDisplay,
  type AdhocFeature,
} from "../components/AdhocFeatureDisplayProvider";
import {
  buildAdhocFeatureInfo,
  getAdhocAccentColor,
  getGeoJsonFromFeature,
} from "../utils/adhoc-feature-utils";
import { useCesiumModels } from "./useCesiumModels";

export type UseAdhocCesiumFeatureDisplayOptions = {
  isCesiumEnabled: boolean;
  getScene: () => Scene | null | undefined;
  getTerrainProvider: () => CesiumTerrainProvider | null | undefined;
  minFlyToRange?: number;
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

const normalizeCarmaConf3D = (feature: AdhocFeature): CarmaConf3D => {
  const carmaConf3D = getCarmaConf3D(feature);

  if (!carmaConf3D) {
    // No config = default wall and default draped ground polygon.
    return { wall: { height: 20 }, groundPolygon: true };
  }

  // Config exists - apply defaults for missing properties
  return {
    ...carmaConf3D,
    // wall: undefined -> false (explicitly disabled when config exists but wall not set)
    // wall: true -> { height: 20 }
    // wall: { height: 5 } -> preserved
    wall:
      carmaConf3D.wall === undefined
        ? false
        : carmaConf3D.wall === true
        ? { height: 20 }
        : carmaConf3D.wall,
    // Ground polygon is enabled by default for footprint visibility/picking.
    groundPolygon:
      carmaConf3D.groundPolygon === undefined
        ? true
        : carmaConf3D.groundPolygon,
  };
};

const isRehydratedFeature = (feature: AdhocFeature): boolean => {
  const metadata = feature.metadata as { rehydrated?: boolean } | undefined;
  return Boolean(metadata?.rehydrated);
};

const getModelConfig = (feature: AdhocFeature) => {
  const carmaConf3D = getCarmaConf3D(feature);
  return carmaConf3D?.model;
};

const shouldShowFootprintIn3d = (feature: AdhocFeature): boolean => {
  const modelConfig = getModelConfig(feature);
  return modelConfig?.showFootprintIn3d !== false;
};

const getModelProperties = (
  feature: AdhocFeature
): FeatureInfo["properties"] => {
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
  const baseProperties = feature.properties ??
    geojsonProperties ?? { title: fallbackTitle };
  const title =
    typeof baseProperties.title === "string"
      ? baseProperties.title
      : fallbackTitle;
  return {
    ...baseProperties,
    title,
  };
};

const getGeojsonBoundingSphere = (
  feature: AdhocFeature
): BoundingSphere | null => {
  const geojson =
    (feature.metadata?.flyToGeoJson as
      | Feature
      | FeatureCollection
      | undefined) ?? getGeoJsonFromFeature(feature);
  if (!geojson) return null;
  return getBoundingSphereFromGeoJson(geojson);
};

const getFeatureMetadataBoundingSphere = (
  feature: AdhocFeature
): BoundingSphere | null => {
  const candidate = feature.metadata?.flyToBoundingSphere;
  return candidate instanceof BoundingSphere ? candidate : null;
};

type SelectableGeoJsonFeature = {
  selectionId: string;
  geojson: Feature;
};

const getGeoJsonFeatureKey = (
  geojsonFeature: Feature,
  featureIndex: number
): string => {
  const id = geojsonFeature.id;
  if (typeof id === "string" || typeof id === "number") {
    return `id:${String(id)}`;
  }

  const propertiesId = (geojsonFeature.properties as { id?: unknown } | null)
    ?.id;
  if (typeof propertiesId === "string" || typeof propertiesId === "number") {
    return `id:${String(propertiesId)}`;
  }

  return `index:${featureIndex}`;
};

const extractSelectableGeoJsonFeatures = (
  id: string,
  geojson: Feature | FeatureCollection
): SelectableGeoJsonFeature[] => {
  const features =
    geojson.type === "FeatureCollection" ? geojson.features : [geojson];
  const selectionIdCounts = new Map<string, number>();

  return features.flatMap((geojsonFeature, featureIndex) => {
    if (!geojsonFeature?.geometry) return [];
    const geoJsonFeatureKey = getGeoJsonFeatureKey(
      geojsonFeature,
      featureIndex
    );
    const baseSelectionId = `${id}::${geoJsonFeatureKey}`;
    const count = selectionIdCounts.get(baseSelectionId) ?? 0;
    selectionIdCounts.set(baseSelectionId, count + 1);

    const selectionId =
      count === 0 ? baseSelectionId : `${baseSelectionId}::dup:${count}`;

    return [
      {
        selectionId,
        geojson: geojsonFeature,
      },
    ];
  });
};

const toSelectionIdSet = (
  id: string,
  geojson: Feature | FeatureCollection
): Set<string> =>
  new Set(
    extractSelectableGeoJsonFeatures(id, geojson).map(
      (geoJsonFeature) => geoJsonFeature.selectionId
    )
  );

const areEqualStringSets = (left: Set<string>, right: Set<string>): boolean => {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
};

const getGeoJsonForSelection = (
  feature: AdhocFeature
): Feature | FeatureCollection | null =>
  (feature.metadata?.flyToGeoJson as Feature | FeatureCollection | undefined) ??
  getGeoJsonFromFeature(feature);

const getSelectableGeoJsonFeature = (
  feature: AdhocFeature,
  selectionId: string | null
): Feature | null => {
  if (!selectionId) return null;
  const geojson = getGeoJsonForSelection(feature);
  if (!geojson) return null;
  const match = extractSelectableGeoJsonFeatures(feature.id, geojson).find(
    (geoJsonFeature) => geoJsonFeature.selectionId === selectionId
  );
  return match?.geojson ?? null;
};

const buildAdhocFeatureInfoForSelection = (
  feature: AdhocFeature,
  selectionId: string | null
): FeatureInfo | null => {
  const selectedGeoJsonFeature = getSelectableGeoJsonFeature(
    feature,
    selectionId
  );
  if (!selectedGeoJsonFeature) {
    return buildAdhocFeatureInfo(feature);
  }
  return buildAdhocFeatureInfo(feature, {
    geojsonFeature: selectedGeoJsonFeature,
  });
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
    minFlyToRange = 50,
    wallOpacity,
    wallOpacityAnimation,
    selectionLineWidthPixels,
    onFeatureInfoChange,
  } = options;

  const {
    features: adhocFeatures,
    selectedFeature: selectedAdhocFeature,
    setSelectedFeatureById,
    clearSelectedFeature,
    shouldFocusSelected,
    setShouldFocusSelected,
    updateFeatureMetadata,
  } = useAdhocFeatureDisplay();
  const selectedFeatureId = selectedAdhocFeature?.id ?? null;

  type VisualizerEntry = {
    id: string;
    selectionId: string;
    visualizer:
      | ExtrudedWallVisualizer
      | GroundPolylineVisualizer
      | GroundPolygonVisualizer;
  };

  // Single ref for all visualizers - now supports multiple visualizers per feature
  const visualizersRef = useRef<Map<string, VisualizerEntry>>(new Map());
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
    id: string;
    shouldFocus: boolean;
  } | null>(null);
  const pendingElevationSamplesRef = useRef<Set<string>>(new Set());
  const selectedSelectionIdByFeatureRef = useRef<Map<string, string>>(
    new Map()
  );

  const getFeatureBoundingSphere = useCallback(
    (id: string): BoundingSphere | null => {
      const adhocFeature = adhocFeatures.find((feature) => feature.id === id);
      if (!adhocFeature) return null;

      const metadataSphere = getFeatureMetadataBoundingSphere(adhocFeature);
      if (metadataSphere) {
        return metadataSphere;
      }

      const terrainProvider = getTerrainProvider();
      const overrideExisting = elevationSampling?.overrideExisting ?? false;
      const shouldSampleElevations =
        !!terrainProvider &&
        (overrideExisting ||
          !adhocFeature.metadata?.flyToGeoJson ||
          adhocFeature.metadata?.hasElevations !== true);

      if (shouldSampleElevations) {
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

    const getRegisteredSelectionIds = (id: string): Set<string> =>
      new Set(
        [...visualizersRef.current.values()]
          .filter((entry) => entry.id === id)
          .map((entry) => entry.selectionId)
          .filter(
            (selectionId): selectionId is string =>
              typeof selectionId === "string"
          )
      );

    // Check if any feature ID is not yet registered
    for (const id of geojsonFeatureIds) {
      if (!registeredFeatureIds.has(id)) return true;
    }
    // Check if any registered ID is no longer in features (needs cleanup)
    for (const id of registeredFeatureIds) {
      if (!geojsonFeatureIds.has(id)) return true;
    }

    // Check if existing visualizers no longer match current feature geometry shape.
    for (const feature of adhocFeatures) {
      if (
        !geojsonFeatureIds.has(feature.id) ||
        !registeredFeatureIds.has(feature.id)
      ) {
        continue;
      }

      const geojson = getGeoJsonFromFeature(feature);
      if (!geojson) continue;

      const expectedSelectionIds = toSelectionIdSet(feature.id, geojson);
      const registeredSelectionIds = getRegisteredSelectionIds(feature.id);
      if (!areEqualStringSets(expectedSelectionIds, registeredSelectionIds)) {
        return true;
      }
    }

    return false;
  }, [adhocFeatures, geojsonFeatureIds, isCesiumEnabled, registeredFeatureIds]);

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
            clearSelectedFeature();
            return;
          }

          const adhocFeature = adhocFeatures.find(
            (item) => item.id === featureInfo.id
          );
          const resolvedInfo = adhocFeature
            ? buildAdhocFeatureInfo(adhocFeature)
            : null;
          onFeatureInfoChange?.(resolvedInfo ?? featureInfo);
          setSelectedFeatureById(featureInfo.id);
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
    clearSelectedFeature,
    setSelectedFeatureById,
  ]);

  useCesiumModels(useCesiumModelOptions);

  // Main effect: sync visualizers with features when needed
  useEffect(() => {
    if (!needsSync) return;

    const scene = getScene();
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
    for (const [key, entry] of visualizersRef.current.entries()) {
      if (!geojsonFeatureIds.has(entry.id)) {
        entry.visualizer.destroy();
        visualizersRef.current.delete(key);
      }
    }

    const staleFeatureIds = new Set<string>();
    for (const feature of adhocFeatures) {
      if (
        !geojsonFeatureIds.has(feature.id) ||
        !registeredFeatureIds.has(feature.id)
      ) {
        continue;
      }

      const geojson = getGeoJsonFromFeature(feature);
      if (!geojson) continue;

      const expectedSelectionIds = toSelectionIdSet(feature.id, geojson);
      const registeredSelectionIds = new Set(
        [...visualizersRef.current.values()]
          .filter((entry) => entry.id === feature.id)
          .map((entry) => entry.selectionId)
          .filter(
            (selectionId): selectionId is string =>
              typeof selectionId === "string"
          )
      );

      if (!areEqualStringSets(expectedSelectionIds, registeredSelectionIds)) {
        staleFeatureIds.add(feature.id);
      }
    }

    if (staleFeatureIds.size > 0) {
      for (const [key, entry] of visualizersRef.current.entries()) {
        if (!staleFeatureIds.has(entry.id)) continue;
        entry.visualizer.destroy();
        visualizersRef.current.delete(key);
      }
      for (const id of staleFeatureIds) {
        selectedSelectionIdByFeatureRef.current.delete(id);
      }
    }

    const activeFeatureIds = new Set(
      [...visualizersRef.current.values()].map((entry) => entry.id)
    );
    for (const id of selectedSelectionIdByFeatureRef.current.keys()) {
      if (!activeFeatureIds.has(id)) {
        selectedSelectionIdByFeatureRef.current.delete(id);
      }
    }

    const effectiveRegisteredFeatureIds = new Set(registeredFeatureIds);
    for (const staleFeatureId of staleFeatureIds) {
      effectiveRegisteredFeatureIds.delete(staleFeatureId);
    }

    // Get features that need visualizers created
    const featuresToCreate = adhocFeatures.filter(
      (feature) =>
        geojsonFeatureIds.has(feature.id) &&
        !effectiveRegisteredFeatureIds.has(feature.id)
    );

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
        if (!geojson) continue;

        let resolvedGeojson =
          (feature.metadata?.flyToGeoJson as Feature | FeatureCollection) ??
          geojson;
        let elevatedGeoJson: Feature | FeatureCollection | null = null;
        const terrainProvider = getTerrainProvider();
        const overrideExisting = elevationSampling?.overrideExisting ?? false;
        const shouldSampleElevations =
          !!terrainProvider &&
          (overrideExisting ||
            !feature.metadata?.flyToGeoJson ||
            feature.metadata?.hasElevations !== true);

        if (shouldSampleElevations) {
          const elevationSamplingOptions: GeoJsonElevationOptions = {
            ...elevationSampling,
            overrideExisting: true,
          };
          const elevationResult = await addElevationsToGeoJson(
            geojson,
            terrainProvider,
            elevationSamplingOptions
          );

          if (cancelled) break;

          resolvedGeojson = elevationResult.geojson;
          elevatedGeoJson = elevationResult.geojson;
        }

        const flyToBoundingSphere =
          getBoundingSphereFromGeoJson(resolvedGeojson);
        if (
          shouldSampleElevations ||
          overrideExisting ||
          !feature.metadata?.flyToGeoJson ||
          !getFeatureMetadataBoundingSphere(feature)
        ) {
          updateFeatureMetadata({
            id: feature.id,
            metadata: {
              flyToGeoJson: resolvedGeojson,
              ...(flyToBoundingSphere
                ? { flyToBoundingSphere: flyToBoundingSphere }
                : {}),
              ...(shouldSampleElevations && elevatedGeoJson
                ? {
                    elevatedGeoJson: elevatedGeoJson,
                    hasElevations: true,
                  }
                : {}),
            },
          });
        }

        if (!flyToBoundingSphere) {
          console.warn(
            "[CESIUM|SYNC] No fly-to bounding sphere could be computed for feature",
            feature.id
          );
        }

        const geoJsonFeatures = extractSelectableGeoJsonFeatures(
          feature.id,
          resolvedGeojson
        );
        if (geoJsonFeatures.length === 0) continue;

        const visualizersToCreate: Array<{
          key: string;
          selectionId: string;
          visualizer:
            | ExtrudedWallVisualizer
            | GroundPolylineVisualizer
            | GroundPolygonVisualizer;
        }> = [];

        const config = normalizeCarmaConf3D(feature);

        for (const geoJsonFeature of geoJsonFeatures) {
          const polygonRings = extractRingsFromGeoJson(geoJsonFeature.geojson, {
            includeLineGeometries: false,
          });
          if (polygonRings.length === 0) {
            continue;
          }

          if (config.groundPolygon) {
            const gpOptions =
              typeof config.groundPolygon === "object"
                ? config.groundPolygon
                : {};
            const groundPolygonVisualizer = createGroundPolygonVisualizer(
              geoJsonFeature.selectionId,
              geoJsonFeature.geojson,
              {
                fillColor:
                  gpOptions.fillColor ??
                  getAdhocAccentColor(feature) ??
                  "#3A7CEB",
                ...(typeof gpOptions.opacity === "number"
                  ? { opacity: gpOptions.opacity }
                  : {}),
              }
            );
            visualizersToCreate.push({
              key: `${geoJsonFeature.selectionId}-polygon`,
              selectionId: geoJsonFeature.selectionId,
              visualizer: groundPolygonVisualizer,
            });
          }

          // Create ground polyline if explicitly configured
          if (config.groundPolyline) {
            const gpOptions =
              typeof config.groundPolyline === "object"
                ? config.groundPolyline
                : {};
            const groundPolylineVisualizer = createGroundPolylineVisualizer(
              geoJsonFeature.selectionId,
              geoJsonFeature.geojson,
              {
                lineColor:
                  gpOptions.lineColor ??
                  getAdhocAccentColor(feature) ??
                  "#3A7CEB",
                opacity: gpOptions.opacity ?? wallOpacity?.default ?? 0.7,
                lineWidth: gpOptions.lineWidth ?? 5,
              }
            );
            visualizersToCreate.push({
              key: `${geoJsonFeature.selectionId}-polyline`,
              selectionId: geoJsonFeature.selectionId,
              visualizer: groundPolylineVisualizer,
            });
          }

          // Create wall if enabled (object with height, not false)
          if (config.wall && typeof config.wall === "object") {
            const wallHeights = getWallHeights(feature);
            const wallHeight = wallHeights ?? config.wall.height ?? 20;

            const wallVisualizer = createExtrudedWallVisualizer(
              geoJsonFeature.selectionId,
              geoJsonFeature.geojson,
              {
                wallColor: getAdhocAccentColor(feature) ?? "#3A7CEB",
                opacity: wallOpacity?.default ?? 0.7,
                selectedOpacity: wallOpacity?.selected ?? 0.4,
                selectionLineWidth: selectionLineWidthPixels,
                selectionColor: config.wall.selectionColor
                  ? Color.fromCssColorString(config.wall.selectionColor)
                  : undefined,
                wallHeight: wallHeight,
                animationDurationMs: wallOpacityAnimation?.durationMs ?? 200,
                animationEasing: wallOpacityAnimation?.easing,
              }
            );
            visualizersToCreate.push({
              key: `${geoJsonFeature.selectionId}-wall`,
              selectionId: geoJsonFeature.selectionId,
              visualizer: wallVisualizer,
            });
          }
        }

        const uniqueSelectionIds = new Set(
          visualizersToCreate.map((entry) => entry.selectionId)
        );
        if (uniqueSelectionIds.size === 0) {
          continue;
        }

        for (const { key, selectionId, visualizer } of visualizersToCreate) {
          visualizersRef.current.set(key, {
            id: feature.id,
            selectionId,
            visualizer,
          });

          try {
            await visualizer.attach(scene, () => scene.requestRender());
            newlyRegistered.push(feature.id);
          } catch {
            // Visualizer failed to attach, remove from map
            visualizersRef.current.delete(key);
            continue;
          }

          if (cancelled) {
            visualizer.destroy();
            visualizersRef.current.delete(key);
            break;
          }
        }

        // Set initial selection state and potentially fly to
        const firstSelectionId = [...uniqueSelectionIds][0] ?? null;
        const selectedSelectionId =
          selectedSelectionIdByFeatureRef.current.get(feature.id) ??
          firstSelectionId;
        if (selectedSelectionId) {
          selectedSelectionIdByFeatureRef.current.set(
            feature.id,
            selectedSelectionId
          );
        }

        const pending = pendingSelectionRef.current;
        if (pending?.id === feature.id && selectedSelectionId) {
          for (const item of visualizersToCreate) {
            item.visualizer.selected = item.selectionId === selectedSelectionId;
          }

          const featureInfo = buildAdhocFeatureInfoForSelection(
            feature,
            selectedSelectionId
          );
          onFeatureInfoChange?.(featureInfo);

          if (pending.shouldFocus) {
            const isRehydrated = isRehydratedFeature(feature);
            if (!isRehydrated) {
              const sphere = flyToBoundingSphere;
              if (sphere) {
                flyToBoundingSphereExtent(scene.camera, sphere, {
                  minRange: minFlyToRange,
                  paddingFactor: 1.1,
                });
              }
            }
            // Clear the global focus flag since we handled it (or skipped on rehydrate)
            setShouldFocusSelected(false);
          }
          pendingSelectionRef.current = null;
        } else if (
          selectedFeatureIdRef.current === feature.id &&
          selectedSelectionId
        ) {
          for (const item of visualizersToCreate) {
            item.visualizer.selected = item.selectionId === selectedSelectionId;
          }

          const featureInfo = buildAdhocFeatureInfoForSelection(
            feature,
            selectedSelectionId
          );
          onFeatureInfoChange?.(featureInfo);

          // If focus was requested, fly to this feature
          if (shouldFocusSelectedRef.current) {
            const isRehydrated = isRehydratedFeature(feature);
            if (!isRehydrated) {
              const sphere = flyToBoundingSphere;
              if (sphere) {
                flyToBoundingSphereExtent(scene.camera, sphere, {
                  minRange: minFlyToRange,
                  paddingFactor: 1.1,
                });
              }
            }
            setShouldFocusSelected(false);
          }
        }
      }

      if (!cancelled) {
        // Update registered IDs with successfully attached visualizers
        setRegisteredFeatureIds((prev) => {
          const next = new Set(prev);
          for (const staleFeatureId of staleFeatureIds) {
            next.delete(staleFeatureId);
          }
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
      visualizers.forEach((entry) => entry.visualizer.destroy());
      visualizers.clear();
    };
  }, []);

  // Consolidated selection effect: handles selection state, focus, and infobox
  useEffect(() => {
    if (!isCesiumEnabled) return;

    const availableSelectionIds = selectedFeatureId
      ? new Set(
          [...visualizersRef.current.values()]
            .filter((entry) => entry.id === selectedFeatureId)
            .map((entry) => entry.selectionId)
        )
      : new Set<string>();
    const preferredSelectionId = selectedFeatureId
      ? selectedSelectionIdByFeatureRef.current.get(selectedFeatureId) ?? null
      : null;
    const selectedSelectionId =
      preferredSelectionId && availableSelectionIds.has(preferredSelectionId)
        ? preferredSelectionId
        : availableSelectionIds.values().next().value ?? null;
    if (selectedFeatureId && selectedSelectionId) {
      selectedSelectionIdByFeatureRef.current.set(
        selectedFeatureId,
        selectedSelectionId
      );
    }

    // Update all visualizer selection states
    visualizersRef.current.forEach((entry) => {
      entry.visualizer.selected =
        !!selectedSelectionId && entry.selectionId === selectedSelectionId;
    });

    // Build and notify feature info
    const selectedFeature = selectedFeatureId
      ? adhocFeatures.find((f) => f.id === selectedFeatureId)
      : null;
    const featureInfo = selectedFeature
      ? buildAdhocFeatureInfoForSelection(selectedFeature, selectedSelectionId)
      : null;
    onFeatureInfoChange?.(featureInfo);

    // If feature doesn't have a visualizer yet, queue pending selection/focus
    const hasVisualizerForSelectedFeature = selectedFeatureId
      ? [...visualizersRef.current.values()].some(
          (entry) => entry.id === selectedFeatureId
        )
      : false;
    if (selectedFeatureId && !hasVisualizerForSelectedFeature) {
      const shouldQueueSelection =
        !!selectedFeature &&
        shouldShowFootprintIn3d(selectedFeature) &&
        !!getGeoJsonFromFeature(selectedFeature);
      if (shouldQueueSelection) {
        pendingSelectionRef.current = {
          id: selectedFeatureId,
          shouldFocus: shouldFocusSelected,
        };
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
          minRange: minFlyToRange,
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

      const sourceGeojson = getGeoJsonFromFeature(selectedFeature);
      if (!sourceGeojson) return;
      const metadataFlyToGeoJson = selectedFeature.metadata?.flyToGeoJson as
        | Feature
        | FeatureCollection
        | undefined;
      const flyToGeojson = metadataFlyToGeoJson ?? sourceGeojson;

      const terrainProvider = getTerrainProvider();
      const overrideExisting = elevationSampling?.overrideExisting ?? false;
      const shouldSampleElevations =
        !!terrainProvider &&
        (overrideExisting ||
          !selectedFeature.metadata?.flyToGeoJson ||
          selectedFeature.metadata?.hasElevations !== true);

      if (!terrainProvider || !shouldSampleElevations) {
        const fallbackSphere =
          getFeatureMetadataBoundingSphere(selectedFeature) ??
          getBoundingSphereFromGeoJson(flyToGeojson);
        if (fallbackSphere) {
          if (
            !getFeatureMetadataBoundingSphere(selectedFeature) ||
            !selectedFeature.metadata?.flyToGeoJson
          ) {
            updateFeatureMetadata({
              id: selectedFeature.id,
              metadata: {
                flyToGeoJson: flyToGeojson,
                flyToBoundingSphere: fallbackSphere,
              },
            });
          }
          flyToBoundingSphereExtent(scene.camera, fallbackSphere, {
            minRange: minFlyToRange,
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
        const elevationSamplingOptions: GeoJsonElevationOptions = {
          ...elevationSampling,
          overrideExisting: true,
        };
        const elevationResult = await addElevationsToGeoJson(
          sourceGeojson,
          terrainProvider,
          elevationSamplingOptions
        );

        if (cancelled) return;

        const elevatedSphere = getBoundingSphereFromGeoJson(
          elevationResult.geojson
        );
        updateFeatureMetadata({
          id: selectedFeature.id,
          metadata: {
            flyToGeoJson: elevationResult.geojson,
            ...(elevatedSphere ? { flyToBoundingSphere: elevatedSphere } : {}),
            elevatedGeoJson: elevationResult.geojson,
            hasElevations: true,
          },
        });

        if (elevatedSphere) {
          flyToBoundingSphereExtent(scene.camera, elevatedSphere, {
            minRange: minFlyToRange,
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
    minFlyToRange,
    updateFeatureMetadata,
  ]);

  // Click handler
  useEffect(() => {
    if (!isCesiumEnabled) return;

    const scene = getScene();
    if (!scene || scene.isDestroyed()) return;

    const handler = new ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((event: { position: Cartesian2 }) => {
      const picked = scene.pick(event.position);
      const pickedId = picked?.id;

      // Check if any visualizer was picked
      for (const entry of visualizersRef.current.values()) {
        const isPicked = entry.visualizer.isPicked(pickedId);
        if (isPicked) {
          const currentSelectionId =
            selectedSelectionIdByFeatureRef.current.get(entry.id) ?? null;
          const isSameSelection =
            entry.id === selectedFeatureId &&
            currentSelectionId === entry.selectionId;

          if (isSameSelection) {
            selectedSelectionIdByFeatureRef.current.delete(entry.id);
            clearSelectedFeature();
            onFeatureInfoChange?.(null);
            return;
          }

          selectedSelectionIdByFeatureRef.current.set(
            entry.id,
            entry.selectionId
          );
          setShouldFocusSelected(false);
          const adhocFeature = adhocFeatures.find((f) => f.id === entry.id);
          const info = adhocFeature
            ? buildAdhocFeatureInfoForSelection(adhocFeature, entry.selectionId)
            : null;

          if (entry.id === selectedFeatureId) {
            visualizersRef.current.forEach((candidate) => {
              candidate.visualizer.selected =
                candidate.id === entry.id &&
                candidate.selectionId === entry.selectionId;
            });
            onFeatureInfoChange?.(info);
            scene.requestRender();
            return;
          }

          setSelectedFeatureById(entry.id);
          onFeatureInfoChange?.(info);
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
        if (selectedFeatureId) {
          selectedSelectionIdByFeatureRef.current.delete(selectedFeatureId);
        }
        setShouldFocusSelected(false);
        clearSelectedFeature();
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
    clearSelectedFeature,
    setSelectedFeatureById,
    setShouldFocusSelected,
    registeredFeatureIds,
  ]);

  // Get bounding sphere for a feature
  const getAdhocBoundingSphere = useCallback(
    (feature: FeatureInfo) => {
      if (typeof feature.id !== "string") return null;
      return getFeatureBoundingSphere(feature.id);
    },
    [getFeatureBoundingSphere]
  );

  return { getAdhocBoundingSphere };
};
