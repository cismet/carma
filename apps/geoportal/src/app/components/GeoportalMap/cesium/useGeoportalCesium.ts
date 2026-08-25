import { useCallback, useEffect, useMemo, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import type { BoundingSphere, CesiumTerrainProvider } from "@carma-cesium";
import { flyToBoundingSphereExtent } from "@carma-mapping/engines/cesium/core";
import {
  type CesiumOptions,
  getGeoJsonGeometryCacheKey,
  getProviderScopedCache,
  getTerrainAwareBoundingSphereFromGeoJsonGeometry,
  useCesiumContext,
} from "@carma-mapping/engines/cesium/react/runtime";
import {
  useAdhocCesiumFeatureDisplay,
  useAdhocFeatureDisplay,
  useCesiumMapFrameworkHost,
  useSelectionCesium,
} from "@carma-appframeworks/portals";
import { ANNOTATION_SELECT_TOOL_ID } from "@carma-mapping/annotations/core";
import { useAnnotationsRuntime } from "@carma-mapping/annotations/runtime";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import type { LeafletMap } from "@carma-mapping/engines/leaflet";
import type { DirectCameraHandover } from "@carma-mapping/engines-interop/view-state";
import type { FeatureInfo } from "@carma-mapping/utils";
import { useFeatureFlags } from "@carma-providers/feature-flag";

import { CESIUM_CONFIG } from "../../../config/app.config.ts";
import { MapStyleKeys } from "../../../constants/MapStyleKeys.ts";
import { useCameraOrbit } from "../../../hooks/useCameraOrbit.ts";
import { useModelSelectionDispatcher } from "../../../hooks/useModelSelectionDispatcher.ts";
import { useObliqueInitializer } from "../../../oblique/hooks/useObliqueInitializer.ts";
import {
  getSelectedFeature,
  setFeatures,
  setSecondaryInfoBoxElements,
  setSelectedFeature,
} from "../../../store/slices/features.ts";
import { getUIMode, UIMode } from "../../../store/slices/ui.ts";
import { useGeoportalCesiumNavigationRestore } from "../hooks/useGeoportalCesiumNavigationRestore.ts";
import {
  MODEL_CONFIG,
  MODEL_SHADER_OPTIONS,
} from "./cesium-model-shader-options.ts";

export const GEOPORTAL_CESIUM_VIEW_ADAPTER_ID = "geoportal-cesium";
const DEFAULT_MARKER_ANCHOR_HEIGHT = 10;
const FLY_TO_BOUNDING_SPHERE_PADDING_FACTOR = 1.1;

const buildTerrainAwareBoundingSphereOptions = (
  terrainProvider: CesiumTerrainProvider | undefined
) => ({
  terrainProvider,
  elevationSamplingOptions: { overrideExisting: true as const },
});

const buildFlyToBoundingSphereOptions = (minRange: number) => ({
  minRange,
  paddingFactor: FLY_TO_BOUNDING_SPHERE_PADDING_FACTOR,
});

export type UseGeoportalCesiumOptions = {
  /** Mount and allow 3D at all. */
  allow3d?: boolean;
  /**
   * 2D map accessor handed to the framework host: the leaflet map, or the
   * leaflet-shaped transition shim over the maplibre map.
   */
  get2dMap: () => LeafletMap | null | undefined;
  /**
   * ANDed into the nav-bridge sync gate. Set it when a sibling 2D runtime is
   * subscribed to the same view state (maplibre), leave it undefined for
   * leaflet.
   */
  isSyncEnabled?: boolean;
  /**
   * Un-animated camera handover, for a 2D engine that can hold the same camera
   * as Cesium. Only the maplibre variant supplies this; leaflet cannot rotate or
   * tilt, so it always takes the animated transition.
   */
  directHandover?: DirectCameraHandover;
};

/**
 * All geoportal 3D wiring in one place, shared by the leaflet and the maplibre
 * map variant: adhoc/model display and selection, annotation handoff, camera
 * orbit, navigation restore, oblique mode, zoom to feature and the 2D/3D
 * framework host. Only the 2D map accessor differs between the variants.
 */
export const useGeoportalCesium = ({
  allow3d,
  get2dMap,
  isSyncEnabled,
  directHandover,
}: UseGeoportalCesiumOptions) => {
  const dispatch = useDispatch();
  const { activeToolType, selectedAnnotationId, setSelectedAnnotationId } =
    useAnnotationsRuntime();

  const {
    withTerrainProvider,
    withSurfaceProvider,
    getSurfaceProvider,
    getTerrainProvider,
    getScene,
    isRuntimeReady,
    models,
    ssccMinimumZoomDistance: minimumCameraHeight,
    currentSceneStyle,
  } = useCesiumContext();

  const { isCesium, getIsCesium, getIsTransitioning } =
    useMapFrameworkSwitcherContext();

  const uiMode = useSelector(getUIMode);
  const selectedFeature = useSelector(getSelectedFeature);
  const {
    selectedFeature: selectedAdhocFeature,
    clearSelectedFeature: clearSelectedAdhocFeature,
  } = useAdhocFeatureDisplay();

  const isModeMeasurement = uiMode === UIMode.MEASUREMENT;
  const isAnnotationSelectToolActive =
    activeToolType === ANNOTATION_SELECT_TOOL_ID;
  const is3dModelSelectionEnabled =
    !isModeMeasurement || isAnnotationSelectToolActive;

  const markerAsset = models[CESIUM_CONFIG.markerKey];
  const markerAnchorHeight =
    CESIUM_CONFIG.markerAnchorHeight ?? DEFAULT_MARKER_ANCHOR_HEIGHT;

  const minHeight =
    typeof minimumCameraHeight === "number" &&
    Number.isFinite(minimumCameraHeight)
      ? Math.max(0, minimumCameraHeight)
      : 0;
  const minFlyToRange = minHeight * 1.5;

  // Cache fly-to spheres per terrain provider so elevations stay provider-specific.
  const flyToSphereCacheByProviderRef = useRef<
    WeakMap<CesiumTerrainProvider, Map<string, BoundingSphere>>
  >(new WeakMap());
  const flyToSphereFallbackCacheRef = useRef<Map<string, BoundingSphere>>(
    new Map()
  );
  const previousSelectedAnnotationIdRef = useRef<string | null>(null);
  const annotationSelectionHandoffRef = useRef<string | null>(null);
  const annotationSelectionHandoffTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const { isDebugMode } = useFeatureFlags();
  const { isObliqueMode, leaveObliqueMode } =
    useObliqueInitializer(isDebugMode);

  const dispatchModelSelection = useModelSelectionDispatcher();
  const handleModelFeatureInfoChange = useCallback(
    (feature: FeatureInfo | null) => {
      if (!feature) {
        if (!selectedFeature && !selectedAdhocFeature) {
          return;
        }
        dispatchModelSelection(null);
        return;
      }

      if (
        selectedAnnotationId &&
        annotationSelectionHandoffRef.current === selectedAnnotationId
      ) {
        // The adhoc model display can re-emit the previous model selection
        // while provider and Redux selection state settle after an annotation click.
        return;
      }
      if (selectedFeature?.id === feature.id) {
        return;
      }
      if (selectedAnnotationId) {
        setSelectedAnnotationId(null);
      }
      dispatchModelSelection(feature);
    },
    [
      dispatchModelSelection,
      selectedAdhocFeature,
      selectedAnnotationId,
      selectedFeature,
      setSelectedAnnotationId,
    ]
  );

  const { getAdhocBoundingSphere, stageCesiumPrimitivesForTransition } =
    useAdhocCesiumFeatureDisplay({
      baseModels: CESIUM_CONFIG.models ?? [],
      getScene,
      getTerrainProvider,
      isCesiumEnabled: isCesium,
      minFlyToRange,
      selectionLineWidthPixels: 1.5,
      wallOpacity: {
        selected: 0.4,
        default: 0.7,
      },
      modelHighlightStyle: MODEL_CONFIG?.highlight?.style,
      modelShader: MODEL_SHADER_OPTIONS,
      selectionEnabled: is3dModelSelectionEnabled,
      deselectOnEmptyClick: is3dModelSelectionEnabled,
      deselectOnNonModelClick: !isModeMeasurement,
      onFeatureInfoChange: handleModelFeatureInfoChange,
    });

  const getCesiumTerrainProviders = useCallback(
    () => ({
      TERRAIN: getTerrainProvider() ?? null,
      SURFACE: getSurfaceProvider() ?? null,
    }),
    [getSurfaceProvider, getTerrainProvider]
  );

  const {
    shouldMountCesium,
    handleCesiumHostChange,
    suppressCommitsUntilInteraction,
  } = useCesiumMapFrameworkHost({
    viewAdapterId: GEOPORTAL_CESIUM_VIEW_ADAPTER_ID,
    getLeafletMap: get2dMap,
    getCesiumTerrainProviders,
    allow3d,
    isCommitEnabled: !getIsTransitioning(),
    isSyncEnabled,
    onBeforeTransitionToCesium: stageCesiumPrimitivesForTransition,
    onBeforeTransitionToLeaflet: leaveObliqueMode,
    tryDirectTransitionToCesium: directHandover?.tryDirectTransitionToCesium,
    tryDirectTransitionToLeaflet: directHandover?.tryDirectTransitionToLeaflet,
    willPreserveOrientationOnHandover:
      directHandover?.willPreserveOrientationOnHandover,
  });

  const cesiumScene = getScene();

  // Camera orbit functionality for 3D mode
  const { isOrbiting, toggleOrbit, stopOrbit } = useCameraOrbit({
    scene: cesiumScene,
    enabled: getIsCesium(),
  });

  useGeoportalCesiumNavigationRestore({
    scene: cesiumScene,
    enabled: isRuntimeReady,
    suppressCommitsUntilInteraction,
  });

  // Stop orbit when feature is deselected
  useEffect(() => {
    if (!selectedFeature && isOrbiting) {
      stopOrbit({ immediate: true });
    }
  }, [selectedFeature, isOrbiting, stopOrbit]);

  const selectionCesiumOptions = useMemo<CesiumOptions>(
    () => ({
      markerAsset,
      markerAnchorHeight,
      selectionClassification:
        currentSceneStyle === MapStyleKeys.AERIAL ? "tileset" : "both",
      withTerrainProvider,
      withSurfaceProvider,
    }),
    [
      currentSceneStyle,
      markerAsset,
      markerAnchorHeight,
      withTerrainProvider,
      withSurfaceProvider,
    ]
  );

  useSelectionCesium(getIsCesium, selectionCesiumOptions, isObliqueMode);

  const getBoundingSphereFromFeatureGeometry = useCallback(
    async (feature: FeatureInfo): Promise<BoundingSphere | null> => {
      if (!feature.geometry) return null;

      const terrainProvider = getTerrainProvider();
      const cacheKey = `${feature.id}:${getGeoJsonGeometryCacheKey(
        feature.geometry
      )}`;
      const cache = getProviderScopedCache(
        terrainProvider,
        flyToSphereCacheByProviderRef.current,
        flyToSphereFallbackCacheRef.current
      );
      const cachedSphere = cache.get(cacheKey);
      if (cachedSphere) {
        return cachedSphere;
      }

      const sphere = await getTerrainAwareBoundingSphereFromGeoJsonGeometry(
        feature.geometry,
        buildTerrainAwareBoundingSphereOptions(terrainProvider)
      );
      if (!sphere) return null;

      cache.set(cacheKey, sphere);
      return sphere;
    },
    [getTerrainProvider]
  );

  const handleZoomToFeature = useCallback(
    (feature: FeatureInfo) => {
      void (async () => {
        if (!getIsCesium()) return;
        const scene = getScene();
        if (!scene || scene.isDestroyed()) return;

        const sphereFromGeometry = await getBoundingSphereFromFeatureGeometry(
          feature
        );
        const sphere = sphereFromGeometry ?? getAdhocBoundingSphere(feature);
        if (!sphere) return;

        flyToBoundingSphereExtent(
          scene.camera,
          sphere,
          buildFlyToBoundingSphereOptions(minFlyToRange)
        );
        scene.requestRender();
      })();
    },
    [
      getAdhocBoundingSphere,
      getBoundingSphereFromFeatureGeometry,
      getIsCesium,
      getScene,
      minFlyToRange,
    ]
  );

  // An annotation click wins over a pending 3D model/adhoc selection.
  useEffect(() => {
    const previousSelectedAnnotationId =
      previousSelectedAnnotationIdRef.current;
    previousSelectedAnnotationIdRef.current = selectedAnnotationId;

    if (
      !isCesium ||
      !selectedAnnotationId ||
      previousSelectedAnnotationId === selectedAnnotationId
    ) {
      return;
    }

    annotationSelectionHandoffRef.current = selectedAnnotationId;
    if (annotationSelectionHandoffTimeoutRef.current) {
      clearTimeout(annotationSelectionHandoffTimeoutRef.current);
    }
    annotationSelectionHandoffTimeoutRef.current = setTimeout(() => {
      if (annotationSelectionHandoffRef.current === selectedAnnotationId) {
        annotationSelectionHandoffRef.current = null;
      }
      annotationSelectionHandoffTimeoutRef.current = null;
    }, 0);

    clearSelectedAdhocFeature();

    if (selectedFeature) {
      dispatch(setSelectedFeature(null));
      dispatch(setSecondaryInfoBoxElements([]));
      dispatch(setFeatures([]));
    }
  }, [
    clearSelectedAdhocFeature,
    dispatch,
    isCesium,
    selectedAnnotationId,
    selectedFeature,
  ]);

  useEffect(
    () => () => {
      if (annotationSelectionHandoffTimeoutRef.current) {
        clearTimeout(annotationSelectionHandoffTimeoutRef.current);
      }
    },
    []
  );

  return {
    handleCesiumHostChange,
    handleZoomToFeature,
    isObliqueMode,
    isOrbiting,
    leaveObliqueMode,
    shouldMountCesium,
    suppressCommitsUntilInteraction,
    toggleOrbit,
  };
};
