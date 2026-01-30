import { useCallback, useEffect, useMemo, useRef } from "react";

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
import type { FeatureInfo } from "@carma/types";
import {
  createExtrudedWallVisualizer,
  type ExtrudedWallVisualizer,
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
  getIsCesium: () => boolean;
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

export const useAdhocCesiumFeatureDisplay = (
  options: UseAdhocCesiumFeatureDisplayOptions
): UseAdhocCesiumFeatureDisplayResult => {
  const {
    baseModels = [],
    getIsCesium,
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
    selectedFeature: adhocSelectedFeature,
    selectedFeatureId,
    setSelectedFeatureId,
    shouldFocusSelected,
    setShouldFocusSelected,
  } = useAdhocFeatureDisplay();

  // Single ref for all visualizers
  const visualizersRef = useRef<Map<string, ExtrudedWallVisualizer>>(new Map());
  const selectedFeatureIdRef = useRef<string | null>(null);

  // Keep ref in sync
  useEffect(() => {
    selectedFeatureIdRef.current = selectedFeatureId ?? null;
  }, [selectedFeatureId]);

  const adhocInfoFeature = useMemo<FeatureInfo | null>(() => {
    if (!adhocSelectedFeature) return null;
    return buildAdhocFeatureInfo(adhocSelectedFeature);
  }, [adhocSelectedFeature]);

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

  // Notify feature info changes
  useEffect(() => {
    if (!getIsCesium()) return;
    onFeatureInfoChange?.(adhocInfoFeature ?? null);
  }, [adhocInfoFeature, getIsCesium, onFeatureInfoChange]);

  // Main effect: create/destroy visualizers for GeoJSON features
  useEffect(() => {
    if (!getIsCesium() || !isCesiumEnabled) return;

    const scene = getScene();
    if (!scene || scene.isDestroyed()) return;

    // Destroy existing visualizers
    visualizersRef.current.forEach((visualizer) => visualizer.destroy());
    visualizersRef.current.clear();

    const geojsonFeatures = adhocFeatures.filter(
      (feature) => !!getGeoJsonFromFeature(feature)
    );

    if (geojsonFeatures.length === 0) {
      scene.requestRender();
      return;
    }

    let cancelled = false;

    const createVisualizers = async () => {
      for (const feature of geojsonFeatures) {
        if (cancelled) break;

        const geojson = getGeoJsonFromFeature(feature);
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

        const wallHeights = getWallHeights(feature);
        const defaultWallHeight = getDefaultWallHeight(feature);

        const visualizer = createExtrudedWallVisualizer(
          {
            id: feature.id,
            feature: geoJsonFeature,
            terrainProvider: terrainProvider ?? undefined,
            surfaceProvider: surfaceProvider ?? undefined,
          },
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

        visualizersRef.current.set(feature.id, visualizer);

        try {
          await visualizer.attach(scene, () => scene.requestRender());
        } catch {
          // Visualizer failed to attach, continue with others
        }

        if (cancelled) {
          visualizer.destroy();
          visualizersRef.current.delete(feature.id);
          break;
        }

        // Set initial selection state
        if (selectedFeatureIdRef.current === feature.id) {
          visualizer.selected = true;
        }
      }

      if (!cancelled) {
        scene.requestRender();
      }
    };

    void createVisualizers();

    return () => {
      cancelled = true;
    };
    // Note: selectedFeatureId intentionally excluded - selection handled by separate effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    adhocFeatures,
    getIsCesium,
    getScene,
    getSurfaceProvider,
    getTerrainProvider,
    isCesiumEnabled,
    selectionLineWidthPixels,
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

  // Selection effect: update visualizer selection states
  useEffect(() => {
    visualizersRef.current.forEach((visualizer, id) => {
      visualizer.selected = id === selectedFeatureId;
    });
  }, [selectedFeatureId]);

  // Focus on selected feature
  useEffect(() => {
    if (!getIsCesium() || !shouldFocusSelected || !selectedFeatureId) return;

    const scene = getScene();
    if (!scene || scene.isDestroyed()) return;

    const visualizer = visualizersRef.current.get(selectedFeatureId);
    if (!visualizer) return;

    const sphere = visualizer.getBoundingSphere();
    if (!sphere) return;

    flyToBoundingSphereExtent(scene.camera, sphere, {
      minRange: 50,
      paddingFactor: 1.1,
    });
    setShouldFocusSelected(false);
  }, [
    getIsCesium,
    getScene,
    selectedFeatureId,
    setShouldFocusSelected,
    shouldFocusSelected,
  ]);

  // Click handler
  useEffect(() => {
    if (!getIsCesium()) return;

    const scene = getScene();
    if (!scene || scene.isDestroyed()) return;

    const handler = new ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((event: { position: Cartesian2 }) => {
      const picked = scene.pick(event.position);
      const pickedId = picked?.id;

      // Check if any visualizer was picked
      for (const [id, visualizer] of visualizersRef.current) {
        if (visualizer.isPicked(pickedId)) {
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
    getIsCesium,
    getScene,
    onFeatureInfoChange,
    selectedFeatureId,
    setSelectedFeatureId,
    setShouldFocusSelected,
  ]);

  // Get bounding sphere for a feature
  const getAdhocBoundingSphere = useCallback((feature: FeatureInfo) => {
    if (typeof feature.id !== "string") return null;
    const visualizer = visualizersRef.current.get(feature.id);
    return visualizer?.getBoundingSphere() ?? null;
  }, []);

  return { getAdhocBoundingSphere };
};
