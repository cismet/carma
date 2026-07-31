import L from "leaflet";
import { getFromWebMercatorToWGS84 } from "@carma-geo/proj";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation } from "react-router-dom";
import {
  BoundingSphere,
  Cartesian3,
  Cartographic,
  Color,
  type CesiumTerrainProvider,
} from "@carma-cesium";
import {
  flyToBoundingSphereExtent,
  isValidCesiumTerrainProvider,
  sampleTerrainMostDetailedGuardedAsync,
  type CesiumModelFlashConfig,
  type CesiumModelConfig,
  type CesiumModelStyleConfig,
} from "@carma-mapping/engines/cesium/core";
import type { Map as MaplibreMap } from "maplibre-gl";

import { Button, Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRightFromBracket,
  faKey,
} from "@fortawesome/free-solid-svg-icons";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";

import {
  SelectionItem,
  TopicMapSelectionContent,
  type AdhocCesiumModelShaderOptions,
  useAdhocCesiumFeatureDisplay,
  useAdhocFeatureDisplay,
  useCesiumMapFrameworkHost,
  useGazData,
  useMapHashRouting,
  useSelectionCesium,
  useSelectionTopicMap,
} from "@carma-appframeworks/portals";
import {
  geoElements,
  getCollabedHelpComponentConfig,
  tooltipText,
} from "@carma-collab/wuppertal/geoportal";
import { getCollabedHelpComponentConfig as getCollabedHelpElementsConfig } from "@carma-collab/wuppertal/helper-overlay";

import { ENDPOINT, isAreaType } from "@carma-commons/resources";
import type { FeatureInfo } from "@carma-mapping/utils";
import { Measurements, InfoBoxMeasurement } from "@carma-commons/measurements";
import { ANNOTATION_SELECT_TOOL_ID } from "@carma-mapping/annotations/core";
import { useAnnotationsRuntime } from "@carma-mapping/annotations/runtime";

import {
  useOverlayHelper,
  useOverlayTourContext,
} from "@carma-commons/ui/helper-overlay";
import { getApplicationVersion } from "@carma-commons/utils";

import {
  CesiumHost,
  type CesiumHostState,
  type CesiumOptions,
  getGeoJsonGeometryCacheKey,
  getProviderScopedCache,
  getTerrainAwareBoundingSphereFromGeoJsonGeometry,
  useCesiumContext,
} from "@carma-mapping/engines/cesium/react/runtime";
import {
  readFromMaplibre,
  readInitialCameraViewFromViewState,
  useCesiumNavigationBridge,
  useMaplibreRuntimeBridge,
} from "@carma-mapping/engines-interop/view-state";
import {
  useMapFrameworkSwitcherContext,
  useRegisterMapFramework,
} from "@carma-mapping/components";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import { useAuth } from "@carma-providers/auth";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import { getLayers as getBackgroundLayers } from "@carma-appframeworks/portals";
import { CarmaMap } from "@carma-mapping/core";
import { useLibreContext } from "@carma-mapping/contexts";
import {
  MeasurementHost,
  MeasurementInfoBox,
  useMeasurements,
} from "@carma-mapping/measurements";

import FeatureInfoBox from "../feature-info/FeatureInfoBox.tsx";
import PrintPreview from "../map-print/PrintPreview.tsx";
import AnnotationInfoBox from "../annotations/AnnotationInfoBox.tsx";

import versionData from "../../../version.json";

import { addCssToOverlayHelperItem } from "../../helper/overlayHelper.ts";
import { isVisible3dAnnotationAdhocLayer } from "../../helper/adhoc-feature-utils.ts";

import useLeafletZoomControls from "../../hooks/leaflet/useLeafletZoomControls.ts";
import { useDispatchSachdatenInfoText } from "../../hooks/useDispatchSachdatenInfoText.ts";
import { useFeatureInfoModeCursorStyle } from "../../hooks/useFeatureInfoModeCursorStyle.ts";
import { useObliqueInitializer } from "../../oblique/hooks/useObliqueInitializer.ts";
import { useCameraOrbit } from "../../hooks/useCameraOrbit.ts";
import { useGeoportalInitialValues } from "../../hooks/useGeoportalInitialValues.ts";
import useLibreLayers from "../../hooks/libre/useLibreLayers.ts";
import { useLibreMapSelectionHandler } from "../../hooks/libre/useLibreMapClickHandler.ts";

import { onClickTopicMap } from "./topicmap.utils.ts";
import { useGeoportalCesiumNavigationRestore } from "./hooks/useGeoportalCesiumNavigationRestore.ts";
import { useCreateCismapLayers } from "./hooks/useCreateCismapLayer.ts";

import store from "../../store/index.ts";
import {
  getLoading,
  getSelectedFeature,
  setFeatures,
  setPreferredLayerId,
  setSecondaryInfoBoxElements,
  setSelectedFeature,
} from "../../store/slices/features.ts";
import {
  getBackgroundLayer,
  getLayers,
  getLayersIdle,
  getShowHamburgerMenu,
  setLayersIdle,
  setMaplibreMaps as setMaplibreMapsStore,
} from "../../store/slices/mapping.ts";
import {
  getUIMode,
  UIMode,
  getTriggerFeatureInfoUpdate,
  getUIMapInteractionEnabled,
  getUIHashWriteEnabled,
  getUIVisibleControls,
} from "../../store/slices/ui.ts";
import { findFachzwillingByPathname } from "../../constants/fachzwillinge";
import { getLibreDrawMode } from "../../store/slices/measurements.ts";

import LoginForm from "../LoginForm.tsx";
import { useModelSelectionDispatcher } from "../../hooks/useModelSelectionDispatcher.ts";

import { CESIUM_CONFIG, LEAFLET_CONFIG } from "../../config/app.config";
import { MapStyleKeys } from "../../constants/MapStyleKeys";

import "cesium/Build/Cesium/Widgets/widgets.css";
import "../leaflet.css";
import AdhocSelectionSync from "../feature-info/AdhocSelectionSync.tsx";
import { selectionPadding } from "../../constants/selection.ts";
import { GEOPORTAL_CESIUM_CONTAINER_ID } from "../annotations/cesium-annotations.constants.ts";

interface MapProps {
  height: number;
  width: number;
  allow3d?: boolean;
}

const CLICK_DELAY_MS = 200;
const GEOPORTAL_CESIUM_VIEW_ADAPTER_ID = "geoportal-cesium";
const DEFAULT_MARKER_ANCHOR_HEIGHT = 10;
const FLY_TO_BOUNDING_SPHERE_PADDING_FACTOR = 1.1;
// Fallback ground height (m) used when the surface/terrain provider cannot be
// sampled for the 2D->3D switch. Matches the leaflet transition default.
const SWITCH_SURFACE_FALLBACK_HEIGHT_M = 350;

const MAP_CONTAINER_STYLE: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 400,
};

const HEX_COLOR_WITHOUT_ALPHA_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const colorFromHexWithoutAlpha = (
  hexColor: string | undefined
): Color | undefined => {
  if (!hexColor || !HEX_COLOR_WITHOUT_ALPHA_PATTERN.test(hexColor)) {
    return undefined;
  }
  const color = Color.fromCssColorString(hexColor);
  return color ? new Color(color.red, color.green, color.blue, 1) : undefined;
};

const readModelStyleOutline = (style: CesiumModelStyleConfig | undefined) =>
  style?.type === "silhouette" ? style.outline : undefined;

const buildModelShaderFlashOptions = (
  flash: CesiumModelFlashConfig | undefined
) => ({
  color: colorFromHexWithoutAlpha(flash?.color),
  inDurationMs: flash?.inDurationMs,
  inEasing: flash?.inEasing,
  opacity: flash?.opacity,
  outDurationMs: flash?.outDurationMs,
  outEasing: flash?.outEasing,
});

const buildAdhocModelShaderOptions = (
  config: CesiumModelConfig | undefined
): AdhocCesiumModelShaderOptions => {
  const hover = config?.hover;
  const sampling = config?.sampling;
  const selection = config?.selection;
  const selectionStyle = selection?.style;
  const selectionOutline = readModelStyleOutline(selectionStyle);

  return {
    sampling: {
      color: colorFromHexWithoutAlpha(sampling?.color),
      enabled: sampling?.enabled,
      fade: sampling?.fade,
      opacity: sampling?.opacity,
    },
    selection: {
      fade: selection?.fade,
      flash: {
        selection: buildModelShaderFlashOptions(selection?.flash?.selection),
        highlight: buildModelShaderFlashOptions(selection?.flash?.highlight),
      },
      hover: {
        clearDelayMs: hover?.clearDelayMs,
        enabled: hover?.enabled,
        fade: hover?.fade,
      },
      style: {
        edge: {
          color: colorFromHexWithoutAlpha(selectionOutline?.color),
          mode: selectionStyle?.type === "plain" ? "none" : "silhouette",
          opacity: selectionOutline?.opacity,
          widthPx: selectionOutline?.widthPx,
        },
        fillColor: colorFromHexWithoutAlpha(selectionStyle?.fill?.color),
      },
    },
  };
};

const MODEL_CONFIG = CESIUM_CONFIG.model;
const MODEL_SHADER_OPTIONS = buildAdhocModelShaderOptions(MODEL_CONFIG);

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

// position-based help entries shared by the leaflet and maplibre map variants
const useGeoportalHelpOverlays = () => {
  const infoBoxOverlay = addCssToOverlayHelperItem(
    getCollabedHelpElementsConfig("INFOBOX", geoElements),
    "350px",
    "137px"
  );

  const layerButtonsOverlay = addCssToOverlayHelperItem(
    getCollabedHelpElementsConfig("LAYERBUTTONS", geoElements),
    "146px",
    "21px"
  );

  const mapInteractionOverlay = addCssToOverlayHelperItem(
    getCollabedHelpElementsConfig("CENTER", geoElements),
    "15px",
    "15px"
  );

  useOverlayHelper(infoBoxOverlay);
  useOverlayHelper(layerButtonsOverlay);
  useOverlayHelper(mapInteractionOverlay);
};

const LeafletGeoportalMap = ({ height, width, allow3d }: MapProps) => {
  const dispatch = useDispatch();
  const { activeToolType, selectedAnnotationId, setSelectedAnnotationId } =
    useAnnotationsRuntime();

  // Contexts
  const {
    withTerrainProvider,
    withSurfaceProvider,
    getSurfaceProvider,
    getTerrainProvider,
    getScene,
    isRuntimeReady,
    initialViewApplied,
    models,
    ssccMinimumZoomDistance: minimumCameraHeight,
    currentSceneStyle,
  } = useCesiumContext();

  const rerenderCountRef = useRef(0);
  const lastRenderTimeStampRef = useRef(Date.now());
  const lastRenderIntervalRef = useRef(0);
  // Store MapLibre maps outside Redux to avoid serialization issues
  const maplibreMapsRef = useRef<Map<string, MaplibreMap>>(new Map());
  const selectionSemanticIdentifierRef = useRef<string | undefined>(undefined);
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

  // State and Selectors
  const backgroundLayer = useSelector(getBackgroundLayer);
  const {
    //activeFramework: currentFramework, trigger re-renders on framework change
    // State values that trigger re-renders when framework changes
    isCesium,
    // Stable getters for hooks and callbacks
    getIsCesium,
    getIsLeaflet,
    getIsTransitioning, // Check if framework transition in progress
  } = useMapFrameworkSwitcherContext();

  const markerAsset = models[CESIUM_CONFIG.markerKey]; //
  const markerAnchorHeight =
    CESIUM_CONFIG.markerAnchorHeight ?? DEFAULT_MARKER_ANCHOR_HEIGHT;
  const layers = useSelector(getLayers);
  const [maplibreMaps, setMaplibreMaps] = useState<MaplibreMap[]>([]);
  const uiMode = useSelector(getUIMode);
  const isModeMeasurement = uiMode === UIMode.MEASUREMENT;
  const isAnnotationSelectToolActive =
    activeToolType === ANNOTATION_SELECT_TOOL_ID;
  const is3dModelSelectionEnabled =
    !isModeMeasurement || isAnnotationSelectToolActive;
  const isModeFeatureInfo = uiMode === UIMode.FEATURE_INFO;
  const showHamburgerMenu = useSelector(getShowHamburgerMenu);
  const selectedFeature = useSelector(getSelectedFeature);
  const loadingFeatureInfo = useSelector(getLoading);
  const {
    selectedFeature: selectedAdhocFeature,
    clearSelectedFeature: clearSelectedAdhocFeature,
  } = useAdhocFeatureDisplay();

  const { getLeafletZoom } = useLeafletZoomControls();
  const minHeight =
    typeof minimumCameraHeight === "number" &&
    Number.isFinite(minimumCameraHeight)
      ? Math.max(0, minimumCameraHeight)
      : 0;
  const minFlyToRange = minHeight * 1.5;

  useGeoportalHelpOverlays();

  const {
    // routedMapRef --- NOT a REF!
    realRoutedMapRef: routedMapRef,
  } = useContext<typeof TopicMapContext>(TopicMapContext);

  const getLeafletMap = useCallback(
    () => routedMapRef.current?.leafletMap?.leafletElement,
    [routedMapRef]
  );

  const {
    homeValidationCenter,
    initialCameraView: cesiumInitialCameraView,
    isInitialCameraResolved,
  } = useGeoportalInitialValues();

  const markerRef = useRef(undefined);
  const markerAccentRef = useRef(undefined);
  const [pos, setPos] = useState<[number, number] | null>(null);
  // TODO: move all these to a custom hook and collect all calls to updateFeatureInfo there
  const [shouldUpdateFeatureInfo, setShouldUpdateFeatureInfo] =
    useState<boolean>(false);
  const layersIdle = useSelector(getLayersIdle);
  const triggerFeatureInfoUpdate = useSelector(getTriggerFeatureInfoUpdate);
  const mapInteractionEnabled = useSelector(getUIMapInteractionEnabled);
  const hashWriteEnabled = useSelector(getUIHashWriteEnabled);
  const visibleControls = useSelector(getUIVisibleControls);

  useEffect(() => {
    const maps = layers
      .filter((l) => l.layerType === "vector" && l.visible)
      .map((l) => maplibreMapsRef.current.get(l.id))
      .filter((m) => m !== undefined);
    if (maplibreMaps.length !== maps.length) {
      setMaplibreMaps(maps);
    }
  }, [layers, layersIdle]);

  // custom hooks
  const flags = useFeatureFlags();
  const { isDebugMode } = flags;
  const { isObliqueMode, leaveObliqueMode } =
    useObliqueInitializer(isDebugMode);

  const previousPositionRef = useRef<{
    lat: number;
    lng: number;
    zoom: number;
  } | null>(null);

  const updateLayersIdleState = useCallback(
    (skipPositionChangeCheck?: boolean) => {
      if (layersIdle) {
        const leaflet = getLeafletMap();
        if (leaflet) {
          const center = leaflet.getCenter();
          const zoom = leaflet.getZoom();
          const newPosition = { lat: center.lat, lng: center.lng, zoom };

          if (previousPositionRef.current && !skipPositionChangeCheck) {
            const prev = previousPositionRef.current;
            const positionChanged =
              Math.abs(newPosition.lat - prev.lat) > 0.0001 ||
              Math.abs(newPosition.lng - prev.lng) > 0.0001 ||
              newPosition.zoom !== prev.zoom;

            if (!positionChanged) {
              console.debug("Position unchanged, skipping idle state update");
              return;
            }
          }

          previousPositionRef.current = newPosition;
        }

        console.debug("Layers are idle, setting layers idle to false");
        dispatch(setLayersIdle(false));
      }
    },
    [layersIdle, dispatch, getLeafletMap]
  );

  useDispatchSachdatenInfoText();
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

  const routingOptions = useMemo(
    () => ({
      getLeafletMap,
      getLeafletZoom,
      isHashWriteEnabled: () => {
        if (!hashWriteEnabled) {
          return false;
        }

        if (getIsTransitioning()) {
          return false;
        }

        if (getIsCesium()) {
          return initialViewApplied;
        }

        return isInitialCameraResolved;
      },
      labels: {
        writeLeafletLike: "GPM:2D:writeLocation",
        topicMapLocation: "GPM:TopicMap:locationChangedHandler",
        cesiumScene: "GPM:3D",
      },
    }),
    [
      getLeafletMap,
      getLeafletZoom,
      getIsTransitioning,
      getIsCesium,
      hashWriteEnabled,
      initialViewApplied,
      isInitialCameraResolved,
    ]
  );

  const { handleTopicMapLocationChange } = useMapHashRouting(routingOptions);

  const cesiumScene = getScene();

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
    getLeafletMap,
    getCesiumTerrainProviders,
    allow3d,
    isCommitEnabled: !getIsTransitioning(),
    onBeforeTransitionToCesium: stageCesiumPrimitivesForTransition,
    onBeforeTransitionToLeaflet: leaveObliqueMode,
  });

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

  const { gazData } = useGazData();

  useFeatureInfoModeCursorStyle();

  const onComplete = useCallback(
    (selection: SelectionItem) => {
      if (layers.filter((l) => l.layerType === "vector").length === 0) return;
      selectionSemanticIdentifierRef.current =
        selection.semanticIdentifier ?? undefined;
      // Note: This callback is only called from useSelectionTopicMap for Leaflet selections
      // No need to check getIsLeaflet() here - it's redundant and causes stale closure issues
      if (
        (uiMode === UIMode.DEFAULT || uiMode === UIMode.FEATURE_INFO) &&
        !isAreaType(selection.type as ENDPOINT) &&
        !getIsCesium()
      ) {
        const selectedPos = getFromWebMercatorToWGS84([
          selection.x,
          selection.y,
        ]);
        const leaflet = getLeafletMap();
        const layersIdle = getLayersIdle(store.getState());

        if (!leaflet || !layersIdle) {
          console.debug(
            "[GAZETTEER-SELECTION] No leaflet map available, retrying..."
          );
          setTimeout(() => {
            onComplete(selection);
          }, 20);
          return;
        }

        // builtInGazetteerHitTrigger moves the map and loads layers before calling this
        // We need to delay the virtual click to ensure layers have rendered
        console.debug(
          "[GAZETTEER-SELECTION] Scheduling virtual click after delay..."
        );
        setTimeout(() => {
          const updatedPos = { lat: selectedPos[1], lng: selectedPos[0] };
          const latlngPoint = L.latLng(updatedPos);

          console.debug(
            "[GAZETTEER-SELECTION] Firing virtual click",
            updatedPos
          );
          leaflet.fireEvent("click", {
            latlng: latlngPoint,
            layerPoint: leaflet.latLngToLayerPoint(latlngPoint),
            containerPoint: leaflet.latLngToContainerPoint(latlngPoint),
          });
        }, CLICK_DELAY_MS);
      }
    },
    [layers, uiMode, getLeafletMap]
  );

  const updateFeatureInfoLeaflet = useCallback(() => {
    setShouldUpdateFeatureInfo(false);
    if (!pos) return;

    setTimeout(() => {
      const latlngPoint = L.latLng(pos);
      const leaflet = getLeafletMap();
      leaflet &&
        leaflet.fireEvent("click", {
          latlng: latlngPoint,
          layerPoint: leaflet.latLngToLayerPoint(latlngPoint),
          containerPoint: leaflet.latLngToContainerPoint(latlngPoint),
        });
    }, 150);
  }, [pos, getLeafletMap]);

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

  const selectionTopicMapOptions = useMemo(
    () => ({
      onComplete,
      padding: selectionPadding,
    }),
    [onComplete]
  );

  useSelectionTopicMap(selectionTopicMapOptions);
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

  useEffect(() => {
    if (layers.length === 0) {
      dispatch(setSecondaryInfoBoxElements([]));
      dispatch(setFeatures([]));
      dispatch(setSelectedFeature(null));
    } else {
      updateLayersIdleState(true);
    }
  }, [layers]);

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

  useEffect(() => {
    const leaflet = getLeafletMap();
    if (
      uiMode !== UIMode.FEATURE_INFO &&
      markerRef.current !== undefined &&
      leaflet
    ) {
      leaflet.removeLayer(markerRef.current);
      leaflet.removeLayer(markerAccentRef.current);
      // Clear refs when leaving feature info mode
      markerRef.current = undefined;
      markerAccentRef.current = undefined;
      dispatch(setSelectedFeature(null));
      dispatch(setSecondaryInfoBoxElements([]));
      dispatch(setFeatures([]));
      setPos(null);
      dispatch(setPreferredLayerId(""));
    }
  }, [uiMode, getLeafletMap, dispatch]);

  useEffect(() => {
    if (isModeFeatureInfo) {
      setShouldUpdateFeatureInfo(true);
    }
  }, [maplibreMaps]);

  useEffect(() => {
    const leaflet = getLeafletMap();
    if (!leaflet) {
      return;
    }
    const navigationHandlers = [
      leaflet.dragging,
      leaflet.touchZoom,
      leaflet.doubleClickZoom,
      leaflet.scrollWheelZoom,
      leaflet.boxZoom,
      leaflet.keyboard,
      leaflet.tap,
    ];
    navigationHandlers.forEach((handler) => {
      if (!handler) {
        return;
      }
      if (mapInteractionEnabled) {
        handler.enable();
      } else {
        handler.disable();
      }
    });
  }, [mapInteractionEnabled, getLeafletMap]);

  useEffect(() => {
    const leaflet = getLeafletMap();

    const handleZoomEnd = () => {
      setShouldUpdateFeatureInfo(true);
    };

    leaflet && leaflet.on("zoomend", handleZoomEnd);

    // Clean up the event listener when the component unmounts
    return () => {
      leaflet && leaflet.off("zoomend", handleZoomEnd);
    };
  }, [getLeafletMap]);

  const renderInfoBox = useCallback(() => {
    if (!visibleControls.infoBox) {
      return <div></div>;
    }
    const hasVisibleSavedAnnotationLayer = layers.some(
      isVisible3dAnnotationAdhocLayer
    );
    const selectedFeatureInMeasurementMode =
      getIsCesium() && isAnnotationSelectToolActive ? selectedFeature : null;
    const shouldRenderAnnotationInfoBox =
      getIsCesium() &&
      (isModeMeasurement ||
        (!selectedFeature && hasVisibleSavedAnnotationLayer));

    if (isModeMeasurement && selectedFeatureInMeasurementMode) {
      return (
        <FeatureInfoBox
          onZoomToFeature={handleZoomToFeature}
          displayOrbit={true}
          isOrbiting={isOrbiting}
          onOrbitToggle={toggleOrbit}
        />
      );
    }

    if (shouldRenderAnnotationInfoBox) {
      return <AnnotationInfoBox />;
    }

    if (isModeMeasurement && getIsLeaflet()) {
      return <InfoBoxMeasurement key={uiMode} />;
    }

    if (getIsLeaflet()) {
      if (selectedFeature || loadingFeatureInfo) {
        return (
          <FeatureInfoBox pos={pos} onZoomToFeature={handleZoomToFeature} />
        );
      }
    } else if (getIsCesium() && selectedFeature) {
      // TODO unify with point queries for position information?
      return (
        <FeatureInfoBox
          onZoomToFeature={handleZoomToFeature}
          displayOrbit={true}
          isOrbiting={isOrbiting}
          onOrbitToggle={toggleOrbit}
        />
      );
    }

    return <div></div>;
  }, [
    getIsLeaflet,
    getIsCesium,
    layers,
    isModeMeasurement,
    uiMode,
    selectedFeature,
    loadingFeatureInfo,
    pos,
    handleZoomToFeature,
    isOrbiting,
    toggleOrbit,
    isAnnotationSelectToolActive,
    visibleControls.infoBox,
  ]);

  useEffect(() => {
    if (shouldUpdateFeatureInfo || triggerFeatureInfoUpdate > 0)
      updateFeatureInfoLeaflet();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldUpdateFeatureInfo, triggerFeatureInfoUpdate]);

  const topicMapLocationChangedHandler = useCallback(
    (p: { lat: number; lng: number; zoom: number }) => {
      // During transitions, don't update hash - let transition handle it
      // This prevents TopicMapContextProvider from reading and re-applying the hash
      if (getIsTransitioning()) {
        return;
      }
      if (!getIsLeaflet()) {
        return;
      }
      handleTopicMapLocationChange(p);
      updateLayersIdleState();
    },
    [
      getIsLeaflet,
      getIsTransitioning,
      handleTopicMapLocationChange,
      updateLayersIdleState,
    ]
  );

  const show2dContainer = !(isCesium && !initialViewApplied);

  const createLayerOptions = useMemo(
    () => ({
      mode: uiMode,
      dispatch,
      zoom: getLeafletZoom(),
      selectedFeature,
      leafletMap: getLeafletMap(),
      maplibreMapsRef,
      store,
      selectionSemanticIdentifierRef,
      setMaplibreMaps: (entry) => dispatch(setMaplibreMapsStore(entry)),
    }),
    [
      uiMode,
      dispatch,
      getLeafletZoom,
      selectedFeature,
      getLeafletMap,
      maplibreMapsRef,
      setMaplibreMapsStore,
    ]
  );

  // TODO Move out Controls to own component

  console.debug(
    "RENDER: [GEOPORTAL] MAP",
    rerenderCountRef.current,
    lastRenderIntervalRef.current
  );
  rerenderCountRef.current++;
  lastRenderIntervalRef.current = Date.now() - lastRenderTimeStampRef.current;
  lastRenderTimeStampRef.current = Date.now();

  return (
    <>
      <div
        className={"map-container-2d"}
        style={{
          zIndex: 400,
          visibility: show2dContainer ? "visible" : "hidden",
        }}
      >
        <TopicMapComponent
          gazData={gazData}
          modalMenu={<GeoportalModalMenu />}
          gazetteerSearchComponent={EmptySearchComponent}
          applicationMenuTooltipString={tooltipText}
          hamburgerMenu={showHamburgerMenu}
          locatorControl={false}
          fullScreenControl={false}
          zoomControls={false}
          mapStyle={{
            width,
            height,
            touchAction: "none",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "none",
            // blocks clicks/drag/wheel/touch while programmatic clicks
            // (e.g. the autoSelect flow) still work
            ...(mapInteractionEnabled ? {} : { pointerEvents: "none" }),
          }}
          leafletMapProps={{ editable: true }}
          minZoom={10}
          backgroundlayers="empty"
          mappingBoundsChanged={() => {
            // intentionally no-op
          }}
          locationChangedHandler={topicMapLocationChangedHandler}
          outerLocationChangedHandlerExclusive={true}
          onclick={(e) => {
            const map = getLeafletMap();
            if (!map) return;

            if (uiMode === UIMode.FEATURE_INFO) {
              // Use refs for removal to avoid stale closure issues on zoom change
              if (markerRef.current !== undefined) {
                map.removeLayer(markerRef.current);
              }
              if (markerAccentRef.current !== undefined) {
                map.removeLayer(markerAccentRef.current);
              }

              map.getPane(
                "markerPaneWithBlendModeDifference"
              ).style.zIndex = 601;
              const newMarkerAccent = L.marker([e.latlng.lat, e.latlng.lng], {
                // pane: "backgroundlayerTooltips",
                icon: L.divIcon({
                  className: "custom-marker", // Optional class for external styles
                  html: `
                          <div style="
                            position: relative;
                            width: 30px;
                            height: 30px;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            opacity: 1;
                          ">
                            <div style="
                              position: absolute;
                              width: 20px;
                              height: 20px;
                              border: 2px solid black;
                              border-radius: 50%;
                            "></div>
                            <div style="
                              position: absolute;
                              width: 20000px;
                              height: 1px;
                              background-color: black;
                              right: 18px;
                              opacity: 0.5;
                            "></div>
                            <div style="
                              position: absolute;
                              width: 20000px;
                              height: 1px;
                              background-color: black;
                              left: 18px;
                              opacity: 0.5;
                            "></div>
                            <div style="
                              position: absolute;
                              width: 1px;
                              height: 20000px;
                              background-color: black;
                              top: 18px;
                              opacity: 0.5;
                            "></div>
                            <div style="
                              position: absolute;
                              width: 1px;
                              height: 20000px;
                              background-color: black;
                              bottom: 18px;
                              opacity: 0.5;
                            "></div>
                          </div>
                        `,
                  iconSize: [30, 30],
                }),
              }).addTo(map);
              markerAccentRef.current = newMarkerAccent;

              const newMarker = L.marker([e.latlng.lat, e.latlng.lng], {
                pane: "markerPaneWithBlendModeDifference",
                icon: L.divIcon({
                  className: "custom-marker", // Optional class for external styles
                  html: `
                          <div style="
                            position: relative;
                            width: 30px;
                            height: 30px;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                          ">
                             <div style="
                              position: absolute;
                              width: 6px;
                              height: 6px;
                              background-color: yellow;
                              border-radius: 50%;
                            ">
                          </div>
                        `,
                  iconSize: [30, 30],
                }),
              }).addTo(map);
              markerRef.current = newMarker;

              setPos([e.latlng.lat, e.latlng.lng]);
            }
            onClickTopicMap(e, {
              dispatch,
              mode: uiMode,
              store,
              zoom: getLeafletZoom(),
              map: map,
              maplibreMapsRef,
            });
          }}
          gazetteerSearchControl={true}
          infoBox={renderInfoBox()}
          zoomSnap={LEAFLET_CONFIG.zoomSnap}
          zoomDelta={LEAFLET_CONFIG.zoomDelta}
        >
          <TopicMapSelectionContent />
          {backgroundLayer &&
            backgroundLayer.visible &&
            getBackgroundLayers(
              backgroundLayer.layers,
              backgroundLayer.opacity
            )}

          {useCreateCismapLayers(layers, createLayerOptions)}
          <PrintPreview />
          <Measurements snappingLayers={maplibreMaps} />
        </TopicMapComponent>
        <AdhocSelectionSync maplibreMapsRef={maplibreMapsRef} />
      </div>
      {allow3d && isInitialCameraResolved && shouldMountCesium && (
        <CesiumHost
          id={GEOPORTAL_CESIUM_CONTAINER_ID}
          className={"map-container-3d"}
          style={MAP_CONTAINER_STYLE}
          onHostChange={handleCesiumHostChange}
          cameraLimiterOptions={CESIUM_CONFIG.camera}
          homeValidationCenter={homeValidationCenter}
          initialCameraView={cesiumInitialCameraView}
        />
      )}
    </>
  );
};

const GeoportalModalMenu = () => {
  const { jwt, setJWT } = useAuth();
  const { setAppMenuVisible } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);
  const { setSecondaryWithKey, showOverlayHandler } = useOverlayTourContext();
  const [isLoginFormVisible, setIsLoginFormVisible] = useState(false);
  const version = getApplicationVersion(versionData);

  const showOverlayFromOutside = useCallback(
    (key: string) => {
      setAppMenuVisible(false);
      setSecondaryWithKey(key);
      showOverlayHandler();
    },
    [setAppMenuVisible, setSecondaryWithKey, showOverlayHandler]
  );

  return (
    <GenericModalApplicationMenu
      {...getCollabedHelpComponentConfig({
        versionString: version,
        showOverlayFromOutside,
        loginFormToggle: () => setIsLoginFormVisible(!isLoginFormVisible),
        isLoginFormVisible,
        loginForm: (
          <LoginForm
            onSuccess={() => {
              setIsLoginFormVisible(false);
              setAppMenuVisible(false);
            }}
            closeLoginForm={() => setIsLoginFormVisible(false)}
          />
        ),
        loginFormTrigger: (
          <Tooltip title={jwt ? "Abmeldung" : "Anmeldung"} zIndex={99999999}>
            <Button
              type="text"
              onClick={() =>
                jwt ? setJWT(null) : setIsLoginFormVisible(!isLoginFormVisible)
              }
            >
              <FontAwesomeIcon
                icon={jwt ? faArrowRightFromBracket : faKey}
                size="lg"
              />
            </Button>
          </Tooltip>
        ),
      })}
    />
  );
};

const LibreGeoportalMap = ({ allow3d }: MapProps) => {
  useGeoportalHelpOverlays();

  const showHamburgerMenu = useSelector(getShowHamburgerMenu);
  const visibleControls = useSelector(getUIVisibleControls);
  const mapInteractionEnabled = useSelector(getUIMapInteractionEnabled);
  const hashWriteEnabled = useSelector(getUIHashWriteEnabled);
  const { pathname } = useLocation();
  // resolved from the route, not from the store: the map is constructed on
  // mount and refreshExpiredTiles only takes effect at construction, so it
  // cannot wait for RoutedApp to dispatch
  const refreshExpiredTiles = useMemo(
    () => !findFachzwillingByPathname(pathname)?.disableExpiredTileRefresh,
    [pathname]
  );
  const { map: libreMap } = useLibreContext();
  const libreLayers = useLibreLayers();
  const uiMode = useSelector(getUIMode);
  const isModeMeasurement = uiMode === UIMode.MEASUREMENT;
  const libreDrawMode = useSelector(getLibreDrawMode);
  const { selectedFeature: selectedMeasurement } = useMeasurements();
  const {
    pos,
    onSelectionChanged: handleLibreSelectionChanged,
    selectFromHits: handleLibreSelectFromHits,
  } = useLibreMapSelectionHandler(libreMap);

  const { isCesium, getIsCesium } = useMapFrameworkSwitcherContext();
  const {
    getScene,
    getTerrainProvider,
    getSurfaceProvider,
    isRuntimeReady,
    withTerrainProvider,
    withSurfaceProvider,
    initialViewApplied,
    models,
    currentSceneStyle,
  } = useCesiumContext();

  const markerAsset = models[CESIUM_CONFIG.markerKey];
  const markerAnchorHeight =
    CESIUM_CONFIG.markerAnchorHeight ?? DEFAULT_MARKER_ANCHOR_HEIGHT;
  const {
    homeValidationCenter,
    initialCameraView: cesiumInitialCameraView,
    isInitialCameraResolved,
  } = useGeoportalInitialValues();
  // CesiumHost owns its container element and reports it via onHostChange;
  // keep it in state so getCesiumContainer can hand it to the framework switcher.
  const [cesiumContainerElement, setCesiumContainerElement] =
    useState<HTMLElement | null>(null);
  const [shouldMountCesium, setShouldMountCesium] = useState(false);
  const [switchInitialCameraView, setSwitchInitialCameraView] =
    useState<ReturnType<typeof readInitialCameraViewFromViewState>>(undefined);
  const wasCesiumRef = useRef(isCesium);
  const coldSurfaceAnchorStartedRef = useRef(false);

  const maplibreBridge = useMaplibreRuntimeBridge({
    id: "geoportal-maplibre",
    map: libreMap,
    enabled: !isCesium,
    claimOnInteraction: true,
  });

  useEffect(() => {
    const wasCesium = wasCesiumRef.current;
    wasCesiumRef.current = isCesium;

    if (!allow3d || !isCesium) {
      return;
    }

    if (!libreMap) {
      if (!shouldMountCesium) {
        setShouldMountCesium(true);
      }
      return;
    }
    if (!coldSurfaceAnchorStartedRef.current && !shouldMountCesium) {
      coldSurfaceAnchorStartedRef.current = true;

      (async () => {
        const surfaceProvider = getSurfaceProvider();
        const terrainProvider = getTerrainProvider();
        const provider = isValidCesiumTerrainProvider(surfaceProvider)
          ? surfaceProvider
          : terrainProvider;

        const center = libreMap.getCenter();
        let groundHeightM = SWITCH_SURFACE_FALLBACK_HEIGHT_M;
        if (isValidCesiumTerrainProvider(provider)) {
          const [sampled] = await sampleTerrainMostDetailedGuardedAsync(
            provider,
            [
              Cartographic.fromDegrees(
                center.lng,
                center.lat,
                SWITCH_SURFACE_FALLBACK_HEIGHT_M
              ),
            ]
          );
          if (sampled && Number.isFinite(sampled.height)) {
            groundHeightM = sampled.height;
          }
        }

        const correctedViewState = readFromMaplibre(
          libreMap,
          "geoportal-maplibre",
          { altitudeM: groundHeightM }
        );
        if (correctedViewState) {
          maplibreBridge.pushState(correctedViewState, "sync");
          setSwitchInitialCameraView(
            readInitialCameraViewFromViewState(correctedViewState)
          );
        }

        setShouldMountCesium(true);
      })();
      return;
    }

    if (!wasCesium) {
      const maplibreViewState = readFromMaplibre(
        libreMap,
        "geoportal-maplibre"
      );
      if (maplibreViewState) {
        setSwitchInitialCameraView(
          readInitialCameraViewFromViewState(maplibreViewState)
        );
      }
    }
  }, [
    allow3d,
    isCesium,
    libreMap,
    shouldMountCesium,
    getSurfaceProvider,
    getTerrainProvider,
    maplibreBridge,
  ]);

  const handleCesiumHostChange = useCallback(({ element }: CesiumHostState) => {
    setCesiumContainerElement((previous) =>
      previous === element ? previous : element
    );
  }, []);

  const getCesiumContainer = useCallback(
    () => cesiumContainerElement,
    [cesiumContainerElement]
  );
  const getCesiumTerrainProviders = useCallback(
    () => ({
      TERRAIN: getTerrainProvider() ?? null,
      SURFACE: getSurfaceProvider() ?? null,
    }),
    [getSurfaceProvider, getTerrainProvider]
  );

  useRegisterMapFramework({
    getLeafletMap: () => null,
    getCesiumScene: getScene,
    getCesiumContainer,
    getCesiumTerrainProviders,
  });

  const cesiumScene = getScene();
  useCesiumNavigationBridge({
    id: GEOPORTAL_CESIUM_VIEW_ADAPTER_ID,
    scene: cesiumScene,
    isSyncEnabled: isCesium && isRuntimeReady && Boolean(cesiumScene),
    isCommitEnabled: isCesium && initialViewApplied,
  });

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
  useSelectionCesium(getIsCesium, selectionCesiumOptions);

  return (
    <>
      <div style={{ visibility: isCesium ? "hidden" : "visible" }}>
        <CarmaMap
          appKey="geoportal"
          mapEngine="maplibre"
          backgroundLayers={null}
          zoomControls={false}
          fullScreenControl={false}
          terrainControl={false}
          compassControl={false}
          locatorControl={false}
          gazetteerSearchControl={false}
          modalMenuControl={showHamburgerMenu}
          libreLayers={libreLayers}
          disableInternalSelection={true}
          hashWriteEnabled={hashWriteEnabled}
          refreshExpiredTiles={refreshExpiredTiles}
          interactive={mapInteractionEnabled}
          selectionEnabled={mapInteractionEnabled && !isModeMeasurement}
          onSelectionChanged={handleLibreSelectionChanged}
          selectFromHits={handleLibreSelectFromHits}
          modalMenu={<GeoportalModalMenu />}
        />
        {isModeMeasurement && <MeasurementHost mode={libreDrawMode} snapping />}
        {visibleControls.infoBox &&
          (isModeMeasurement || selectedMeasurement ? (
            <MeasurementInfoBox selectionPadding={selectionPadding} />
          ) : (
            <FeatureInfoBox pos={pos ?? undefined} />
          ))}
      </div>
      {allow3d && isInitialCameraResolved && shouldMountCesium && (
        <CesiumHost
          id={GEOPORTAL_CESIUM_CONTAINER_ID}
          className={"map-container-3d"}
          style={{
            ...MAP_CONTAINER_STYLE,
            visibility: isCesium ? "visible" : "hidden",
            opacity: isCesium ? 1 : 0,
            pointerEvents: isCesium ? "auto" : "none",
          }}
          onHostChange={handleCesiumHostChange}
          cameraLimiterOptions={CESIUM_CONFIG.camera}
          homeValidationCenter={homeValidationCenter}
          initialCameraView={switchInitialCameraView ?? cesiumInitialCameraView}
        />
      )}
    </>
  );
};

export const GeoportalMap = (props: MapProps) => {
  const flags = useFeatureFlags();
  const useLibreMap = flags.featureFlagLibreMap;

  return useLibreMap ? (
    <LibreGeoportalMap {...props} />
  ) : (
    <LeafletGeoportalMap {...props} />
  );
};

export default GeoportalMap;
