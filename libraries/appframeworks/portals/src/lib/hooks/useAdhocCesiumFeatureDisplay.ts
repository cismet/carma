import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  BoundingSphere,
  Cartographic,
  Color,
  Primitive,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  flyToBoundingSphereExtent,
  type Cartesian2,
  type CesiumTerrainProvider,
  type Scene,
} from "@carma/cesium";

import {
  Easing as EasingFunctions,
  type Easing as EasingFunction,
} from "@carma-commons/math";
import type { ModelConfig } from "@carma-commons/resources";
import type { FeatureInfo } from "@carma/types";
import {
  createSelectionEdgePrimitive,
  createWallPrimitives,
  getBoundingSphereFromCoordinates,
  getElevationAsync,
  useGeometryInstanceOpacityAnimation,
  type WallPrimitivesResult,
} from "@carma-mapping/engines/cesium";

import {
  useAdhocFeatureDisplay,
  type AdhocFeature,
} from "../components/AdhocFeatureDisplayProvider";
import {
  buildAdhocFeatureInfo,
  getAdhocAccentColor,
  getAdhocWallHeight,
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

  const wallOpacityConfig = useMemo(
    () => ({
      selected: wallOpacity?.selected ?? 0.4,
      default: wallOpacity?.default ?? 0.7,
    }),
    [wallOpacity?.default, wallOpacity?.selected]
  );

  const wallOpacityAnimationConfig = useMemo(
    () => ({
      durationMs: wallOpacityAnimation?.durationMs ?? 200,
      easing: wallOpacityAnimation?.easing ?? EasingFunctions.SINUSOIDAL_IN_OUT,
    }),
    [wallOpacityAnimation?.durationMs, wallOpacityAnimation?.easing]
  );

  const {
    features: adhocFeatures,
    selectedFeature: adhocSelectedFeature,
    selectedFeatureId,
    setSelectedFeatureId,
    shouldFocusSelected,
    setShouldFocusSelected,
  } = useAdhocFeatureDisplay();

  const adhocWallPrimitivesRef = useRef<Map<string, WallPrimitivesResult>>(
    new Map()
  );
  const adhocWallDataRef = useRef<
    Map<string, { ring: number[][]; heights: number[]; feature: AdhocFeature }>
  >(new Map());
  const adhocSelectionPrimitivesRef = useRef<Map<string, Primitive>>(new Map());
  const adhocFeatureCoordinatesRef = useRef<Map<string, number[][]>>(new Map());
  const prevSelectedFeatureIdRef = useRef<string | null>(null);
  const selectedFeatureIdRef = useRef<string | null>(null);
  const selectionLineWidthPixelsRef = useRef<number | undefined>(
    selectionLineWidthPixels
  );
  const [renderTick, setRenderTick] = useState(0);
  const { animateGeometryInstanceOpacity } =
    useGeometryInstanceOpacityAnimation(wallOpacityAnimationConfig);

  const clearAdhocPrimitives = useCallback((scene: Scene) => {
    const primitivesByFeature = adhocWallPrimitivesRef.current;
    const wallDataByFeature = adhocWallDataRef.current;
    const selectionPrimitives = adhocSelectionPrimitivesRef.current;
    primitivesByFeature.forEach(({ collection }) => {
      scene.primitives.remove(collection);
    });
    primitivesByFeature.clear();
    wallDataByFeature.clear();
    selectionPrimitives.forEach((primitive) => {
      scene.primitives.remove(primitive);
    });
    selectionPrimitives.clear();
    adhocFeatureCoordinatesRef.current.clear();
  }, []);

  const getAdhocWallColor = useCallback(
    (feature: AdhocFeature, isSelected: boolean) => {
      const accent = getAdhocAccentColor(feature);
      const opacity = isSelected
        ? wallOpacityConfig.selected
        : wallOpacityConfig.default;
      if (typeof accent === "string") {
        const color = Color.fromCssColorString(accent);
        return color.withAlpha(opacity);
      }
      return Color.fromCssColorString("#3A7CEB").withAlpha(opacity);
    },
    [wallOpacityConfig.default, wallOpacityConfig.selected]
  );

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
        properties: {
          ...baseProperties,
          adhocFeatureId: feature.id,
        },
        name: typeof metadataTitle === "string" ? metadataTitle : undefined,
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
          const adhocFeatureId = featureInfo?.properties?.adhocFeatureId;
          if (typeof adhocFeatureId === "string") {
            setSelectedFeatureId(adhocFeatureId);
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

  useEffect(() => {
    selectedFeatureIdRef.current = selectedFeatureId;
  }, [selectedFeatureId]);

  useEffect(() => {
    selectionLineWidthPixelsRef.current = selectionLineWidthPixels;
  }, [selectionLineWidthPixels]);

  useEffect(() => {
    if (!getIsCesium()) return;
    onFeatureInfoChange?.(adhocInfoFeature ?? null);
  }, [adhocInfoFeature, getIsCesium, onFeatureInfoChange]);

  useEffect(() => {
    if (!getIsCesium() || !isCesiumEnabled) return;

    const scene = getScene();
    if (!scene || scene.isDestroyed()) return;

    clearAdhocPrimitives(scene);

    const primitivesByFeature = adhocWallPrimitivesRef.current;
    const selectionPrimitives = adhocSelectionPrimitivesRef.current;

    const geojsonFeatures = adhocFeatures.filter(
      (feature) => !!getGeoJsonFromFeature(feature)
    );
    if (geojsonFeatures.length === 0) {
      scene.requestRender();
      return;
    }

    let cancelled = false;

    const addWallsForFeature = async (feature: AdhocFeature) => {
      const geojson = getGeoJsonFromFeature(feature);
      if (!geojson) return;
      const polygon = getPolygonFromGeoJson(geojson);
      if (!polygon) return;

      const ring = polygon[0];
      if (!ring || ring.length < 2) return;

      const terrainProvider = getTerrainProvider();
      const surfaceProvider = getSurfaceProvider();
      let heights = ring.map((coord) =>
        typeof coord[2] === "number" ? coord[2] : 0
      );

      if (terrainProvider && surfaceProvider) {
        try {
          const positions = ring.map((coord) =>
            Cartographic.fromDegrees(coord[0], coord[1], 0)
          );
          const elevations = await getElevationAsync(
            terrainProvider,
            surfaceProvider,
            positions
          );
          if (cancelled || elevations.length !== positions.length) return;

          const sampledHeights = elevations.map(
            (result) => result.surface?.height ?? result.terrain.height
          );
          heights = ring.map((coord, index) => {
            const coordHeight = coord[2];
            if (typeof coordHeight === "number") return coordHeight;
            return sampledHeights[index] ?? 0;
          });
        } catch {
          // fallback to provided Z/zero heights
        }
      }
      const coordinatesWithHeight = ring.map((coord, index) => [
        coord[0],
        coord[1],
        heights[index] ?? 0,
      ]);

      const wallPrimitives = createWallPrimitives({
        ring,
        heights,
        featureId: feature.id,
        isSelected: selectedFeatureIdRef.current === feature.id,
        getWallColor: (isSelected) => getAdhocWallColor(feature, isSelected),
        getWallHeight: (segmentIndex) =>
          getAdhocWallHeight(feature, segmentIndex),
      });

      scene.primitives.add(wallPrimitives.collection);
      primitivesByFeature.set(feature.id, wallPrimitives);
      adhocWallDataRef.current.set(feature.id, {
        ring,
        heights,
        feature,
      });
      adhocFeatureCoordinatesRef.current.set(feature.id, coordinatesWithHeight);

      if (selectedFeatureIdRef.current === feature.id) {
        const selectionPrimitive = createSelectionEdgePrimitive({
          ring,
          heights,
          featureId: feature.id,
          color: Color.YELLOW,
          getWallHeight: (segmentIndex) =>
            getAdhocWallHeight(feature, segmentIndex),
          widthPixels: selectionLineWidthPixelsRef.current,
        });
        if (selectionPrimitive) {
          scene.primitives.add(selectionPrimitive);
          adhocSelectionPrimitivesRef.current.set(
            feature.id,
            selectionPrimitive
          );
        }
      }

      scene.requestRender();
    };

    void Promise.all(geojsonFeatures.map(addWallsForFeature)).then(() => {
      if (!cancelled) {
        setRenderTick((prev) => prev + 1);
        const selectedId = selectedFeatureIdRef.current;
        if (selectedId && !selectionPrimitives.has(selectedId)) {
          const selectedData = adhocWallDataRef.current.get(selectedId);
          if (selectedData) {
            const selectionPrimitive = createSelectionEdgePrimitive({
              ring: selectedData.ring,
              heights: selectedData.heights,
              featureId: selectedData.feature.id,
              color: Color.YELLOW,
              getWallHeight: (segmentIndex) =>
                getAdhocWallHeight(selectedData.feature, segmentIndex),
              widthPixels: selectionLineWidthPixelsRef.current,
            });
            if (selectionPrimitive) {
              scene.primitives.add(selectionPrimitive);
              selectionPrimitives.set(selectedId, selectionPrimitive);
            }
          }
        }
        scene.requestRender();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    adhocFeatures,
    clearAdhocPrimitives,
    getAdhocWallColor,
    getIsCesium,
    getScene,
    getSurfaceProvider,
    getTerrainProvider,
    isCesiumEnabled,
  ]);

  useEffect(() => {
    return () => {
      const scene = getScene();
      if (!scene || scene.isDestroyed()) return;
      clearAdhocPrimitives(scene);
      scene.requestRender();
    };
  }, [clearAdhocPrimitives, getScene]);

  useEffect(() => {
    if (!getIsCesium() || !shouldFocusSelected || !selectedFeatureId) return;

    const scene = getScene();
    if (!scene || scene.isDestroyed()) return;

    const coordinates =
      adhocFeatureCoordinatesRef.current.get(selectedFeatureId);
    if (!coordinates || coordinates.length === 0) return;

    const sphere = getBoundingSphereFromCoordinates(coordinates);
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

  useEffect(() => {
    if (!getIsCesium()) return;

    const scene = getScene();
    if (!scene || scene.isDestroyed()) return;

    const primitivesByFeature = adhocWallPrimitivesRef.current;
    const wallDataByFeature = adhocWallDataRef.current;
    const selectionPrimitives = adhocSelectionPrimitivesRef.current;
    const prevSelectedId = prevSelectedFeatureIdRef.current;
    const animateWallOpacity = (
      featureId: string,
      wallPrimitives: WallPrimitivesResult,
      targetOpacity: number
    ) => {
      animateGeometryInstanceOpacity({
        key: featureId,
        instances: wallPrimitives.segments,
        targetOpacity,
        requestRender: () => scene.requestRender(),
      });
    };

    const updateFeatureSelection = (featureId: string, isSelected: boolean) => {
      const data = wallDataByFeature.get(featureId);
      if (!data) return;

      const wallPrimitives = primitivesByFeature.get(featureId);
      const wallPrimitivesInvalid = wallPrimitives
        ? wallPrimitives.segments.some(({ primitive }) =>
            primitive.isDestroyed()
          )
        : true;
      if (!wallPrimitivesInvalid && wallPrimitives) {
        const wallColor = getAdhocWallColor(data.feature, isSelected);
        animateWallOpacity(featureId, wallPrimitives, wallColor.alpha);
      } else {
        if (wallPrimitives) {
          scene.primitives.remove(wallPrimitives.collection);
        }
        const newWallPrimitives = createWallPrimitives({
          ring: data.ring,
          heights: data.heights,
          featureId: data.feature.id,
          isSelected,
          getWallColor: (selected) => getAdhocWallColor(data.feature, selected),
          getWallHeight: (segmentIndex) =>
            getAdhocWallHeight(data.feature, segmentIndex),
        });
        scene.primitives.add(newWallPrimitives.collection);
        primitivesByFeature.set(featureId, newWallPrimitives);
      }

      const existingSelection = selectionPrimitives.get(featureId);
      if (existingSelection) {
        scene.primitives.remove(existingSelection);
        selectionPrimitives.delete(featureId);
      }

      if (isSelected) {
        const selectionPrimitive = createSelectionEdgePrimitive({
          ring: data.ring,
          heights: data.heights,
          featureId: data.feature.id,
          color: Color.YELLOW,
          getWallHeight: (segmentIndex) =>
            getAdhocWallHeight(data.feature, segmentIndex),
          widthPixels: selectionLineWidthPixelsRef.current,
        });
        if (selectionPrimitive) {
          scene.primitives.add(selectionPrimitive);
          selectionPrimitives.set(featureId, selectionPrimitive);
        }
      }
    };

    if (prevSelectedId && prevSelectedId !== selectedFeatureId) {
      updateFeatureSelection(prevSelectedId, false);
    }

    if (selectedFeatureId) {
      updateFeatureSelection(selectedFeatureId, true);
    }

    prevSelectedFeatureIdRef.current = selectedFeatureId ?? null;

    scene.requestRender();
  }, [
    getAdhocWallColor,
    getIsCesium,
    getScene,
    animateGeometryInstanceOpacity,
    renderTick,
    selectedFeatureId,
    wallOpacityAnimationConfig,
  ]);

  useEffect(() => {
    if (!getIsCesium()) return;

    const scene = getScene();
    if (!scene || scene.isDestroyed()) return;

    const handler = new ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((event: { position: Cartesian2 }) => {
      const picked = scene.pick(event.position);
      const pickedId = picked?.id as { adhocFeatureId?: unknown } | undefined;

      if (pickedId && typeof pickedId === "object") {
        const adhocFeatureId = pickedId.adhocFeatureId;
        if (typeof adhocFeatureId === "string") {
          if (adhocFeatureId === selectedFeatureId) {
            setSelectedFeatureId(null);
            onFeatureInfoChange?.(null);
            return;
          }

          setShouldFocusSelected(false);
          setSelectedFeatureId(adhocFeatureId);
          const adhocFeature = adhocFeatures.find(
            (feature) => feature.id === adhocFeatureId
          );
          const info = adhocFeature
            ? buildAdhocFeatureInfo(adhocFeature)
            : null;
          if (info) {
            onFeatureInfoChange?.(info);
          }
          return;
        }
      }

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

  const getAdhocBoundingSphere = useCallback((feature: FeatureInfo) => {
    const adhocFeatureId = feature.properties?.adhocFeatureId;
    if (typeof adhocFeatureId !== "string") return null;
    const storedCoordinates =
      adhocFeatureCoordinatesRef.current.get(adhocFeatureId);
    if (!storedCoordinates) return null;
    return getBoundingSphereFromCoordinates(storedCoordinates);
  }, []);

  return { getAdhocBoundingSphere };
};
