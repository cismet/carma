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
import type { FeatureInfo } from "@carma/types";
import {
  addElevationsToGeoJson,
  createExtrudedWallVisualizer,
  createGroundPolygonVisualizer,
  createGroundPolylineVisualizer,
  getBoundingSphereFromGeoJson,
  useCesiumModelManager,
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
  type SelectedAdhocFeature,
} from "../components/AdhocFeatureDisplayProvider";
import { DEFAULT_ADHOC_FEATURE_LAYER_ID } from "../constants/adhoc";
import {
  buildAdhocFeatureInfo,
  getAdhocAccentColor,
  getGeoJsonFromFeature,
} from "../utils/adhoc-feature-utils";
import {
  areEqualStringSets,
  buildAdhocFeatureInfoForSelection,
  extractSelectableGeoJsonFeatures,
  getFeatureMetadataBoundingSphere,
  getGeojsonBoundingSphere,
  getModelConfig,
  getWallHeights,
  isRehydratedFeature,
  normalizeCarmaConf3D,
  resolveGeoJsonFeatureIdForSelection,
  shouldShowFootprintIn3d,
  toGeoJsonFeatureId,
  toSelectionIdSet,
} from "../utils/adhoc-cesium-feature-display-utils";

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
  stageCesiumPrimitivesForTransition: () => Promise<void>;
};

type AdhocFeatureEntry = {
  feature: AdhocFeature;
  id: string;
  collectionId: string;
  layerId: string;
  key: string;
};

type VisualizerType = "ground-polygon" | "ground-polyline" | "extruded-wall";
type ElementType = "polygon" | "polyline" | "wall" | "model";

const FEATURE_KEY_SEPARATOR = "::";

const toAdhocFeatureKey = (selection: SelectedAdhocFeature): string =>
  `${selection.collectionId}${FEATURE_KEY_SEPARATOR}${selection.layerId}${FEATURE_KEY_SEPARATOR}${selection.id}`;

const parseAdhocFeatureKey = (
  featureKey: string
): SelectedAdhocFeature | null => {
  const parts = featureKey.split(FEATURE_KEY_SEPARATOR);
  if (parts.length === 2) {
    const [collectionId, id] = parts;
    if (!collectionId || !id) {
      return null;
    }
    return { collectionId, layerId: DEFAULT_ADHOC_FEATURE_LAYER_ID, id };
  }
  if (parts.length < 3) {
    return null;
  }
  const [collectionId, layerId, ...idParts] = parts;
  const id = idParts.join(FEATURE_KEY_SEPARATOR);
  if (!collectionId || !layerId || !id) {
    return null;
  }
  return { collectionId, layerId, id };
};

const buildModelFeatureInfo = (feature: AdhocFeature): FeatureInfo | null => {
  const geojson = getGeoJsonFromFeature(feature);
  const defaultGeoJsonFeature =
    geojson?.type === "FeatureCollection" ? geojson.features[0] : geojson;
  if (defaultGeoJsonFeature) {
    return buildAdhocFeatureInfo(feature, {
      geojsonFeature: defaultGeoJsonFeature,
    });
  }
  return buildAdhocFeatureInfo(feature);
};

const withPrimitiveMetadata = (
  featureInfo: FeatureInfo | null,
  context: {
    primitiveId: string | null;
    visualizerType?: VisualizerType | "model";
    elementType?: ElementType;
  }
): FeatureInfo | null => {
  if (!featureInfo) {
    return null;
  }
  const baseProperties = (featureInfo.properties ?? {}) as Record<
    string,
    unknown
  >;
  return {
    ...featureInfo,
    properties: {
      ...baseProperties,
      ...(context.primitiveId ? { primitiveId: context.primitiveId } : {}),
      ...(context.visualizerType
        ? { visualizerType: context.visualizerType }
        : {}),
      ...(context.elementType ? { elementType: context.elementType } : {}),
    } as FeatureInfo["properties"],
  };
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
    featureCollections,
    selectedFeature: selectedAdhocFeature,
    setSelectedFeatureById,
    clearSelectedFeature,
    shouldFocusSelected,
    setShouldFocusSelected,
    updateFeatureMetadata,
  } = useAdhocFeatureDisplay();

  const adhocFeatureEntries = useMemo<AdhocFeatureEntry[]>(
    () =>
      featureCollections.flatMap((collection) =>
        collection.features
          .filter((feature) => feature.metadata?.shouldRemove !== true)
          .map((feature) => ({
            feature,
            id: feature.id,
            collectionId: collection.id,
            layerId: feature.layerId ?? DEFAULT_ADHOC_FEATURE_LAYER_ID,
            key: toAdhocFeatureKey({
              id: feature.id,
              collectionId: collection.id,
              layerId: feature.layerId ?? DEFAULT_ADHOC_FEATURE_LAYER_ID,
            }),
          }))
      ),
    [featureCollections]
  );

  const adhocFeatureByKey = useMemo(
    () =>
      new Map(adhocFeatureEntries.map((entry) => [entry.key, entry] as const)),
    [adhocFeatureEntries]
  );

  const geoJsonSelectionLookup = useMemo(() => {
    const featureKeyByGeoJsonFeatureId = new Map<string, string>();
    const selectionIdByFeatureKeyAndGeoJsonFeatureId = new Map<
      string,
      Map<string, string>
    >();

    for (const entry of adhocFeatureEntries) {
      const geojson = getGeoJsonFromFeature(entry.feature);
      if (!geojson) {
        continue;
      }
      const selectionMap = new Map<string, string>();
      for (const selectable of extractSelectableGeoJsonFeatures(
        entry.key,
        geojson
      )) {
        const geoJsonFeatureId = toGeoJsonFeatureId(selectable.geojson);
        if (!geoJsonFeatureId) {
          continue;
        }
        if (!selectionMap.has(geoJsonFeatureId)) {
          selectionMap.set(geoJsonFeatureId, selectable.selectionId);
        }
        if (!featureKeyByGeoJsonFeatureId.has(geoJsonFeatureId)) {
          featureKeyByGeoJsonFeatureId.set(geoJsonFeatureId, entry.key);
        }
      }
      if (selectionMap.size > 0) {
        selectionIdByFeatureKeyAndGeoJsonFeatureId.set(entry.key, selectionMap);
      }
    }

    return {
      featureKeyByGeoJsonFeatureId,
      selectionIdByFeatureKeyAndGeoJsonFeatureId,
    };
  }, [adhocFeatureEntries]);

  const selectedFeatureKey = useMemo(() => {
    if (!selectedAdhocFeature) {
      return null;
    }
    const directKey = toAdhocFeatureKey(selectedAdhocFeature);
    if (adhocFeatureByKey.has(directKey)) {
      return directKey;
    }
    return (
      geoJsonSelectionLookup.featureKeyByGeoJsonFeatureId.get(
        selectedAdhocFeature.id
      ) ?? null
    );
  }, [adhocFeatureByKey, geoJsonSelectionLookup, selectedAdhocFeature]);

  const selectedFeaturePrimitiveId = useMemo(() => {
    if (!selectedAdhocFeature || !selectedFeatureKey) {
      return null;
    }
    return (
      geoJsonSelectionLookup.selectionIdByFeatureKeyAndGeoJsonFeatureId
        .get(selectedFeatureKey)
        ?.get(selectedAdhocFeature.id) ?? null
    );
  }, [geoJsonSelectionLookup, selectedAdhocFeature, selectedFeatureKey]);

  const resolveAdhocFeatureEntryByFeatureId = useCallback(
    (featureId: string): AdhocFeatureEntry | null => {
      if (selectedAdhocFeature?.id === featureId) {
        const selectedKey = toAdhocFeatureKey(selectedAdhocFeature);
        const fromSelected = adhocFeatureByKey.get(selectedKey);
        if (fromSelected) {
          return fromSelected;
        }
        const keyByGeoJsonFeatureId =
          geoJsonSelectionLookup.featureKeyByGeoJsonFeatureId.get(featureId);
        if (keyByGeoJsonFeatureId) {
          return adhocFeatureByKey.get(keyByGeoJsonFeatureId) ?? null;
        }
      }
      const matchingEntries = adhocFeatureEntries.filter(
        (entry) => entry.id === featureId
      );
      if (matchingEntries.length === 0) {
        const keyByGeoJsonFeatureId =
          geoJsonSelectionLookup.featureKeyByGeoJsonFeatureId.get(featureId);
        if (keyByGeoJsonFeatureId) {
          return adhocFeatureByKey.get(keyByGeoJsonFeatureId) ?? null;
        }
        return null;
      }
      if (matchingEntries.length === 1) {
        return matchingEntries[0];
      }
      const defaultLayerMatches = matchingEntries.filter(
        (entry) => entry.layerId === DEFAULT_ADHOC_FEATURE_LAYER_ID
      );
      if (defaultLayerMatches.length === 1) {
        return defaultLayerMatches[0];
      }
      const keyByGeoJsonFeatureId =
        geoJsonSelectionLookup.featureKeyByGeoJsonFeatureId.get(featureId);
      if (keyByGeoJsonFeatureId) {
        return adhocFeatureByKey.get(keyByGeoJsonFeatureId) ?? null;
      }
      return matchingEntries[0];
    },
    [
      adhocFeatureByKey,
      adhocFeatureEntries,
      geoJsonSelectionLookup,
      selectedAdhocFeature,
    ]
  );

  const resolveAdhocFeatureEntryFromPrimitiveId = useCallback(
    (primitiveId: string): AdhocFeatureEntry | null => {
      const entryFromKey = adhocFeatureByKey.get(primitiveId);
      if (entryFromKey) {
        return entryFromKey;
      }

      const parsedSelection = parseAdhocFeatureKey(primitiveId);
      if (parsedSelection) {
        const parsedKey = toAdhocFeatureKey(parsedSelection);
        const entryFromParsedSelection = adhocFeatureByKey.get(parsedKey);
        if (entryFromParsedSelection) {
          return entryFromParsedSelection;
        }
      }

      return resolveAdhocFeatureEntryByFeatureId(primitiveId);
    },
    [adhocFeatureByKey, resolveAdhocFeatureEntryByFeatureId]
  );

  type VisualizerEntry = {
    featureId: string;
    collectionId: string;
    layerId: string;
    featureKey: string;
    selectionId: string;
    primitiveId: string;
    visualizerType: VisualizerType;
    elementType: ElementType;
    visualizer:
      | ExtrudedWallVisualizer
      | GroundPolylineVisualizer
      | GroundPolygonVisualizer;
  };

  // Single ref for all visualizers - now supports multiple visualizers per feature
  const visualizersRef = useRef<Map<string, VisualizerEntry>>(new Map());
  // Track which features have been successfully registered to Cesium
  const [registeredFeatureKeys, setRegisteredFeatureKeys] = useState<
    Set<string>
  >(new Set());
  // Refs to access current values in async code without triggering re-renders
  const selectedFeatureKeyRef = useRef<string | null>(null);
  const shouldFocusSelectedRef = useRef<boolean>(false);
  selectedFeatureKeyRef.current = selectedFeatureKey ?? null;
  shouldFocusSelectedRef.current = shouldFocusSelected;

  // Track pending selection/focus requests for features that don't have visualizers yet
  const pendingSelectionRef = useRef<{
    featureKey: string;
    shouldFocus: boolean;
  } | null>(null);
  const pendingElevationSamplesRef = useRef<Set<string>>(new Set());
  const selectedPrimitiveIdByFeatureRef = useRef<Map<string, string>>(
    new Map()
  );
  const firstRenderedModelPrimitiveIdsRef = useRef<Set<string>>(new Set());
  const isStagingForTransitionRef = useRef<boolean>(false);
  const [modelAddedVersion, setModelAddedVersion] = useState(0);
  const [isStagingForTransition, setIsStagingForTransition] =
    useState<boolean>(false);
  const [hasActivatedCesiumOnce, setHasActivatedCesiumOnce] =
    useState<boolean>(false);
  const isCesiumRenderingEnabled =
    isCesiumEnabled || isStagingForTransition || hasActivatedCesiumOnce;

  const findModelPrimitiveByPrimitiveId = useCallback(
    (scene: Scene, primitiveId: string): Model | null => {
      const primitives = scene.primitives;
      const primitiveCount = primitives.length;
      for (let i = 0; i < primitiveCount; i += 1) {
        const primitive = primitives.get(i);
        if (!(primitive instanceof Model) || primitive.isDestroyed()) {
          continue;
        }
        const primitiveSelectionId = (
          primitive.id as { id?: unknown } | undefined
        )?.id;
        if (primitiveSelectionId === primitiveId) {
          return primitive;
        }
      }
      return null;
    },
    []
  );

  const onModelAddedToScene = useCallback(
    (primitiveId: string, primitive: Model) => {
      console.debug("[ADHOC|MODEL] onModelAdded callback", {
        primitiveId,
        primitiveDestroyed: primitive.isDestroyed(),
        shouldFocusSelected: shouldFocusSelectedRef.current,
        selectedFeatureKey: selectedFeatureKeyRef.current,
      });
      if (
        !primitiveId ||
        primitive.isDestroyed() ||
        !shouldFocusSelectedRef.current ||
        selectedFeatureKeyRef.current !== primitiveId
      ) {
        return;
      }
      // Bump version to rerun focus/selection effects that depend on model presence.
      console.debug("[ADHOC|MODEL] triggering modelAddedVersion rerun", {
        primitiveId,
      });
      setModelAddedVersion((prev) => prev + 1);
    },
    []
  );

  const getFeatureBoundingSphere = useCallback(
    (featureKey: string): BoundingSphere | null => {
      const entry = adhocFeatureByKey.get(featureKey);
      if (!entry) return null;
      const adhocFeature = entry.feature;

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
    [adhocFeatureByKey, elevationSampling?.overrideExisting, getTerrainProvider]
  );

  // Compute which geojson features need visualizers
  const geojsonFeatureKeys = useMemo(() => {
    return new Set(
      adhocFeatureEntries
        .filter(
          (entry) =>
            shouldShowFootprintIn3d(entry.feature) &&
            !!getGeoJsonFromFeature(entry.feature)
        )
        .map((entry) => entry.key)
    );
  }, [adhocFeatureEntries]);

  // Check if there are features that need to be synced to Cesium
  const needsSync = useMemo(() => {
    if (!isCesiumRenderingEnabled) return false;

    const getRegisteredPrimitiveIds = (featureKey: string): Set<string> =>
      new Set(
        [...visualizersRef.current.values()]
          .filter((entry) => entry.featureKey === featureKey)
          .map((entry) => entry.primitiveId)
          .filter(
            (primitiveId): primitiveId is string =>
              typeof primitiveId === "string"
          )
      );

    // Check if any feature ID is not yet registered
    for (const featureKey of geojsonFeatureKeys) {
      if (!registeredFeatureKeys.has(featureKey)) return true;
    }
    // Check if any registered ID is no longer in features (needs cleanup)
    for (const featureKey of registeredFeatureKeys) {
      if (!geojsonFeatureKeys.has(featureKey)) return true;
    }

    // Check if existing visualizers no longer match current feature geometry shape.
    for (const entry of adhocFeatureEntries) {
      if (
        !geojsonFeatureKeys.has(entry.key) ||
        !registeredFeatureKeys.has(entry.key)
      ) {
        continue;
      }

      const geojson = getGeoJsonFromFeature(entry.feature);
      if (!geojson) continue;

      const expectedPrimitiveIds = toSelectionIdSet(entry.key, geojson);
      const registeredPrimitiveIds = getRegisteredPrimitiveIds(entry.key);
      if (!areEqualStringSets(expectedPrimitiveIds, registeredPrimitiveIds)) {
        return true;
      }
    }

    return false;
  }, [
    adhocFeatureEntries,
    geojsonFeatureKeys,
    isCesiumRenderingEnabled,
    registeredFeatureKeys,
  ]);

  const needsSyncRef = useRef<boolean>(needsSync);
  needsSyncRef.current = needsSync;

  const adhocModelConfigs = useMemo(() => {
    return adhocFeatureEntries.flatMap((entry) => {
      const modelConfig = getModelConfig(entry.feature);
      if (!modelConfig) return [];

      const featureInfo = buildModelFeatureInfo(entry.feature);
      const baseProperties = featureInfo?.properties ?? {};
      const modelPropertiesWithoutId = {
        ...(baseProperties as Record<string, unknown>),
      };
      delete modelPropertiesWithoutId.id;

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
          properties: modelPropertiesWithoutId as FeatureInfo["properties"],
          name: entry.key,
        } satisfies ModelConfig,
      ];
    });
  }, [adhocFeatureEntries]);

  const cesiumModelConfigs = useMemo(
    () => [...baseModels, ...adhocModelConfigs],
    [adhocModelConfigs, baseModels]
  );

  const hasCesiumModels = cesiumModelConfigs.length > 0;

  const useCesiumModelOptions = useMemo(() => {
    return {
      models: cesiumModelConfigs,
      enabled: isCesiumRenderingEnabled && hasCesiumModels,
      selection: {
        enabled: isCesiumEnabled && hasCesiumModels,
        deselectOnEmptyClick: true,
        selectedId: selectedFeatureKey,
        onModelAdded: onModelAddedToScene,
        onModelFirstRendered: (primitiveId: string, primitive: Model) => {
          if (!primitiveId || primitive.isDestroyed()) {
            return;
          }
          firstRenderedModelPrimitiveIdsRef.current.add(primitiveId);
          console.debug("[ADHOC|MODEL] onModelFirstRendered callback", {
            primitiveId,
            modelReady: primitive.ready,
            primitiveDestroyed: primitive.isDestroyed(),
          });
        },
        onClearSelection: () => {
          onFeatureInfoChange?.(null);
          clearSelectedFeature();
        },
        onSelect: (feature: unknown) => {
          const featureInfo = feature as FeatureInfo;
          if (typeof featureInfo.id !== "string") {
            onFeatureInfoChange?.(null);
            clearSelectedFeature();
            return;
          }

          const entry = resolveAdhocFeatureEntryFromPrimitiveId(featureInfo.id);

          if (!entry) {
            onFeatureInfoChange?.(
              withPrimitiveMetadata(featureInfo, {
                primitiveId: featureInfo.id,
                visualizerType: "model",
                elementType: "model",
              })
            );
            return;
          }

          const resolvedInfo = withPrimitiveMetadata(
            buildModelFeatureInfo(entry.feature),
            {
              primitiveId: featureInfo.id,
              visualizerType: "model",
              elementType: "model",
            }
          );
          setSelectedFeatureById(entry.id, entry.collectionId, entry.layerId);
          onFeatureInfoChange?.(
            resolvedInfo ??
              withPrimitiveMetadata(featureInfo, {
                primitiveId: featureInfo.id,
                visualizerType: "model",
                elementType: "model",
              })
          );
        },
      },
    };
  }, [
    cesiumModelConfigs,
    hasCesiumModels,
    isCesiumRenderingEnabled,
    isCesiumEnabled,
    onFeatureInfoChange,
    selectedFeatureKey,
    clearSelectedFeature,
    onModelAddedToScene,
    resolveAdhocFeatureEntryFromPrimitiveId,
    setSelectedFeatureById,
  ]);

  useCesiumModelManager(useCesiumModelOptions);

  useEffect(() => {
    isStagingForTransitionRef.current = isStagingForTransition;
  }, [isStagingForTransition]);

  useEffect(() => {
    if (isCesiumEnabled && !hasActivatedCesiumOnce) {
      console.debug(
        "[ADHOC|STAGE] Cesium activated for first time, keeping primitives mounted across transitions"
      );
      setHasActivatedCesiumOnce(true);
    }
  }, [hasActivatedCesiumOnce, isCesiumEnabled]);

  useEffect(() => {
    if (isCesiumEnabled && isStagingForTransition) {
      console.debug(
        "[ADHOC|STAGE] transition reached Cesium mode, clearing staging flag"
      );
      setIsStagingForTransition(false);
    }
  }, [isCesiumEnabled, isStagingForTransition]);

  useEffect(() => {
    if (!isStagingForTransition || isCesiumEnabled) {
      return;
    }

    const timeoutId = setTimeout(() => {
      console.debug(
        "[ADHOC|STAGE] clearing stale staging flag after timeout (no 3D activation)"
      );
      setIsStagingForTransition(false);
    }, 15000);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isCesiumEnabled, isStagingForTransition]);

  const stageCesiumPrimitivesForTransition = useCallback(async () => {
    const initialScene = getScene();
    if (!initialScene || initialScene.isDestroyed()) {
      console.debug("[ADHOC|STAGE] skipped - Cesium scene not available");
      return;
    }

    const shouldEnableStagingFlag =
      !isCesiumEnabled &&
      !hasActivatedCesiumOnce &&
      !isStagingForTransitionRef.current;
    if (shouldEnableStagingFlag) {
      console.debug("[ADHOC|STAGE] enabling staging mode");
      setIsStagingForTransition(true);
    }

    const requiredModelPrimitiveIds = cesiumModelConfigs
      .map((config) => {
        const propertiesWithId = config.properties as
          | { id?: unknown }
          | undefined;
        if (typeof propertiesWithId?.id === "string" && propertiesWithId.id) {
          return propertiesWithId.id;
        }
        if (typeof config.name === "string" && config.name.length > 0) {
          return config.name;
        }
        if (
          typeof config.properties?.title === "string" &&
          config.properties.title.length > 0
        ) {
          return config.properties.title;
        }
        return config.model.uri;
      })
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const scene = getScene();
      if (!scene || scene.isDestroyed()) {
        break;
      }

      const hasAllRequiredModelPrimitives = requiredModelPrimitiveIds.every(
        (primitiveId) => {
          const primitive = findModelPrimitiveByPrimitiveId(scene, primitiveId);
          if (!primitive || primitive.isDestroyed()) {
            return false;
          }
          if (!primitive.ready) {
            return false;
          }
          return firstRenderedModelPrimitiveIdsRef.current.has(primitiveId);
        }
      );
      const visualizersSynced = !needsSyncRef.current;

      if (visualizersSynced && hasAllRequiredModelPrimitives) {
        console.debug("[ADHOC|STAGE] scene primitives staged", {
          visualizersSynced,
          modelPrimitiveCount: requiredModelPrimitiveIds.length,
        });
        return;
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });
    }

    console.warn("[ADHOC|STAGE] timeout while staging scene primitives", {
      visualizersSynced: !needsSyncRef.current,
      modelPrimitiveCount: requiredModelPrimitiveIds.length,
    });
  }, [
    cesiumModelConfigs,
    findModelPrimitiveByPrimitiveId,
    getScene,
    hasActivatedCesiumOnce,
    isCesiumEnabled,
  ]);

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
          setRegisteredFeatureKeys((prev) => new Set(prev));
        }
      }, 100);
      return () => clearInterval(interval);
    }

    // Clean up visualizers for removed features
    for (const [key, entry] of visualizersRef.current.entries()) {
      if (!geojsonFeatureKeys.has(entry.featureKey)) {
        entry.visualizer.destroy();
        visualizersRef.current.delete(key);
      }
    }

    const staleFeatureKeys = new Set<string>();
    for (const entry of adhocFeatureEntries) {
      if (
        !geojsonFeatureKeys.has(entry.key) ||
        !registeredFeatureKeys.has(entry.key)
      ) {
        continue;
      }

      const geojson = getGeoJsonFromFeature(entry.feature);
      if (!geojson) continue;

      const expectedSelectionIds = toSelectionIdSet(entry.key, geojson);
      const registeredSelectionIds = new Set(
        [...visualizersRef.current.values()]
          .filter((candidate) => candidate.featureKey === entry.key)
          .map((candidate) => candidate.selectionId)
          .filter(
            (selectionId): selectionId is string =>
              typeof selectionId === "string"
          )
      );

      if (!areEqualStringSets(expectedSelectionIds, registeredSelectionIds)) {
        staleFeatureKeys.add(entry.key);
      }
    }

    if (staleFeatureKeys.size > 0) {
      for (const [key, entry] of visualizersRef.current.entries()) {
        if (!staleFeatureKeys.has(entry.featureKey)) continue;
        entry.visualizer.destroy();
        visualizersRef.current.delete(key);
      }
      for (const featureKey of staleFeatureKeys) {
        selectedPrimitiveIdByFeatureRef.current.delete(featureKey);
      }
    }

    const activeFeatureKeys = new Set(
      [...visualizersRef.current.values()].map((entry) => entry.featureKey)
    );
    for (const featureKey of selectedPrimitiveIdByFeatureRef.current.keys()) {
      if (!activeFeatureKeys.has(featureKey)) {
        selectedPrimitiveIdByFeatureRef.current.delete(featureKey);
      }
    }

    const effectiveRegisteredFeatureKeys = new Set(registeredFeatureKeys);
    for (const staleFeatureKey of staleFeatureKeys) {
      effectiveRegisteredFeatureKeys.delete(staleFeatureKey);
    }

    // Get features that need visualizers created
    const featuresToCreate = adhocFeatureEntries.filter(
      (entry) =>
        geojsonFeatureKeys.has(entry.key) &&
        !effectiveRegisteredFeatureKeys.has(entry.key)
    );

    if (featuresToCreate.length === 0) {
      // Just update registered IDs to match current features
      setRegisteredFeatureKeys(geojsonFeatureKeys);
      scene.requestRender();
      return;
    }
    console.debug("[ADHOC|VIS] features queued for visualizer creation", {
      count: featuresToCreate.length,
      featureKeys: featuresToCreate.map((entry) => entry.key),
    });

    let cancelled = false;

    const createVisualizers = async () => {
      const newlyRegistered: string[] = [];

      for (const entry of featuresToCreate) {
        if (cancelled) break;

        const feature = entry.feature;
        const featureKey = entry.key;
        const featureId = entry.id;
        const collectionId = entry.collectionId;
        const layerId = entry.layerId;

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
            id: featureId,
            collectionId,
            layerId,
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
            featureKey
          );
        }

        const geoJsonFeatures = extractSelectableGeoJsonFeatures(
          featureKey,
          resolvedGeojson
        );
        if (geoJsonFeatures.length === 0) continue;

        const visualizersToCreate: Array<{
          key: string;
          selectionId: string;
          primitiveId: string;
          visualizerType: VisualizerType;
          elementType: ElementType;
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
              primitiveId: geoJsonFeature.selectionId,
              visualizerType: "ground-polygon",
              elementType: "polygon",
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
              primitiveId: geoJsonFeature.selectionId,
              visualizerType: "ground-polyline",
              elementType: "polyline",
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
              primitiveId: geoJsonFeature.selectionId,
              visualizerType: "extruded-wall",
              elementType: "wall",
              visualizer: wallVisualizer,
            });
          }
        }

        const uniqueSelectionIds = new Set(
          visualizersToCreate.map((entry) => entry.primitiveId)
        );
        if (uniqueSelectionIds.size === 0) {
          continue;
        }
        let attachedVisualizerCount = 0;
        let failedVisualizerCount = 0;

        for (const {
          key,
          selectionId,
          primitiveId,
          visualizerType,
          elementType,
          visualizer,
        } of visualizersToCreate) {
          visualizersRef.current.set(key, {
            featureId,
            collectionId,
            layerId,
            featureKey,
            selectionId,
            primitiveId,
            visualizerType,
            elementType,
            visualizer,
          });

          try {
            await visualizer.attach(scene, () => scene.requestRender());
            newlyRegistered.push(featureKey);
            attachedVisualizerCount += 1;
          } catch {
            // Visualizer failed to attach, remove from map
            visualizersRef.current.delete(key);
            failedVisualizerCount += 1;
            console.warn("[ADHOC|VIS] visualizer attach failed", {
              key,
              featureKey,
              selectionId,
            });
            continue;
          }

          if (cancelled) {
            visualizer.destroy();
            visualizersRef.current.delete(key);
            break;
          }
        }
        console.debug("[ADHOC|VIS] visualizer attach summary", {
          featureKey,
          requested: visualizersToCreate.length,
          attached: attachedVisualizerCount,
          failed: failedVisualizerCount,
          uniqueSelections: uniqueSelectionIds.size,
        });

        // Set initial selection state and potentially fly to
        const firstSelectionId = [...uniqueSelectionIds][0] ?? null;
        const selectedPrimitiveId =
          selectedPrimitiveIdByFeatureRef.current.get(featureKey) ??
          firstSelectionId;
        if (selectedPrimitiveId) {
          selectedPrimitiveIdByFeatureRef.current.set(
            featureKey,
            selectedPrimitiveId
          );
        }

        const pending = pendingSelectionRef.current;
        if (pending?.featureKey === featureKey && selectedPrimitiveId) {
          for (const item of visualizersToCreate) {
            item.visualizer.selected = item.primitiveId === selectedPrimitiveId;
          }

          const selectedVisualizerEntry =
            visualizersToCreate.find(
              (item) => item.primitiveId === selectedPrimitiveId
            ) ?? null;
          const selectionIdForInfo =
            selectedVisualizerEntry?.selectionId ?? selectedPrimitiveId;
          const featureInfo = withPrimitiveMetadata(
            buildAdhocFeatureInfoForSelection(
              feature,
              selectionIdForInfo,
              featureKey
            ),
            {
              primitiveId: selectedPrimitiveId,
              visualizerType: selectedVisualizerEntry?.visualizerType,
              elementType: selectedVisualizerEntry?.elementType,
            }
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
          selectedFeatureKeyRef.current === featureKey &&
          selectedPrimitiveId
        ) {
          for (const item of visualizersToCreate) {
            item.visualizer.selected = item.primitiveId === selectedPrimitiveId;
          }

          const selectedVisualizerEntry =
            visualizersToCreate.find(
              (item) => item.primitiveId === selectedPrimitiveId
            ) ?? null;
          const selectionIdForInfo =
            selectedVisualizerEntry?.selectionId ?? selectedPrimitiveId;
          const featureInfo = withPrimitiveMetadata(
            buildAdhocFeatureInfoForSelection(
              feature,
              selectionIdForInfo,
              featureKey
            ),
            {
              primitiveId: selectedPrimitiveId,
              visualizerType: selectedVisualizerEntry?.visualizerType,
              elementType: selectedVisualizerEntry?.elementType,
            }
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
        setRegisteredFeatureKeys((prev) => {
          const next = new Set(prev);
          for (const staleFeatureKey of staleFeatureKeys) {
            next.delete(staleFeatureKey);
          }
          // Remove IDs no longer in features
          for (const featureKey of prev) {
            if (!geojsonFeatureKeys.has(featureKey)) {
              next.delete(featureKey);
            }
          }
          // Add newly registered IDs
          for (const featureKey of newlyRegistered) {
            next.add(featureKey);
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
    // Note: selectedFeatureKey/shouldFocusSelected intentionally excluded via refs - handled by separate effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    adhocFeatureEntries,
    geojsonFeatureKeys,
    getScene,
    getTerrainProvider,
    needsSync,
    registeredFeatureKeys,
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

    const availablePrimitiveIds = selectedFeatureKey
      ? new Set(
          [...visualizersRef.current.values()]
            .filter((entry) => entry.featureKey === selectedFeatureKey)
            .map((entry) => entry.primitiveId)
        )
      : new Set<string>();
    const preferredPrimitiveId = selectedFeatureKey
      ? selectedFeaturePrimitiveId ??
        selectedPrimitiveIdByFeatureRef.current.get(selectedFeatureKey) ??
        null
      : null;
    const activePrimitiveId =
      preferredPrimitiveId && availablePrimitiveIds.has(preferredPrimitiveId)
        ? preferredPrimitiveId
        : availablePrimitiveIds.values().next().value ?? null;
    if (selectedFeatureKey && activePrimitiveId) {
      selectedPrimitiveIdByFeatureRef.current.set(
        selectedFeatureKey,
        activePrimitiveId
      );
    }

    // Update all visualizer selection states
    visualizersRef.current.forEach((entry) => {
      entry.visualizer.selected =
        !!activePrimitiveId &&
        entry.featureKey === selectedFeatureKey &&
        entry.primitiveId === activePrimitiveId;
    });

    // Build and notify feature info
    const selectedFeatureEntry = selectedFeatureKey
      ? adhocFeatureByKey.get(selectedFeatureKey) ?? null
      : null;
    const selectedFeature = selectedFeatureEntry?.feature ?? null;
    const selectedVisualizerEntry =
      selectedFeatureKey && activePrimitiveId
        ? [...visualizersRef.current.values()].find(
            (entry) =>
              entry.featureKey === selectedFeatureKey &&
              entry.primitiveId === activePrimitiveId
          ) ?? null
        : null;
    const selectionIdForInfo =
      selectedVisualizerEntry?.selectionId ?? activePrimitiveId;
    const featureInfo = selectedFeature
      ? withPrimitiveMetadata(
          buildAdhocFeatureInfoForSelection(
            selectedFeature,
            selectionIdForInfo,
            selectedFeatureKey ?? selectedFeature.id
          ),
          {
            primitiveId: activePrimitiveId,
            visualizerType: selectedVisualizerEntry?.visualizerType,
            elementType: selectedVisualizerEntry?.elementType,
          }
        )
      : null;
    onFeatureInfoChange?.(featureInfo);

    // If feature doesn't have a visualizer yet, queue pending selection/focus
    const hasVisualizerForSelectedFeature = selectedFeatureKey
      ? [...visualizersRef.current.values()].some(
          (entry) => entry.featureKey === selectedFeatureKey
        )
      : false;
    if (selectedFeatureKey && !hasVisualizerForSelectedFeature) {
      const shouldQueueSelection =
        !!selectedFeature &&
        shouldShowFootprintIn3d(selectedFeature) &&
        !!getGeoJsonFromFeature(selectedFeature);
      if (shouldQueueSelection) {
        pendingSelectionRef.current = {
          featureKey: selectedFeatureKey,
          shouldFocus: shouldFocusSelected,
        };
        console.debug("[ADHOC|SEL] queued pending visualizer selection", {
          featureKey: selectedFeatureKey,
          shouldFocus: shouldFocusSelected,
        });
      }
    }

    let cancelled = false;

    const runFlyTo = async () => {
      if (!shouldFocusSelected || !selectedFeatureKey) return;
      const scene = getScene();
      if (!scene || scene.isDestroyed()) return;
      console.debug("[ADHOC|FLY] runFlyTo start", {
        selectedFeatureKey,
        activePrimitiveId,
      });

      const sphere = getFeatureBoundingSphere(selectedFeatureKey);
      if (sphere) {
        console.debug("[ADHOC|FLY] using cached/metadata sphere", {
          selectedFeatureKey,
        });
        flyToBoundingSphereExtent(scene.camera, sphere, {
          minRange: minFlyToRange,
          paddingFactor: 1.1,
        });
        setShouldFocusSelected(false);
        return;
      }

      const selectedEntry = adhocFeatureByKey.get(selectedFeatureKey);
      if (!selectedEntry) {
        return;
      }
      const selectedFeature = selectedEntry.feature;

      const selectedModelConfig = getModelConfig(selectedFeature);
      if (selectedModelConfig) {
        console.debug("[ADHOC|FLY] model feature selected", {
          selectedFeatureKey,
          hasModelConfig: true,
        });
        const modelPrimitive = findModelPrimitiveByPrimitiveId(
          scene,
          selectedFeatureKey
        );
        if (!modelPrimitive) {
          // Model not in the scene yet. Wait for model registration callback
          // (`onModelAdded`) to rerun this effect.
          console.debug("[ADHOC|FLY] model primitive not in scene yet", {
            selectedFeatureKey,
          });
          return;
        }
        console.debug("[ADHOC|FLY] model primitive found", {
          selectedFeatureKey,
          modelReady: modelPrimitive.ready,
          modelDestroyed: modelPrimitive.isDestroyed(),
        });

        const flyToModelPrimitive = (): boolean => {
          if (
            cancelled ||
            scene.isDestroyed() ||
            modelPrimitive.isDestroyed() ||
            !modelPrimitive.ready
          ) {
            console.debug("[ADHOC|FLY] model not flyable yet", {
              selectedFeatureKey,
              cancelled,
              sceneDestroyed: scene.isDestroyed(),
              modelDestroyed: modelPrimitive.isDestroyed(),
              modelReady: modelPrimitive.ready,
            });
            return false;
          }
          const modelSphere = modelPrimitive.boundingSphere;
          if (!modelSphere) {
            console.debug("[ADHOC|FLY] model has no boundingSphere yet", {
              selectedFeatureKey,
            });
            return false;
          }
          console.debug("[ADHOC|FLY] flying to model primitive sphere", {
            selectedFeatureKey,
          });
          flyToBoundingSphereExtent(scene.camera, modelSphere, {
            minRange: minFlyToRange,
            paddingFactor: 1.1,
          });
          setShouldFocusSelected(false);
          return true;
        };

        if (flyToModelPrimitive()) {
          return;
        }

        const readyPromise = (
          modelPrimitive as unknown as { readyPromise?: Promise<unknown> }
        ).readyPromise;
        if (readyPromise) {
          console.debug("[ADHOC|FLY] awaiting model readyPromise", {
            selectedFeatureKey,
          });
          try {
            await readyPromise;
          } catch {
            console.warn("[ADHOC|FLY] model readyPromise rejected", {
              selectedFeatureKey,
            });
            return;
          }
          if (flyToModelPrimitive()) {
            return;
          }
        }
      }

      const sourceGeojson = getGeoJsonFromFeature(selectedFeature);
      if (!sourceGeojson) return;

      const metadataFlyToGeoJson = selectedFeature.metadata?.flyToGeoJson as
        | Feature
        | FeatureCollection
        | undefined;
      const flyToGeojson = metadataFlyToGeoJson ?? sourceGeojson;

      if (shouldShowFootprintIn3d(selectedFeature)) {
        console.debug("[ADHOC|FLY] falling back to footprint fly-to", {
          selectedFeatureKey,
        });
        const footprintSphere =
          getFeatureMetadataBoundingSphere(selectedFeature) ??
          getBoundingSphereFromGeoJson(flyToGeojson);
        if (!footprintSphere) {
          console.debug("[ADHOC|FLY] no footprint sphere available", {
            selectedFeatureKey,
          });
          return;
        }

        if (
          !getFeatureMetadataBoundingSphere(selectedFeature) ||
          !selectedFeature.metadata?.flyToGeoJson
        ) {
          updateFeatureMetadata({
            id: selectedEntry.id,
            collectionId: selectedEntry.collectionId,
            layerId: selectedEntry.layerId,
            metadata: {
              flyToGeoJson: flyToGeojson,
              flyToBoundingSphere: footprintSphere,
            },
          });
        }

        flyToBoundingSphereExtent(scene.camera, footprintSphere, {
          minRange: minFlyToRange,
          paddingFactor: 1.1,
        });
        setShouldFocusSelected(false);
        return;
      }

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
              id: selectedEntry.id,
              collectionId: selectedEntry.collectionId,
              layerId: selectedEntry.layerId,
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
      if (pendingSamples.has(selectedFeatureKey)) return;
      pendingSamples.add(selectedFeatureKey);

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
          id: selectedEntry.id,
          collectionId: selectedEntry.collectionId,
          layerId: selectedEntry.layerId,
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
        pendingSamples.delete(selectedFeatureKey);
      }
    };

    void runFlyTo();

    return () => {
      cancelled = true;
    };
  }, [
    adhocFeatureByKey,
    elevationSampling,
    getFeatureBoundingSphere,
    getScene,
    getTerrainProvider,
    isCesiumEnabled,
    onFeatureInfoChange,
    selectedFeatureKey,
    selectedFeaturePrimitiveId,
    setShouldFocusSelected,
    shouldFocusSelected,
    findModelPrimitiveByPrimitiveId,
    modelAddedVersion,
    minFlyToRange,
    updateFeatureMetadata,
  ]);

  // Click handler
  useEffect(() => {
    if (!isCesiumEnabled) return;

    let disposed = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let handler: ScreenSpaceEventHandler | null = null;

    const attachClickHandler = () => {
      if (disposed) return;

      const scene = getScene();
      if (!scene || scene.isDestroyed() || !scene.canvas) {
        retryTimeout = setTimeout(attachClickHandler, 100);
        return;
      }

      handler = new ScreenSpaceEventHandler(scene.canvas);
      handler.setInputAction((event: { position: Cartesian2 }) => {
        const picked = scene.pick(event.position);
        const pickedId = picked?.id;
        const pickedPrimitiveId =
          typeof pickedId === "string"
            ? pickedId
            : typeof (pickedId as { id?: unknown } | undefined)?.id === "string"
            ? (pickedId as { id?: string }).id ?? null
            : null;

        // Check if any visualizer was picked
        for (const entry of visualizersRef.current.values()) {
          const isPicked = entry.visualizer.isPicked(pickedId);
          if (isPicked) {
            const currentPrimitiveId =
              selectedPrimitiveIdByFeatureRef.current.get(entry.featureKey) ??
              null;
            const isSameSelection =
              entry.featureKey === selectedFeatureKey &&
              currentPrimitiveId === entry.primitiveId;

            if (isSameSelection) {
              selectedPrimitiveIdByFeatureRef.current.delete(entry.featureKey);
              clearSelectedFeature();
              onFeatureInfoChange?.(null);
              return;
            }

            selectedPrimitiveIdByFeatureRef.current.set(
              entry.featureKey,
              entry.primitiveId
            );
            setShouldFocusSelected(false);
            const adhocFeature = adhocFeatureByKey.get(
              entry.featureKey
            )?.feature;
            const selectedGeoJsonFeatureId = adhocFeature
              ? resolveGeoJsonFeatureIdForSelection(
                  adhocFeature,
                  entry.selectionId,
                  entry.featureKey
                )
              : null;
            const info = adhocFeature
              ? buildAdhocFeatureInfoForSelection(
                  adhocFeature,
                  entry.selectionId,
                  entry.featureKey
                )
              : null;

            const selectedFeatureId =
              selectedGeoJsonFeatureId ?? entry.featureId;

            if (entry.featureKey === selectedFeatureKey) {
              setSelectedFeatureById(
                selectedFeatureId,
                entry.collectionId,
                entry.layerId
              );
              visualizersRef.current.forEach((candidate) => {
                candidate.visualizer.selected =
                  candidate.featureKey === entry.featureKey &&
                  candidate.primitiveId === entry.primitiveId;
              });
              onFeatureInfoChange?.(
                withPrimitiveMetadata(info, {
                  primitiveId: entry.primitiveId,
                  visualizerType: entry.visualizerType,
                  elementType: entry.elementType,
                })
              );
              scene.requestRender();
              return;
            }

            setSelectedFeatureById(
              selectedFeatureId,
              entry.collectionId,
              entry.layerId
            );
            onFeatureInfoChange?.(
              withPrimitiveMetadata(info, {
                primitiveId: entry.primitiveId,
                visualizerType: entry.visualizerType,
                elementType: entry.elementType,
              })
            );
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
        if (isModelPick) {
          const modelEntry = pickedPrimitiveId
            ? resolveAdhocFeatureEntryFromPrimitiveId(pickedPrimitiveId)
            : null;
          if (!modelEntry) {
            return;
          }
          setShouldFocusSelected(false);
          setSelectedFeatureById(
            modelEntry.id,
            modelEntry.collectionId,
            modelEntry.layerId
          );
          const info = withPrimitiveMetadata(
            buildModelFeatureInfo(modelEntry.feature),
            {
              primitiveId: pickedPrimitiveId,
              visualizerType: "model",
              elementType: "model",
            }
          );
          onFeatureInfoChange?.(info);
          return;
        }
        if (!isModelPick) {
          if (selectedFeatureKey) {
            selectedPrimitiveIdByFeatureRef.current.delete(selectedFeatureKey);
          }
          setShouldFocusSelected(false);
          clearSelectedFeature();
          onFeatureInfoChange?.(null);
        }
      }, ScreenSpaceEventType.LEFT_CLICK);
    };

    attachClickHandler();

    return () => {
      disposed = true;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      handler?.destroy();
    };
  }, [
    adhocFeatureByKey,
    getScene,
    isCesiumEnabled,
    onFeatureInfoChange,
    selectedFeatureKey,
    clearSelectedFeature,
    setSelectedFeatureById,
    setShouldFocusSelected,
    registeredFeatureKeys,
    resolveAdhocFeatureEntryFromPrimitiveId,
  ]);

  // Get bounding sphere for a feature
  const getAdhocBoundingSphere = useCallback(
    (feature: FeatureInfo) => {
      if (typeof feature.id !== "string") return null;
      const parsedSelection = parseAdhocFeatureKey(feature.id);
      if (parsedSelection) {
        return getFeatureBoundingSphere(toAdhocFeatureKey(parsedSelection));
      }
      const entry = resolveAdhocFeatureEntryByFeatureId(feature.id);
      return entry ? getFeatureBoundingSphere(entry.key) : null;
    },
    [getFeatureBoundingSphere, resolveAdhocFeatureEntryByFeatureId]
  );

  return {
    getAdhocBoundingSphere,
    stageCesiumPrimitivesForTransition,
  };
};
