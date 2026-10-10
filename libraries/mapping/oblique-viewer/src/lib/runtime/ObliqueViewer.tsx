import {
  catalogFilterActive,
  filterObliqueCatalog,
  catalogImageExtent,
  EMPTY_CATALOG_IMAGE_FILTER,
  type CatalogImageFilter,
} from "../core/utils/catalog-image-filter";
import { ObliquePoolDebug } from "./ObliquePoolDebug";
import {
  createPhotoReferencePoints,
  photoReferenceDistanceMeters,
} from "./utils/photo-reference-points";
import { physicalImageQueryTarget } from "./utils/image-selection-ecef";
import { rankImagesForView } from "../core/utils/selection";
import { useImageCenterDebug } from "./hooks/useImageCenterDebug";
import type { ScenePreviewImageMapping } from "./hooks/useScenePreviewImage";
import { createHoverCandidatePrefetch } from "./utils/hover-candidate-prefetch";
import { previewBackdropTint } from "./utils/preview-backdrop";
import { prewarmNavigationGroup } from "./utils/navigation-prefetch";
import { createHoverPhotoDrape } from "./utils/hover-photo-drape";
import type { ImageView } from "@carma-commons/image-pyramid";
import { createPreparedPreviewBridge } from "./utils/prepared-preview-bridge";
import { createPhotoPreviewCrossfade } from "./utils/photo-preview-crossfade";
import { panBrowsingCamera } from "./utils/pan-browsing-camera";
import {
  uprightPreviewCamera,
  tweenPreviewCameraUpright,
} from "./utils/upright-preview-camera";
import {
  preparePreviewFlight,
  preparePreviewLanding,
  previewLandingProjection,
  previewLandingView,
} from "./utils/prepare-preview-flight";
import {
  originalOf,
  pyramidOf,
  pyramidOptionsOf,
  type ObliqueViewportPhoto,
} from "./utils/oblique-viewport-source";
import {
  nativePixelPool,
  nativePreviewSource,
  fitNativePreviewView,
  lastNativePreviewView,
  rememberNativePreviewView,
} from "./utils/native-preview-pool";
import type {
  Degrees,
  CssPixels,
  DevicePixels,
  Meters,
  Radians,
  Ratio,
} from "@carma-units";
import {
  lazy,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  prefetchPreviewThumbnail,
  disposePreviewThumbnailPrefetch,
  isPreviewSourceMissing,
  reportPreviewSourceMissing,
  subscribePreviewThumbnail,
  type ThumbnailSource,
} from "./utils/preview-thumbnail-cache";
import { MercatorCoordinate, type Map as MaplibreMap } from "maplibre-gl";
import { Matrix4, Raycaster, Vector3 } from "three";
import {
  imageProjectionMatrix,
  sceneToPhotoEnu,
  viewportCenterPlaneAnchor,
  viewportImageCoversViewport,
} from "../core/utils/image-projection";
import { projectObjectCoveragePoint } from "../core/utils/object-coverage";
import { getBrowsingPitchDeg } from "../core/utils/browsing-pitch";
import {
  getSeriesCardinalHeadings,
  nextSeriesCardinalHeading,
} from "../core/utils/series-cardinal-headings";
import {
  createPhotoRotationDrape,
  type PhotoRotationDrape,
  type PhotoNeighborDrapeTransition,
  type PhotoRotationDrapeTransition,
} from "./utils/photo-rotation-drape";
import {
  acquireSharedThreeScene,
  isForegroundNetworkHeld,
  subscribeForegroundNetwork,
  getSharedThreeSceneRuntimes,
  getSharedThreeTerrainElevation,
} from "@carma-mapping/engines/maplibre";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faImages } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import {
  createPhotoAxisPicker,
  type PhotoAxisSurfaceMode,
} from "./utils/photo-axis-picker";
import { clamp } from "@carma-commons/math";

import {
  degToRad as degreesToRadians,
  degToRadNumeric as degToRad,
  radToDegNumeric as radToDeg,
  zeroToTwoPi,
} from "@carma-units";
import {
  Control,
  ControlButtonStyler,
} from "@carma-mapping/map-controls-layout";

import {
  BACKDROP_LOOK_DEFAULT,
  DEFAULT_CONTROL_ORDER,
  DEFAULT_CONTROL_POSITION,
  resolveSeries,
  type ObliqueViewerConfig,
} from "../core/config";
import type {
  AnimationConfig,
  ObliqueDataset,
  CardinalDirection,
  NearestObliqueImageRecord,
  ObliqueGroundTarget,
  ObliqueImageRecord,
  ObliqueViewMode,
  ObliquePreviewState,
} from "../core/types";
import {
  calibrationImageOffset,
  getCameraCalibration,
} from "../core/utils/calibration";
import { footprintSeriesLabel } from "../core/utils/footprint-marker";
import { useActiveDirection } from "./hooks/useActiveDirection";
import { useFootprintLayer } from "./hooks/useFootprintLayer";
import { useVisibleFootprints } from "./hooks/useVisibleFootprints";
import {
  groundDistanceM,
  readCameraToCenterDistancePx,
} from "./utils/cameraMath";
import { qualifiedImageId } from "../core/utils/imageRecord";
import { useFovWheelZoom } from "./hooks/useFovWheelZoom";
import { usePreviewPan } from "./hooks/usePreviewPan";
import {
  useSeamlessPreviewNavigation,
  type SeamlessPreviewView,
} from "./hooks/useSeamlessPreviewNavigation";
import { useNearestImage } from "./hooks/useNearestImage";
import {
  useObliqueNavigationTargets,
  type PreparedObliqueNavigationTarget,
} from "./hooks/useObliqueNavigationTargets";
import { useObliqueCameraMode } from "./hooks/useObliqueCameraMode";
import { useObliqueData } from "./hooks/useObliqueData";
import { useBasemapStarted } from "./hooks/useBasemapStarted";
import { useObliqueDirectionKeybindings } from "./hooks/useObliqueDirectionKeybindings";
import { useQueryCursor, useViewModeRequest } from "./hooks/useQueryCursor";
import {
  OBLIQUE_STATE_DEFAULT,
  OBLIQUE_NAVIGATION_KEYS,
  type ObliqueNavigationKey,
  type ObliqueNavigationTargets,
  useObliqueViewerActions,
} from "./oblique-actions";
import { ObliqueImagePreview } from "./ObliqueImagePreview";
import { usePreviewTransitionBackdrop } from "./hooks/usePreviewTransitionBackdrop";
import { usePhotoMosaic } from "./hooks/usePhotoMosaic";
import { getCardinalDirectionFromHeading } from "../core/utils/orientation";
import {
  photoCenterRays,
  sceneToPresentationPoint,
} from "../core/utils/photo-center-rays";
import { ObliqueOverlay } from "./ObliqueOverlay";
import { ObliqueNavigation } from "./ObliqueNavigation";
import {
  getObliqueViewerExtension,
  type ObliqueViewerExtension,
  type ObliqueViewerExtensionController,
} from "./oblique-viewer-extensions";
import { strings } from "./strings.de";
import {
  flyToPose,
  poseOf,
  resolveCameraAltitude,
  settleToPitch,
} from "./utils/flyToImage";
import { getImageUrls } from "./utils/imageUrls";
import type { ObliqueDownloadOptions } from "./utils/imageUrls";
import { FREE_MAX_PITCH_DEG, type CameraFlight } from "./utils/obliqueCamera";
import {
  beginInteractionProfile,
  interactionProfile,
} from "./utils/interaction-profile";

const ObliqueCatalogBrowser = lazy(() =>
  import("./ObliqueCatalogBrowser").then((module) => ({
    default: module.ObliqueCatalogBrowser,
  }))
);
const ObliqueDebug = lazy(() => import("./ObliqueDebug"));

const ON_COLOR = "#1677ff";
const OFF_COLOR = "#000000";
const EMPTY_CONFIG: ObliqueViewerConfig = {};
const EMPTY_EXTENSIONS: readonly ObliqueViewerExtension[] = [];

/** Metadata and renderer orchestration; the host supplies state through the actions context. */
export const ObliqueViewer = ({
  config,
  libreMap,
  extensions = EMPTY_EXTENSIONS,
}: {
  config?: ObliqueViewerConfig;
  libreMap: MaplibreMap | null;
  extensions?: readonly ObliqueViewerExtension[];
}) => {
  const viewerConfig = config ?? EMPTY_CONFIG;
  const uri = viewerConfig.seriesConfigURI;
  const basemapStarted = useBasemapStarted(
    libreMap,
    libreMap !== null && !!uri,
    true
  );
  const { publish, isOn } = useObliqueViewerActions();
  // Capture before the catalog resolves: restoring an active addon is not a
  // new entry. Any later explicit switch-on uses the ordinary entry flight.
  const resumeInitialViewRef = useRef(isOn);
  if (!isOn) resumeInitialViewRef.current = false;
  const [remote, setRemote] = useState<{
    uri: string;
    series: ObliqueDataset[];
  } | null>(null);
  const inlineSeries = useMemo(
    () => resolveSeries(viewerConfig),
    [viewerConfig.series, viewerConfig.animations, viewerConfig.seriesOverrides]
  );
  useEffect(() => {
    if (!uri || !basemapStarted) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        controller.abort(
          new Error("Bildserien konnten nicht rechtzeitig geladen werden.")
        ),
      20000
    );
    let disposed = false;
    publish({ isLoading: true, error: null });
    void (async () => {
      const response = await fetch(uri, {
        signal: controller.signal,
        cache: "no-cache",
      });
      if (!response.ok)
        throw new Error(`Bildserien-Konfiguration: HTTP ${response.status}`);
      if (Number(response.headers.get("Content-Length")) > 1024 * 1024) {
        await response.body?.cancel();
        throw new Error("Bildserien-Konfiguration ist zu groß.");
      }
      const document = await response.json();
      if (
        document?.schemaVersion !== 1 ||
        !Array.isArray(document.series) ||
        document.series.length === 0
      )
        throw new Error("Ungültige Bildserien-Konfiguration.");
      const series = resolveSeries({ series: document.series });
      if (!disposed) setRemote({ uri, series });
    })()
      .catch((error: unknown) => {
        if (!disposed)
          publish({
            isLoading: false,
            error:
              error instanceof Error
                ? error.message
                : "Bildserien konnten nicht geladen werden.",
          });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [uri, basemapStarted, publish]);
  const series = uri
    ? remote?.uri === uri
      ? remote.series
      : undefined
    : inlineSeries;
  const resolved = useMemo(
    () => (series ? { ...viewerConfig, series } : null),
    [viewerConfig, series]
  );
  return resolved && series?.length ? (
    <ObliqueViewerRuntime
      config={resolved}
      libreMap={libreMap}
      extensions={extensions}
      resumeInitialView={resumeInitialViewRef.current}
    />
  ) : null;
};

const ObliqueViewerRuntime = ({
  config,
  libreMap,
  extensions,
  resumeInitialView,
}: {
  config: ObliqueViewerConfig;
  libreMap: MaplibreMap | null;
  extensions: readonly ObliqueViewerExtension[];
  resumeInitialView: boolean;
}) => {
  const viewerConfig = config ?? EMPTY_CONFIG;
  const { isDebugMode } = useFeatureFlags();
  const {
    showControl = true,
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
    heightOffset = 0,
    nextInterface = false,
  } = viewerConfig;
  const configuredSeries = useMemo(
    () => resolveSeries(viewerConfig),
    [viewerConfig]
  );
  // Shared FOV/height policy stays stable; browsing pitch follows enabled catalogs.
  const browsingDataset = configuredSeries[0];
  const {
    isOn,
    panelOpen,
    previewVisible,
    isBusy,
    enabledSeriesIds,
    lastActiveSeriesId,
    selectedSeriesId: previousSelectedSeriesId,
    bearingDeg: currentBearingDeg,
    selectionStrategy: configuredSelectionStrategy,
    rotationSurface,
    mapStyle3dEnabled,
    previewBasemapLabels: configuredBasemapLabels,
    previewRotationDrape: configuredNavigationDrape,
    previewNavigationMode,
    previewSeamless,
    previewSeamlessMode,
    previewSeamlessCenterY,
    previewUprightOnlyWhenCovered,
    previewHoverDrape: configuredHoverDrape,
    previewCenterDebug,
    previewOpticalCenterDebug,
    previewScreenCenterDebug,
    previewPoolDebug,
    request,
    toggle,
    publish,
    clearRequest,
    setEnabledSeriesIds,
  } = useObliqueViewerActions();
  const previewBasemapLabels =
    configuredBasemapLabels && (!nextInterface || mapStyle3dEnabled);
  const previewHoverDrape =
    configuredHoverDrape && (!nextInterface || !previewSeamless);
  // Seamless owns its projected handovers independently of the mutually
  // exclusive optional navigation effect used by ordinary photo browsing.
  const navigationDrapeEnabled =
    configuredNavigationDrape || (nextInterface && previewSeamless);
  const enabledIds = useMemo(
    () =>
      enabledSeriesIds ??
      configuredSeries
        .filter((series) => series.enabledByDefault !== false)
        .map((series) => series.id),
    [enabledSeriesIds, configuredSeries]
  );
  const enabledSet = useMemo(() => new Set(enabledIds), [enabledIds]);
  const enabledToken = JSON.stringify(enabledIds);
  const enabledSeries = useMemo(
    () => configuredSeries.filter((series) => enabledSet.has(series.id)),
    [configuredSeries, enabledSet]
  );
  const selectionStrategy =
    nextInterface || enabledSeries.length > 1
      ? configuredSelectionStrategy
      : OBLIQUE_STATE_DEFAULT.selectionStrategy;
  const prioritySeriesId =
    viewerConfig.prioritySeriesId ??
    viewerConfig.previewState?.initial?.seriesId;
  const initialSeriesEnabledRef = useRef(false);
  useEffect(() => {
    if (
      initialSeriesEnabledRef.current ||
      !prioritySeriesId ||
      !configuredSeries.some((series) => series.id === prioritySeriesId)
    )
      return;
    initialSeriesEnabledRef.current = true;
    if (!enabledSet.has(prioritySeriesId))
      setEnabledSeriesIds([...enabledIds, prioritySeriesId]);
  }, [
    prioritySeriesId,
    configuredSeries,
    enabledSet,
    enabledIds,
    setEnabledSeriesIds,
  ]);
  const enabledSetRef = useRef(enabledSet);
  enabledSetRef.current = enabledSet;
  const running = isOn && libreMap !== null;
  useEffect(() => {
    if (!running) disposePreviewThumbnailPrefetch();
    return () => disposePreviewThumbnailPrefetch();
  }, [running]);
  const runningRef = useRef(running);
  runningRef.current = running;
  // Embedded one-photo catalogues create their own preview scene; waiting for
  // an ordinary basemap terrain runtime here would hit the 12-second fallback.
  const embeddedOnly =
    enabledSeries.length > 0 &&
    enabledSeries.every((series) => !!series.inlineCatalog);
  const basemapStarted = useBasemapStarted(
    libreMap,
    running && !embeddedOnly,
    true
  );
  const [viewMode, setViewMode] = useState<ObliqueViewMode>("oblique");
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const [catalogBrowserOpen, setCatalogBrowserOpen] = useState(false);
  const [catalogFilter, setCatalogFilter] = useState<CatalogImageFilter>(
    EMPTY_CATALOG_IMAGE_FILTER
  );
  const deferredCatalogFilter = useDeferredValue(catalogFilter);
  const catalogFilterKey =
    nextInterface && catalogFilterActive(deferredCatalogFilter)
      ? JSON.stringify(deferredCatalogFilter)
      : "";
  const catalogFilterKeyRef = useRef(catalogFilterKey);
  catalogFilterKeyRef.current = catalogFilterKey;
  const {
    data: catalogData,
    isLoading,
    isAllDataReady,
    isCatalogComplete,
    error,
    perSeries,
    awaitDirection,
    awaitAll,
    holdIdleCatalogLoads,
  } = useObliqueData(
    enabledSeries,
    running &&
      (embeddedOnly || basemapStarted) &&
      !(
        prioritySeriesId &&
        !initialSeriesEnabledRef.current &&
        configuredSeries.some((series) => series.id === prioritySeriesId) &&
        !enabledSet.has(prioritySeriesId)
      ),
    {
      prioritySeriesId,
      priorityImageId: viewerConfig.previewState?.initial?.imageId,
      priorityHeadingRad: degreesToRadians(
        (libreMap?.getBearing() ?? currentBearingDeg) as Degrees
      ),
      priorityCameraView: viewMode === "nadir" ? "nadir" : undefined,
    }
  );
  useEffect(() => {
    if (!libreMap || !running) return;
    let release: (() => void) | undefined;
    const sync = () => {
      if (isForegroundNetworkHeld(libreMap)) release ??= holdIdleCatalogLoads();
      else {
        release?.();
        release = undefined;
      }
    };
    const unsubscribe = subscribeForegroundNetwork(libreMap, sync);
    sync();
    return () => {
      unsubscribe();
      release?.();
    };
  }, [libreMap, running, holdIdleCatalogLoads]);
  const data = useMemo(
    () =>
      nextInterface
        ? filterObliqueCatalog(catalogData, deferredCatalogFilter)
        : catalogData,
    [catalogData, deferredCatalogFilter, nextInterface]
  );
  const currentDataRef = useRef(data);
  currentDataRef.current = data;
  const alignmentConfig =
    enabledSeries.find(
      (series) => series.id === (lastActiveSeriesId ?? previousSelectedSeriesId)
    ) ??
    enabledSeries[0] ??
    browsingDataset;
  const alignmentSeries =
    data?.datasets.get(alignmentConfig.id) ?? alignmentConfig;
  const alignmentHeadings = useMemo(
    () => getSeriesCardinalHeadings(alignmentSeries),
    [alignmentSeries.directionalCatalogs, alignmentSeries.headingOffsetDeg]
  );
  const alignmentSeriesRef = useRef(alignmentSeries);
  alignmentSeriesRef.current = alignmentSeries;
  const alignmentHeadingsRef = useRef(alignmentHeadings);
  alignmentHeadingsRef.current = alignmentHeadings;
  useEffect(() => {
    if (running && !lastActiveSeriesId && alignmentSeries.id)
      publish({ lastActiveSeriesId: alignmentSeries.id });
  }, [running, lastActiveSeriesId, alignmentSeries.id, publish]);
  const browsingPitchForBearing = useCallback(
    (bearingDeg: number) =>
      clamp(
        getBrowsingPitchDeg(
          data,
          enabledSeries,
          bearingDeg,
          enabledSeries[0]?.pitchDeg ?? browsingDataset.pitchDeg
        ),
        0,
        FREE_MAX_PITCH_DEG
      ) as Degrees,
    [data, enabledSeries, browsingDataset.pitchDeg]
  );
  const browsingPitchForBearingRef = useRef(browsingPitchForBearing);
  browsingPitchForBearingRef.current = browsingPitchForBearing;
  const browsingPitchDeg = browsingPitchForBearing(
    libreMap?.getBearing() ?? currentBearingDeg ?? 0
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(any-hover: hover)");
    const update = () => publish({ hoverAvailable: query.matches });
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [publish]);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  useEffect(() => {
    if (!running && viewMode !== "oblique") {
      viewModeRef.current = "oblique";
      setViewMode("oblique");
      publish({ viewMode: "oblique" });
    }
  }, [running, viewMode, publish]);
  const seriesStatus = useMemo(
    () =>
      configuredSeries.map((series) => {
        const status = perSeries.find((entry) => entry.id === series.id);
        return {
          id: series.id,
          label: series.label,
          shortLabel: series.shortLabel,
          availableCameraViews: series.availableCameraViews,
          enabled: enabledSet.has(series.id),
          isLoading: status?.isLoading ?? false,
          error: status?.error ?? null,
          imageCount: status?.imageCount ?? 0,
          acquisitionMonth: series.acquisitionMonth,
          acquisitionYear: series.acquisitionYear,
        };
      }),
    [configuredSeries, perSeries, enabledSet]
  );
  useEffect(() => {
    publish({
      isLoading,
      isAllDataReady,
      isCatalogComplete,
      error: runtimeError ?? error,
      series: seriesStatus,
      viewMode,
      canPan:
        viewMode !== "objectCoverage" && (data?.imageRecords.size ?? 0) > 1,
    });
  }, [
    publish,
    isLoading,
    isAllDataReady,
    isCatalogComplete,
    error,
    runtimeError,
    seriesStatus,
    viewMode,
    data,
  ]);

  const initialPreviewRef = useRef(viewerConfig.previewState?.initial ?? null);
  const initialPreviewRestoredRef = useRef(false);
  const writePreviewHashRef = useRef(() => {});
  const [previewRoot, setPreviewRoot] = useState<HTMLDivElement | null>(null);
  const resetPreviewPanRef = useRef(() => {});
  const returnCameraRef = useRef<
    (durationMs?: number) => CameraFlight | undefined
  >(() => undefined);
  const beforeLeave = useCallback(() => returnCameraRef.current(250), []);
  const [previewTransitionActive, setPreviewTransitionActive] = useState(false);
  const [previewOutlineReadyImageId, setPreviewOutlineReadyImageId] = useState<
    string | null
  >(null);
  const mosaicActive =
    running &&
    nextInterface &&
    previewSeamless &&
    previewSeamlessMode === "mosaic" &&
    viewMode === "oblique";
  const [mosaicSeriesId, setMosaicSeriesId] = useState<string | null>(null);
  const mosaicHoverTimer = useRef<ReturnType<typeof setTimeout>>();
  const mosaicHoveredId = useRef<string | null>(null);
  useEffect(() => () => clearTimeout(mosaicHoverTimer.current), [mosaicActive]);
  const previewCameraActive =
    !mosaicActive && (previewVisible || previewTransitionActive);
  const { phase, freeCamera, lockCamera } = useObliqueCameraMode({
    map: libreMap,
    enabled: running,
    dataset: browsingDataset,
    pitchDeg: browsingPitchDeg,
    entryBearingDeg: nextInterface
      ? (radToDeg(alignmentHeadings[0]) as Degrees)
      : undefined,
    suspended:
      mosaicActive || previewCameraActive || isBusy || viewMode !== "oblique",
    skipEntryFlight:
      initialPreviewRef.current !== null && !initialPreviewRestoredRef.current,
    resumeInitialView,
    initialView: viewerConfig.initialView,
    onBeforeLeave: beforeLeave,
  });
  const browsing = running && phase === "active";
  useEffect(() => {
    publish({
      canOrbitCamera:
        nextInterface &&
        browsing &&
        !previewVisible &&
        enabledSeries.length > 0 &&
        viewMode !== "objectCoverage",
    });
  }, [
    nextInterface,
    browsing,
    previewVisible,
    enabledSeries.length,
    viewMode,
    publish,
  ]);
  const [previewAltitude, setPreviewAltitude] = useState<{
    imageId: string;
    altitude: number;
    projectionAnchor?: {
      longitude: number;
      latitude: number;
      heightMeters: number;
    };
  } | null>(null);
  const busyRef = useRef(false);
  const hideFootprintsRef = useRef<() => Promise<void>>(() =>
    Promise.resolve()
  );
  const setBusy = useCallback(
    (next: boolean) => {
      busyRef.current = next;
      publish({ isBusy: next });
    },
    [publish]
  );
  const previewVisibleRef = useRef(previewVisible);
  previewVisibleRef.current = previewVisible;
  const [selectedImage, setSelectedImage] =
    useState<NearestObliqueImageRecord | null>(null);
  const [nearbyImages, setNearbyImages] = useState<NearestObliqueImageRecord[]>(
    []
  );
  const activeMosaicSeriesId =
    mosaicSeriesId && enabledSet.has(mosaicSeriesId)
      ? mosaicSeriesId
      : lastActiveSeriesId && enabledSet.has(lastActiveSeriesId)
      ? lastActiveSeriesId
      : selectedImage && enabledSet.has(selectedImage.record.seriesId)
      ? selectedImage.record.seriesId
      : enabledSeries[0]?.id ?? null;
  const onCandidates = useCallback((ranked: NearestObliqueImageRecord[]) => {
    const next = ranked.slice(0, 12);
    setNearbyImages((previous) =>
      previous.length === next.length &&
      previous.every((image, index) => image.record === next[index].record)
        ? previous
        : next
    );
  }, []);
  const [pointIntersectionSurface, setPointIntersectionSurface] =
    useState<PhotoAxisSurfaceMode>("auto");
  useEffect(() => {
    setPointIntersectionSurface(rotationSurface);
  }, [rotationSurface]);
  const hasSelectionData = data !== null;
  const axisPicker = useMemo(() => {
    const currentData = currentDataRef.current;
    return running && libreMap && currentData
      ? createPhotoAxisPicker(libreMap, currentData, heightOffset)
      : null;
  }, [running, libreMap, hasSelectionData, heightOffset]);
  useEffect(() => {
    if (data) axisPicker?.updateData(data);
  }, [axisPicker, data]);
  useEffect(() => {
    axisPicker?.start();
    return () => axisPicker?.dispose();
  }, [axisPicker]);
  const {
    records: indexedVisibleFootprints,
    prewarmRecords: hoverPrewarmRecords,
    mosaicRecords,
    readHoverCandidates,
    findAtGroundPoint: findLoadedAtGroundPoint,
  } = useVisibleFootprints({
    map: libreMap,
    data,
    catalogFilterKey,
    mosaicSeriesId: mosaicActive ? activeMosaicSeriesId : null,
    prewarmEnabled: nextInterface && previewHoverDrape && !mosaicActive,
    uncappedHoverCandidates: nextInterface,
    pickHoverCandidates:
      nextInterface && axisPicker ? axisPicker.pick : undefined,
    enabled: running && viewMode !== "objectCoverage",
    locked:
      (previewVisible &&
        !(
          nextInterface &&
          (previewCenterDebug || previewSeamless || previewHoverDrape)
        )) ||
      isBusy,
    viewMode,
    selectionStrategy,
  });
  // A worker response from the preceding filter can arrive during the reindex.
  const visibleFootprints = useMemo(
    () =>
      indexedVisibleFootprints.filter(
        (record) => !!data?.imageRecords.has(record.id)
      ),
    [indexedVisibleFootprints, data]
  );
  const groundPickerRef = useRef(findLoadedAtGroundPoint);
  groundPickerRef.current = findLoadedAtGroundPoint;
  const findAtGroundPoint = useCallback(
    async (
      point: [number, number],
      activeImageId?: string | null,
      heightMeters?: number,
      screenPoint?: Readonly<{ x: CssPixels; y: CssPixels }>
    ) => {
      if (!libreMap || !runningRef.current) return undefined;
      const epoch = selectionEpochRef.current;
      const ready = await awaitDirection(
        degreesToRadians(libreMap.getBearing() as Degrees),
        {
          cameraView: viewModeRef.current === "nadir" ? "nadir" : undefined,
        }
      );
      if (!ready || !runningRef.current || epoch !== selectionEpochRef.current)
        return undefined;
      const result = await groundPickerRef.current(
        point,
        activeImageId,
        heightMeters,
        screenPoint
      );
      if (result !== null) return result;
      const allReady = await awaitAll();
      if (
        !allReady ||
        !runningRef.current ||
        epoch !== selectionEpochRef.current
      )
        return undefined;
      return groundPickerRef.current(
        point,
        activeImageId,
        heightMeters,
        screenPoint
      );
    },
    [libreMap, awaitDirection, awaitAll]
  );
  const selectedImageRef = useRef(selectedImage);
  selectedImageRef.current = selectedImage;
  const selectedRecord = selectedImage?.record ?? null;
  const selectedImageId = selectedRecord?.id ?? null;
  const resolvedSelectedDataset = selectedRecord
    ? data?.datasets.get(selectedRecord.seriesId)
    : undefined;
  const selectedDataset = resolvedSelectedDataset ?? browsingDataset;
  useEffect(() => {
    const activeSeries = mosaicActive
      ? activeMosaicSeriesId
      : previewVisible
      ? selectedRecord?.seriesId
      : undefined;
    if (
      running &&
      activeSeries &&
      enabledSet.has(activeSeries) &&
      activeSeries !== lastActiveSeriesId
    )
      publish({ lastActiveSeriesId: activeSeries });
  }, [
    running,
    mosaicActive,
    activeMosaicSeriesId,
    previewVisible,
    selectedRecord?.seriesId,
    enabledSet,
    lastActiveSeriesId,
    publish,
  ]);
  const selectedCalibration =
    selectedRecord && resolvedSelectedDataset
      ? getCameraCalibration(resolvedSelectedDataset, selectedRecord.cameraId)
      : null;
  const referenceRayPitch = useMemo(() => {
    if (
      !running ||
      !nextInterface ||
      !selectedRecord ||
      !resolvedSelectedDataset ||
      !selectedCalibration
    )
      return null;
    // The photo's own ENU frame is sufficient for angles. Reuse the actual
    // calibrated drape rays without requesting terrain, pixels or scene depth.
    const sceneToPhoto = new Matrix4();
    const rays = photoCenterRays({
      projection: imageProjectionMatrix(
        selectedRecord,
        selectedCalibration,
        poseOf(selectedRecord, resolvedSelectedDataset),
        sceneToPhoto
      ),
      sceneToPhoto,
      calibration: selectedCalibration,
      centerY: previewSeamlessCenterY,
    });
    if (rays.axisPitchDeg === null || rays.preferredPitchDeg === null)
      return null;
    return {
      imageId: selectedRecord.id,
      centerY: previewSeamlessCenterY,
      centerPitchDeg: rays.axisPitchDeg,
      pitchDeg: rays.preferredPitchDeg,
    };
  }, [
    running,
    nextInterface,
    selectedRecord,
    resolvedSelectedDataset,
    selectedCalibration,
    previewSeamlessCenterY,
  ]);
  useEffect(() => {
    publish({ referenceRayPitch });
  }, [referenceRayPitch, publish]);
  const rollDeg =
    selectedRecord && resolvedSelectedDataset
      ? poseOf(selectedRecord, resolvedSelectedDataset).rollDeg
      : 0;
  const principalOffset = selectedCalibration
    ? calibrationImageOffset(selectedCalibration)
    : undefined;
  const previewQualityLevel = selectedDataset.minimumPreviewQualityLevel ?? "0";
  const [dimImage, setDimImage] = useState(false);
  const {
    active: transitionBackdropActive,
    begin: beginTransitionBackdrop,
    settle: settleTransitionBackdrop,
    ready: readyTransitionBackdrop,
    cancel: cancelTransitionBackdrop,
    fadeOut: fadeOutPreviewOverlay,
    overlayOpacity: previewTransitionOpacity,
  } = usePreviewTransitionBackdrop(
    libreMap,
    running && nextInterface && !mosaicActive && viewMode === "oblique",
    navigationDrapeEnabled
  );
  const activeFlightRef = useRef<CameraFlight | null>(null);
  const previewCameraRef = useRef<{
    imageId: string;
    pose: ReturnType<typeof poseOf>;
    altitude: Meters;
    /** Vertical FOV once a Classic entry has fitted the whole photo. */
    fitFovDeg?: number;
  } | null>(null);
  // The desired ground point survives image-camera flights, which move the map centre.
  const targetRef = useRef<ObliqueGroundTarget | null>(null);
  const selectionEpochRef = useRef(0);
  const navigationSelectionHeldRef = useRef(false);
  const invalidateNavigationRef = useRef<(clearPublished?: boolean) => void>(
    () => {}
  );
  const hoverDrapeRef = useRef<ReturnType<typeof createHoverPhotoDrape> | null>(
    null
  );
  const hoverSelectionRef = useRef<{ epoch: number } | null>(null);
  const hoverFlightRef = useRef<{
    imageId: string;
    settled: boolean;
    /** Held during the single/double-click window; the accepted selection adopts it. */
    claimed?: boolean;
    release: () => void;
  } | null>(null);
  const releaseHoverFlight = useCallback(() => {
    const held = hoverFlightRef.current;
    hoverFlightRef.current = null;
    held?.release();
  }, []);
  const cancelNavigationRef = useRef<() => void>(() => {});
  const [missingImages, setMissingImages] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const missingImagesRef = useRef(missingImages);
  missingImagesRef.current = missingImages;
  const currentPreviewMissingRef = useRef<() => boolean>(() => false);
  const availabilitySubscriptions = useRef(
    new Map<
      string,
      { identity: string; source: ThumbnailSource; unsubscribe: () => void }
    >()
  );
  // Centre queries use a declared catalogue/reference plane, never live depth.
  // Catalogue heightMeters is already GCG-inverted DHHN for this presentation.
  const readCatalogReferenceTarget = useCallback(
    (point?: { x: number; y: number }): ObliqueGroundTarget | null => {
      if (!libreMap) return null;
      const record = selectedImageRef.current?.record;
      const dataset =
        record && currentDataRef.current?.datasets.get(record.seriesId);
      const height =
        record?.catalogCenter?.heightMeters ??
        dataset?.referenceGroundHeightMeters ??
        0;
      const center = libreMap.getCenter();
      const anchor = MercatorCoordinate.fromLngLat(center, height);
      const inverse = new Matrix4()
        .fromArray(
          libreMap.transform.getProjectionDataForCustomLayer(true).mainMatrix
        )
        .invert();
      const x = point ? (2 * point.x) / libreMap.transform.width - 1 : 0;
      const y = point ? 1 - (2 * point.y) / libreMap.transform.height : 0;
      const near = new Vector3(x, y, -0.5).applyMatrix4(inverse);
      const delta = new Vector3(x, y, 0.5).applyMatrix4(inverse).sub(near);
      const t = (anchor.z - near.z) / delta.z;
      if (!(Number.isFinite(t) && t >= 0)) return null;
      const hit = near.addScaledVector(delta, t);
      if (!hit.toArray().every(Number.isFinite)) return null;
      const coordinate = new MercatorCoordinate(hit.x, hit.y, hit.z);
      const location = coordinate.toLngLat();
      return {
        longitude: location.lng,
        latitude: location.lat,
        heightMeters: coordinate.toAltitude(),
        heightDatum: "dhhn2016",
      };
    },
    [libreMap]
  );
  const readViewAnchor = useCallback(
    (
      screenPoint?: { x: number; y: number },
      surfaceMode: PhotoAxisSurfaceMode = pointIntersectionSurface,
      requireSurface = false
    ): MercatorCoordinate | undefined => {
      if (!libreMap) return undefined;
      let anchor: MercatorCoordinate | undefined;
      const surfaces = getSharedThreeSceneRuntimes(libreMap).filter(
        (runtime) =>
          (runtime.providesTerrain ||
            runtime.receivesMapStyleTexture ||
            runtime.receivesScreenImages) &&
          runtime.root.visible
      );
      if (surfaces.length || axisPicker) {
        const scene = acquireSharedThreeScene(libreMap);
        try {
          const inverse = new Matrix4()
            .fromArray(
              libreMap.transform.getProjectionDataForCustomLayer(true)
                .mainMatrix
            )
            .invert();
          const toScene = (point: Vector3) => {
            const coordinate = new MercatorCoordinate(
              point.x,
              point.y,
              point.z
            );
            const lngLat = coordinate.toLngLat();
            return scene.layer.projectLngLatToScene(
              [lngLat.lng, lngLat.lat],
              coordinate.toAltitude()
            );
          };
          const ndcX = screenPoint
            ? (2 * screenPoint.x) / libreMap.transform.width - 1
            : 0;
          const ndcY = screenPoint
            ? 1 - (2 * screenPoint.y) / libreMap.transform.height
            : 0;
          const near = toScene(
            new Vector3(ndcX, ndcY, -1).applyMatrix4(inverse)
          );
          const far = toScene(new Vector3(ndcX, ndcY, 1).applyMatrix4(inverse));
          if (near && far) {
            if (!screenPoint)
              surfaces.forEach(({ root }) =>
                root.updateWorldMatrix(true, true)
              );
            const ray = new Raycaster(
              near,
              far.clone().sub(near).normalize(),
              0,
              near.distanceTo(far)
            );
            (ray as Raycaster & { firstHitOnly: boolean }).firstHitOnly = true;
            const profile = interactionProfile(libreMap);
            const raycastStarted = performance.now();
            const cameraLngLat = scene.layer.projectSceneToLngLat(near);
            const hit =
              axisPicker && cameraLngLat
                ? axisPicker.intersectSurface(ray, cameraLngLat, surfaceMode)
                : surfaceMode !== "terrain"
                ? ray
                    .intersectObjects(
                      surfaces.map(({ root }) => root),
                      true
                    )
                    .find(({ object }) => {
                      for (
                        let parent = object;
                        parent;
                        parent = parent.parent!
                      ) {
                        if (!parent.visible) return false;
                      }
                      return true;
                    })
                : undefined;
            profile?.record(
              "anchorRaycast",
              performance.now() - raycastStarted
            );
            if (hit && requireSurface) {
              // Compare the view ray and every photo ray in the same geographic
              // frame; the affine Mercator scene coordinates are not ECEF.
              const frame = scene.layer.getLocalFrame();
              const origin = scene.layer.projectSceneToLngLat([0, 0, 0]);
              if (frame && origin) {
                const point = sceneToPresentationPoint(
                  hit.point,
                  origin,
                  frame.sceneFromLocal
                );
                if (Object.values(point).every(Number.isFinite))
                  anchor = MercatorCoordinate.fromLngLat(
                    [point.longitude, point.latitude],
                    point.heightMeters
                  );
              }
            } else if (hit) {
              const lngLat = scene.layer.projectSceneToLngLat(hit.point);
              if (lngLat) {
                const base = scene.layer.projectLngLatToScene(lngLat, 0);
                const raised = scene.layer.projectLngLatToScene(lngLat, 1);
                if (base && raised) {
                  const vertical = raised.sub(base);
                  const height =
                    hit.point.clone().sub(base).dot(vertical) /
                    vertical.lengthSq();
                  if (Number.isFinite(height))
                    anchor = MercatorCoordinate.fromLngLat(lngLat, height);
                }
              }
            }
          }
        } finally {
          scene.release();
        }
      }
      if (!anchor && !requireSurface && surfaceMode !== "mesh") {
        const point = libreMap.unproject([
          screenPoint?.x ?? libreMap.transform.width / 2,
          screenPoint?.y ?? libreMap.transform.height / 2,
        ]);
        anchor = MercatorCoordinate.fromLngLat(
          point,
          getSharedThreeTerrainElevation(libreMap, point.lng, point.lat) ??
            libreMap.queryTerrainElevation(point) ??
            libreMap.getCenterElevation()
        );
      }
      return anchor;
    },
    [libreMap, axisPicker, pointIntersectionSurface]
  );

  const readTarget = useCallback((): ObliqueGroundTarget | null => {
    if (!libreMap) return null;
    const anchor = readViewAnchor();
    if (!anchor) return null;
    const center = anchor.toLngLat();
    return {
      longitude: center.lng,
      latitude: center.lat,
      heightMeters: anchor.toAltitude(),
      heightDatum: "dhhn2016",
    };
  }, [libreMap, readViewAnchor]);
  const readObjectViewAnchor = useCallback(
    (point: { x: number; y: number }) => readViewAnchor(point, rotationSurface),
    [readViewAnchor, rotationSurface]
  );
  const readRotationTarget = useCallback((): ObliqueGroundTarget | null => {
    const seamlessPreview = nextInterface && previewSeamless;
    // Seamless preview only samples resident surfaces; the synchronous map fallback
    // uses its existing centre elevation without issuing a terrain request.
    const anchor =
      readViewAnchor(undefined, rotationSurface) ??
      (seamlessPreview ? readViewAnchor(undefined, "auto") : undefined);
    if (!anchor) return null;
    const point = anchor.toLngLat();
    return {
      longitude: point.lng,
      latitude: point.lat,
      heightMeters: anchor.toAltitude(),
      heightDatum: "dhhn2016",
    };
  }, [readViewAnchor, rotationSurface, nextInterface, previewSeamless]);
  const alignPreviewCameraRef = useRef(() => {});
  const toggleCameraTweenRef =
    useRef<ReturnType<typeof tweenPreviewCameraUpright>>(undefined);
  const cancelToggleCameraTween = useCallback(() => {
    toggleCameraTweenRef.current?.cancel();
    toggleCameraTweenRef.current = undefined;
  }, []);
  const seamlessPanRef = useRef({
    onPanStart: () => {},
    onPanStep: () => {},
    onPanEnd: () => {},
    cancel: () => {},
  });
  const {
    beginPreview,
    resetPan: resetPreviewPan,
    getBrowsingPadding,
  } = usePreviewPan({
    map: libreMap,
    root: previewRoot,
    enabled: previewCameraActive,
    panEnabled: nextInterface,
    continueOnImageChange:
      nextInterface && previewSeamless && previewSeamlessMode === "handover",
    imageId: selectedImageId,
    imageGeometry:
      selectedCalibration && principalOffset
        ? {
            aspectRatio: (selectedCalibration.widthPx /
              selectedCalibration.heightPx) as Ratio,
            halfFovTan: selectedCalibration.halfFovTan as Ratio,
            principal: {
              xOffset: principalOffset.xOffset as Ratio,
              yOffset: principalOffset.yOffset as Ratio,
            },
            roll: degreesToRadians(rollDeg as Degrees),
          }
        : null,
    busyRef,
    onPanStart: () => seamlessPanRef.current.onPanStart(),
    onPanStep: () => {
      alignPreviewCameraRef.current();
      seamlessPanRef.current.onPanStep();
    },
    onPanEnd: () => {
      targetRef.current = readTarget();
      invalidateNavigationRef.current(false);
      writePreviewHashRef.current();
      seamlessPanRef.current.onPanEnd();
    },
  });
  resetPreviewPanRef.current = resetPreviewPan;
  const onSelect = useCallback(
    (next: NearestObliqueImageRecord | null) => {
      if (hoverSelectionRef.current || busyRef.current) return;
      if (next && !enabledSetRef.current.has(next.record.seriesId)) return;
      if (
        mosaicActive &&
        activeMosaicSeriesId &&
        next?.record.seriesId !== activeMosaicSeriesId
      )
        return;
      // Keep a requested neighbor through its own browsing-camera settlement.
      // Human map gestures resume ordinary nearest-camera selection.
      const held = selectedImageRef.current?.record;
      if (
        navigationSelectionHeldRef.current &&
        held &&
        currentDataRef.current?.imageRecords.has(held.id) &&
        enabledSetRef.current.has(held.seriesId)
      )
        return;
      navigationSelectionHeldRef.current = false;
      setSelectedImage(next);
      if (!previewVisibleRef.current) targetRef.current = readTarget();
    },
    [readTarget, mosaicActive, activeMosaicSeriesId]
  );
  const { refreshSearch, computeNavigation } = useNearestImage({
    map: libreMap,
    enabled: browsing && !isBusy && viewMode !== "objectCoverage",
    dataset: browsingDataset,
    viewMode,
    data,
    locked: (previewVisible && !mosaicActive) || isBusy,
    selectedImageId,
    onSelect,
    onCandidates,
    selectionStrategy,
  });
  const refreshSearchRef = useRef(refreshSearch);
  refreshSearchRef.current = refreshSearch;
  const { downloadUrl } = useMemo(
    () =>
      resolvedSelectedDataset
        ? getImageUrls(
            selectedRecord?.sourceId,
            selectedDataset.previewPath,
            selectedDataset.previewQualityLevel,
            selectedDataset.downloadQualityLevel,
            {
              ...selectedDataset,
              originalImageUrl: selectedRecord?.assets?.original?.href,
              avifPyramidUrl: selectedRecord?.assets?.pyramid?.href,
            }
          )
        : { downloadUrl: null },
    [selectedRecord, selectedDataset, resolvedSelectedDataset]
  );
  const downloadOptions = useMemo<ObliqueDownloadOptions | null>(() => {
    if (!downloadUrl || !selectedCalibration) return null;
    const mime = selectedRecord?.assets?.original?.type;
    const pathname = new URL(downloadUrl, "https://oblique.invalid").pathname;
    return {
      avif: selectedDataset.avifOnly,
      tiff:
        (!selectedDataset.avifOnly &&
          /(?:^|\/)tiff(?:$|;)/i.test(mime ?? "")) ||
        (!selectedDataset.avifOnly && /\.tiff?$/i.test(pathname)),
      nativeSize: {
        width: selectedCalibration.widthPx,
        height: selectedCalibration.heightPx,
      },
      watermark: selectedDataset.downloadWatermark,
    };
  }, [downloadUrl, selectedRecord, selectedCalibration, selectedDataset]);
  useEffect(() => {
    publish({
      selectedImageId,
      selectedSourceImageId: selectedRecord?.sourceId ?? null,
      selectedSeriesId: selectedRecord?.seriesId ?? null,
      selectedCameraId: selectedRecord?.cameraId ?? null,
      selectedCameraView: selectedCalibration?.view ?? null,
      selectedImageBearingDeg:
        (selectedRecord?.pose?.bearingDeg as Degrees) ?? null,
      downloadUrl,
      downloadOptions,
    });
  }, [
    publish,
    selectedImageId,
    selectedRecord,
    selectedCalibration,
    downloadUrl,
    downloadOptions,
  ]);
  const onDirectionChange = useCallback(
    (direction: CardinalDirection | null) =>
      publish({ activeDirection: direction }),
    [publish]
  );
  // Cardinal labels are only a readout; they never exclude a camera from selection.
  useActiveDirection({
    map: libreMap,
    enabled: browsing && viewMode === "oblique",
    headingOffsetDeg: 0,
    cardinalHeadings: nextInterface ? alignmentHeadings : undefined,
    busy: isBusy,
    onChange: onDirectionChange,
  });
  const { getBrowsingMaxZoom } = useFovWheelZoom({
    map: libreMap,
    enabled:
      browsing || (nextInterface && viewMode === "oblique" && previewVisible),
    previewRoot,
    previewCameraActive,
    previewAnchorAtCursor: nextInterface,
    previewSampling: selectedCalibration
      ? {
          longEdgePixels: Math.max(
            selectedCalibration.widthPx,
            selectedCalibration.heightPx
          ) as DevicePixels,
          halfFovTan: selectedCalibration.halfFovTan,
        }
      : undefined,
    onPreviewZoomEnd: () => {
      alignPreviewCameraRef.current();
      if (previewVisibleRef.current) {
        targetRef.current = readTarget();
        invalidateNavigationRef.current(false);
      }
      writePreviewHashRef.current();
    },
    minFovDeg: browsingDataset.minFovDeg,
    maxFovDeg: browsingDataset.maxFovDeg,
    busyRef,
  });

  const setDrapeTargetLoading = useCallback(
    (isTargetImageLoading: boolean) => publish({ isTargetImageLoading }),
    [publish]
  );
  const drapePreparationRef = useRef(0);
  const previewDisplayReadyRef = useRef<string | null>(null);
  const preparedLandingRef = useRef<{
    imageId: string;
    release: () => void;
  } | null>(null);
  const seamlessFlightEpochRef = useRef<number | null>(null);
  const rotationDrapeLabelsRef = useRef(previewBasemapLabels);
  rotationDrapeLabelsRef.current = previewBasemapLabels;
  const rotationDrapeControllerRef = useRef<PhotoRotationDrape | null>(null);
  const [transitionSourceRecord, setTransitionSourceRecord] =
    useState<ObliqueImageRecord | null>(null);
  const rotationDrapeTransitionRef = useRef<{
    transition: PhotoRotationDrapeTransition;
    settled: boolean;
    seriesIds: readonly string[];
  } | null>(null);
  const neighborDrapeRef = useRef<{
    transition: PhotoNeighborDrapeTransition;
    controller: PhotoRotationDrape;
    fromId: string;
    toId: string;
    sourceView: ImageView;
    targetView: ImageView;
    seriesIds: readonly string[];
  } | null>(null);
  const disposeNeighborDrape = useCallback(() => {
    neighborDrapeRef.current?.controller.dispose();
    neighborDrapeRef.current = null;
  }, []);
  useEffect(() => {
    if (
      !running ||
      !nextInterface ||
      !previewSeamless ||
      !navigationDrapeEnabled ||
      !previewVisible
    )
      disposeNeighborDrape();
    return disposeNeighborDrape;
  }, [
    running,
    nextInterface,
    previewSeamless,
    navigationDrapeEnabled,
    previewVisible,
    libreMap,
    disposeNeighborDrape,
  ]);
  useEffect(() => {
    if (neighborDrapeRef.current?.seriesIds.some((id) => !enabledSet.has(id)))
      disposeNeighborDrape();
  }, [enabledSet, disposeNeighborDrape]);
  useEffect(() => {
    const pair = neighborDrapeRef.current;
    if (
      pair &&
      (viewMode !== "oblique" ||
        (selectedImageId !== pair.fromId && selectedImageId !== pair.toId))
    )
      disposeNeighborDrape();
  }, [selectedImageId, viewMode, disposeNeighborDrape]);
  const resolveDrapePhoto = useCallback(
    async (record: ObliqueImageRecord) => {
      const dataset = currentDataRef.current?.datasets.get(record.seriesId);
      if (!dataset) throw Error("Photo series unavailable");
      return {
        record,
        dataset,
        calibration: getCameraCalibration(dataset, record.cameraId),
        pose: poseOf(record, dataset),
        altitude: await resolveCameraAltitude(
          record,
          dataset.heightDatum,
          heightOffset,
          dataset.allowUnverifiedSourceHeight
        ),
      };
    },
    [heightOffset]
  );
  const referencePoints = useMemo(
    () =>
      running && nextInterface && libreMap && axisPicker
        ? createPhotoReferencePoints({
            map: libreMap,
            resolvePhoto: resolveDrapePhoto,
            intersectSurface: (ray, eye, mode) =>
              axisPicker.intersectSurface(ray, eye, mode),
            readSurfaceRevision: () => axisPicker.getSurfaceRevision(),
            isBusy: () => busyRef.current,
          })
        : null,
    [running, nextInterface, libreMap, axisPicker, resolveDrapePhoto]
  );
  useEffect(() => () => referencePoints?.dispose(), [referencePoints]);
  const referenceRequest = useMemo(
    () => new AbortController(),
    [referencePoints, previewSeamlessCenterY, rotationSurface]
  );
  useEffect(() => () => referenceRequest.abort(), [referenceRequest]);
  const resolveReferencePoint = useCallback(
    (record: ObliqueImageRecord, centerY: number, mode: PhotoAxisSurfaceMode) =>
      referencePoints?.resolve(
        record,
        centerY,
        mode,
        referenceRequest.signal
      ) ?? Promise.resolve(null),
    [referencePoints, referenceRequest]
  );
  const readReferenceRevision = useCallback(
    () => axisPicker?.getSurfaceRevision() ?? "",
    [axisPicker]
  );
  const installNeighborDrape = useCallback(
    (
      source: Awaited<ReturnType<typeof resolveDrapePhoto>>,
      target: Awaited<ReturnType<typeof resolveDrapePhoto>>,
      sourceView: ImageView,
      targetView: ImageView
    ) => {
      if (!libreMap) return undefined;
      const controller = createPhotoRotationDrape(libreMap, {
        showBasemapLabels: () => rotationDrapeLabelsRef.current,
      });
      const transition = controller.prepareNeighbor(source, target, {
        sourceView,
        targetView,
      });
      if (!transition) {
        controller.dispose();
        return undefined;
      }
      const previous = neighborDrapeRef.current;
      neighborDrapeRef.current = {
        transition,
        controller,
        fromId: source.record.id,
        toId: target.record.id,
        sourceView,
        targetView,
        seriesIds: [source.record.seriesId, target.record.seriesId],
      };
      previous?.controller.dispose();
      return transition;
    },
    [libreMap]
  );
  const cancelRotationDrape = useCallback(() => {
    cancelTransitionBackdrop();
    setTransitionSourceRecord(null);
    cancelToggleCameraTween();
    drapePreparationRef.current++;
    setDrapeTargetLoading(false);
    preparedLandingRef.current?.release();
    preparedLandingRef.current = null;
    rotationDrapeTransitionRef.current?.transition.dispose();
    rotationDrapeTransitionRef.current = null;
    rotationDrapeControllerRef.current?.cancel();
  }, [
    setDrapeTargetLoading,
    cancelToggleCameraTween,
    cancelTransitionBackdrop,
  ]);
  useEffect(() => {
    // An enabled photo projection retains the source before navigation hides
    // its flat preview. With the option off, the overlay follows its normal fade.
    if (!libreMap || !nextInterface || !navigationDrapeEnabled || !running)
      return;
    const controller = createPhotoRotationDrape(libreMap, {
      showBasemapLabels: () => rotationDrapeLabelsRef.current,
    });
    rotationDrapeControllerRef.current = controller;
    return () => {
      drapePreparationRef.current++;
      setDrapeTargetLoading(false);
      preparedLandingRef.current?.release();
      preparedLandingRef.current = null;
      rotationDrapeTransitionRef.current = null;
      setTransitionSourceRecord(null);
      if (rotationDrapeControllerRef.current === controller)
        rotationDrapeControllerRef.current = null;
      controller.dispose();
    };
  }, [
    libreMap,
    nextInterface,
    navigationDrapeEnabled,
    running,
    setDrapeTargetLoading,
  ]);
  useEffect(() => {
    if (
      previewSeamless ||
      seamlessFlightEpochRef.current === null ||
      seamlessFlightEpochRef.current !== selectionEpochRef.current
    )
      return;
    cancelNavigationRef.current();
    activeFlightRef.current?.cancel();
    activeFlightRef.current = null;
    seamlessFlightEpochRef.current = null;
    setBusy(false);
    setDimImage(false);
    setPreviewTransitionActive(false);
  }, [previewSeamless, setBusy]);
  useEffect(() => {
    const pair = rotationDrapeTransitionRef.current;
    if (pair?.seriesIds.some((id) => !enabledSet.has(id)))
      cancelRotationDrape();
  }, [enabledSet, cancelRotationDrape]);
  const prepareRotationDrape = useCallback(
    async (
      from: ObliqueImageRecord | undefined,
      to: ObliqueImageRecord,
      epoch: number,
      sourceOnly = false
    ) => {
      const controller = rotationDrapeControllerRef.current;
      if (
        !controller ||
        !navigationDrapeEnabled ||
        !from ||
        viewModeRef.current !== "oblique"
      )
        return undefined;
      disposeNeighborDrape();
      const preparation = ++drapePreparationRef.current;
      setDrapeTargetLoading(true);
      setBusy(true);
      const photoOf = async (record: ObliqueImageRecord) => {
        const dataset = currentDataRef.current?.datasets.get(record.seriesId);
        if (!dataset) throw Error("Photo series unavailable");
        return {
          record,
          dataset,
          calibration: getCameraCalibration(dataset, record.cameraId),
          pose: poseOf(record, dataset),
          altitude: await resolveCameraAltitude(
            record,
            dataset.heightDatum,
            heightOffset,
            dataset.allowUnverifiedSourceHeight
          ),
        };
      };
      try {
        const [source, target] = await Promise.all([
          photoOf(from),
          photoOf(to),
        ]);
        if (
          preparation !== drapePreparationRef.current ||
          epoch !== selectionEpochRef.current ||
          !runningRef.current
        )
          return undefined;
        const sourceInput = nativePreviewSource({
          imageId: from.sourceId,
          path: source.dataset.previewPath,
          sourceUrl: originalOf(source) ?? pyramidOf(source) ?? "",
          ...pyramidOptionsOf(source),
          avifOnly: source.dataset.avifOnly,
          nativeSize: {
            width: source.calibration.widthPx as DevicePixels,
            height: source.calibration.heightPx as DevicePixels,
          },
          minimumQualityLevel: source.dataset.minimumPreviewQualityLevel,
        });
        const transition = await controller.prepare(source, target, {
          sourceOnly,
          sourceView: previewVisibleRef.current
            ? lastNativePreviewView(sourceInput)?.view
            : undefined,
          requireSource: previewVisibleRef.current,
          retainUntilReveal: previewVisibleRef.current,
          decoration:
            previewVisibleRef.current && !previewSeamless
              ? {
                  backdropLook: {
                    contrast: BACKDROP_LOOK_DEFAULT.contrast / 100,
                    brightness: BACKDROP_LOOK_DEFAULT.brightness / 100,
                    saturation: BACKDROP_LOOK_DEFAULT.saturation / 100,
                  },
                  backdropTint: previewBackdropTint(
                    source.dataset.imagePreviewStyle?.backdropColor
                  ),
                }
              : undefined,
        });
        if (
          preparation !== drapePreparationRef.current ||
          epoch !== selectionEpochRef.current ||
          !runningRef.current
        ) {
          transition?.dispose();
          return undefined;
        }
        if (transition) {
          rotationDrapeTransitionRef.current = {
            transition,
            settled: false,
            seriesIds: [from.seriesId, to.seriesId],
          };
          if (previewVisibleRef.current) setTransitionSourceRecord(from);
        }
        return transition;
      } catch {
        // The caller keeps the current preview when its source cannot be retained.
        return undefined;
      } finally {
        if (preparation === drapePreparationRef.current)
          setDrapeTargetLoading(false);
      }
    },
    [
      heightOffset,
      navigationDrapeEnabled,
      previewSeamless,
      setBusy,
      setDrapeTargetLoading,
      disposeNeighborDrape,
    ]
  );
  const finishRotationDrape = useCallback(
    (transition?: PhotoRotationDrapeTransition) => {
      if (
        !transition ||
        rotationDrapeTransitionRef.current?.transition !== transition
      )
        return;
      rotationDrapeTransitionRef.current.settled = true;
      if (
        previewVisibleRef.current &&
        previewDisplayReadyRef.current !== transition.targetImageId
      )
        transition.finish();
      else {
        transition.dispose();
        rotationDrapeTransitionRef.current = null;
        setTransitionSourceRecord(null);
      }
    },
    []
  );

  const flyTo = useCallback(
    async (
      record: ObliqueImageRecord,
      animation: AnimationConfig | undefined,
      dynamicDuration: boolean,
      preserveView = false,
      viewAnchor?: MercatorCoordinate,
      centerPreview?: boolean | "whole-image",
      previewState?: ObliquePreviewState,
      onProgress?: (progress: number) => void,
      orbitAroundAnchor = false,
      projectionAnchor?: MercatorCoordinate,
      landing?: {
        source: ObliqueViewportPhoto;
        prepare: (
          frame: MaplibreMap["transform"],
          pose: ReturnType<typeof poseOf>,
          altitude: number,
          preparedView: ImageView
        ) => Promise<boolean>;
        activate: () => void;
      }
    ): Promise<boolean> => {
      if (
        !libreMap ||
        !runningRef.current ||
        !enabledSetRef.current.has(record.seriesId)
      )
        return false;
      const dataset = currentDataRef.current?.datasets.get(record.seriesId);
      if (!dataset) {
        cancelTransitionBackdrop();
        return false;
      }
      cancelToggleCameraTween();
      const epoch = selectionEpochRef.current;
      const anchor = preserveView
        ? viewAnchor ?? readViewAnchor(undefined, "auto")
        : undefined;
      setBusy(true);
      setRuntimeError(null);
      const activatePreview = () => {
        setPreviewOutlineReadyImageId(null);
        previewDisplayReadyRef.current = null;
        if (preserveView) {
          beginPreview();
          setPreviewTransitionActive(true);
        } else resetPreviewPanRef.current();
      };
      if (landing) setDrapeTargetLoading(true);
      else activatePreview();
      let backdropTransition: ReturnType<typeof beginTransitionBackdrop>;
      const startBackdrop = () => {
        if (
          nextInterface &&
          navigationDrapeEnabled &&
          previewVisibleRef.current &&
          viewModeRef.current === "oblique"
        )
          backdropTransition = beginTransitionBackdrop(
            record.id,
            rotationDrapeTransitionRef.current?.transition.targetImageId ===
              record.id
          );
      };
      // Landing preparation must leave the current flat photo untouched until
      // its source projection and the target pixels are actually secured.
      if (!landing) startBackdrop();
      let flightSucceeded = false;
      let landingStarted = false;
      let releasePreparedPixels: (() => void) | undefined;
      try {
        const pose = poseOf(record, dataset);
        const altitude = await resolveCameraAltitude(
          record,
          dataset.heightDatum,
          heightOffset,
          dataset.allowUnverifiedSourceHeight
        );
        const projectionTarget = nextInterface
          ? projectionAnchor ??
            (orbitAroundAnchor ||
            (previewSeamless && previewUprightOnlyWhenCovered)
              ? anchor
              : undefined)
          : undefined;
        const projectionLocation = projectionTarget?.toLngLat();
        const nextPreviewAltitude = {
          imageId: record.id,
          altitude,
          projectionAnchor:
            projectionTarget && projectionLocation
              ? {
                  longitude: projectionLocation.lng,
                  latitude: projectionLocation.lat,
                  heightMeters: projectionTarget.toAltitude(),
                }
              : undefined,
        };
        if (!landing) setPreviewAltitude(nextPreviewAltitude);
        let viewPose = pose;
        let viewAltitude = altitude;
        const scene = acquireSharedThreeScene(libreMap);
        try {
          const localFrame = scene.layer.getLocalFrame();
          const origin = scene.layer.projectSceneToLngLat([0, 0, 0]);
          if (localFrame && origin) {
            const photoToScene = sceneToPhotoEnu(
              origin,
              localFrame.sceneFromLocal,
              pose,
              altitude
            ).invert();
            const eye = new Vector3().applyMatrix4(photoToScene);
            const direction = new Vector3(...pose.direction).transformDirection(
              photoToScene
            );
            const location = scene.layer.projectSceneToLngLat(eye);
            if (location) {
              const ground = scene.layer.projectLngLatToScene(location, 0);
              const unit = scene.layer.projectLngLatToScene(location, 1);
              if (ground && unit && unit.y > ground.y) {
                viewAltitude = (eye.y - ground.y) / (unit.y - ground.y);
                viewPose = {
                  ...pose,
                  longitude: location[0],
                  latitude: location[1],
                  bearingDeg: radToDeg(Math.atan2(direction.x, -direction.z)),
                  pitchDeg: radToDeg(Math.acos(clamp(-direction.y, -1, 1))),
                };
              }
            }
          }
        } finally {
          scene.release();
        }
        const profile = interactionProfile(libreMap);
        if (
          epoch !== selectionEpochRef.current ||
          !runningRef.current ||
          !enabledSetRef.current.has(record.seriesId)
        )
          return false;
        if (!landing) {
          freeCamera();
          profile?.phase("flight");
        }
        const calibration = getCameraCalibration(dataset, record.cameraId);
        const principal = calibrationImageOffset(calibration);
        const nextPreviewCamera = {
          imageId: record.id,
          pose: viewPose,
          altitude: viewAltitude as Meters,
        };
        if (!landing) previewCameraRef.current = nextPreviewCamera;
        const cameraIdentity = () =>
          JSON.stringify([
            libreMap.getCenter().lng,
            libreMap.getCenter().lat,
            libreMap.getZoom(),
            libreMap.getBearing(),
            libreMap.getPitch(),
            libreMap.transform.roll,
            libreMap.transform.fov,
            libreMap.transform.elevation,
            libreMap.getPadding(),
            libreMap.transform.width,
            libreMap.transform.height,
          ]);
        const initialCamera = landing ? cameraIdentity() : undefined;
        // Fetch/decode the target while the camera moves, without waiting for it.
        if (!landing)
          releasePreparedPixels = preparePreviewFlight(
            libreMap,
            { record, dataset },
            pose.rollDeg as Degrees
          );
        const flight = flyToPose(libreMap, viewPose, viewAltitude, animation, {
          dynamicDuration,
          anchor,
          orbitAroundAnchor: nextInterface && orbitAroundAnchor,
          maxFovDeg: browsingDataset.maxFovDeg,
          centerPreview:
            centerPreview === undefined ? undefined : !!centerPreview,
          fitWholeImage: !nextInterface || centerPreview === "whole-image",
          previewState,
          onProgress,
          adjustFinalFrame:
            nextInterface && previewSeamless && anchor
              ? (frame) => {
                  uprightPreviewCamera(libreMap, frame, anchor);
                }
              : undefined,
          acceptAdjustedFrame:
            nextInterface &&
            previewSeamless &&
            previewUprightOnlyWhenCovered &&
            anchor
              ? (neutral, corrected) => {
                  try {
                    return [neutral, corrected].every((frame) =>
                      viewportImageCoversViewport(
                        previewLandingProjection(
                          libreMap,
                          { record, dataset },
                          pose,
                          altitude,
                          frame,
                          projectionTarget
                        )
                      )
                    );
                  } catch {
                    return false;
                  }
                }
              : undefined,
          beforeStart: landing
            ? async (frame, signal, trajectoryFrames) => {
                if (!anchor) return false;
                const valid = () =>
                  !signal.aborted &&
                  epoch === selectionEpochRef.current &&
                  runningRef.current &&
                  enabledSetRef.current.has(record.seriesId) &&
                  cameraIdentity() === initialCamera;
                if (!valid()) return false;
                const prepared = await preparePreviewLanding(
                  libreMap,
                  { record, dataset },
                  pose,
                  altitude,
                  frame,
                  anchor,
                  signal,
                  landing.source,
                  animation?.duration === 0 ? [frame] : trajectoryFrames
                );
                releasePreparedPixels = prepared;
                if (!valid()) return false;
                preparedLandingRef.current = {
                  imageId: record.id,
                  release: releasePreparedPixels,
                };
                const drapeReady = await landing.prepare(
                  frame,
                  pose,
                  altitude,
                  prepared.view
                );
                if (!drapeReady || !valid()) return false;
                landing.activate();
                startBackdrop();
                activatePreview();
                setPreviewAltitude(nextPreviewAltitude);
                previewCameraRef.current = nextPreviewCamera;
                freeCamera();
                profile?.phase("flight");
                landingStarted = true;
                return true;
              }
            : undefined,
          preview:
            centerPreview === undefined
              ? undefined
              : {
                  aspectRatio: (calibration.widthPx /
                    calibration.heightPx) as Ratio,
                  halfFovTan: calibration.halfFovTan as Ratio,
                  principal: {
                    xOffset: principal.xOffset as Ratio,
                    yOffset: principal.yOffset as Ratio,
                  },
                  roll: degreesToRadians(pose.rollDeg as Degrees),
                },
        });
        activeFlightRef.current = flight;
        await flight.done;
        profile?.phase("afterFlight");
        const completed = activeFlightRef.current === flight;
        if (completed) activeFlightRef.current = null;
        if (
          completed &&
          !nextInterface &&
          !previewState &&
          previewCameraRef.current?.imageId === record.id
        )
          previewCameraRef.current.fitFovDeg =
            libreMap.getVerticalFieldOfView();
        flightSucceeded =
          completed &&
          (!landing || landingStarted) &&
          epoch === selectionEpochRef.current &&
          runningRef.current &&
          enabledSetRef.current.has(record.seriesId);
        return flightSucceeded;
      } catch (flightError) {
        if (epoch === selectionEpochRef.current && runningRef.current) {
          setRuntimeError(
            flightError instanceof Error
              ? flightError.message
              : "Der Flug zum Bild ist fehlgeschlagen."
          );
        }
        return false;
      } finally {
        if (!flightSucceeded) cancelTransitionBackdrop();
        if (backdropTransition)
          settleTransitionBackdrop(backdropTransition, flightSucceeded);
        if (!landing || !landingStarted) {
          releasePreparedPixels?.();
          if (preparedLandingRef.current?.release === releasePreparedPixels)
            preparedLandingRef.current = null;
        }
        if (epoch === selectionEpochRef.current) {
          if (landing) setDrapeTargetLoading(false);
          setBusy(false);
        }
      }
    },
    [
      libreMap,
      data,
      heightOffset,
      freeCamera,
      setBusy,
      beginPreview,
      readViewAnchor,
      setDrapeTargetLoading,
      browsingDataset.maxFovDeg,
      nextInterface,
      navigationDrapeEnabled,
      previewSeamless,
      previewUprightOnlyWhenCovered,
      cancelToggleCameraTween,
      beginTransitionBackdrop,
      cancelTransitionBackdrop,
      settleTransitionBackdrop,
    ]
  );

  const returnCameraToBrowsing = useCallback(
    (
      durationMs?: number,
      rotation?: {
        bearingDeg: number;
        anchor: MercatorCoordinate;
        orbitAroundAnchor?: boolean;
        easing?: AnimationConfig["easingFunction"];
        onProgress?: (progress: number) => void;
        footprintPan?: {
          from: { longitude: number; latitude: number };
          to: { longitude: number; latitude: number };
        };
      }
    ): CameraFlight | undefined => {
      if (!libreMap) return undefined;
      if (!rotation?.onProgress) cancelRotationDrape();
      activeFlightRef.current?.cancel();
      setBusy(true);
      setPreviewTransitionActive(true);
      freeCamera(Boolean(rotation?.footprintPan));
      const pitch = rotation?.footprintPan
        ? libreMap.getPitch()
        : viewModeRef.current === "nadir"
        ? 0
        : browsingPitchForBearingRef.current(
            rotation?.bearingDeg ?? libreMap.getBearing()
          );
      const record = selectedImageRef.current?.record;
      const dataset = record && data?.datasets.get(record.seriesId);
      const camera = previewCameraRef.current;
      // Classic first zooms out to the whole photo, then leaves the preview.
      // The fit is a pure zoom from the photo eye; leaving keeps that FOV and
      // turns to the image-centre browsing pitch, so it barely moves the view
      // and re-entering the preview from there is nearly still.
      const leavingImage =
        !nextInterface &&
        previewVisibleRef.current &&
        !!record &&
        !!dataset &&
        camera?.imageId === record.id;
      // Zoom octaves back to the whole photo; an unzoomed preview skips the fit.
      const fitOctaves =
        leavingImage && camera?.fitFovDeg !== undefined
          ? Math.abs(
              Math.log2(
                Math.tan(degreesToRadians((camera.fitFovDeg / 2) as Degrees)) /
                  Math.tan(
                    degreesToRadians(
                      (libreMap.getVerticalFieldOfView() / 2) as Degrees
                    )
                  )
              )
            )
          : 1;
      const fitImage = leavingImage && fitOctaves > 0.03;
      setDimImage(!fitImage);
      const exitDuration =
        durationMs ??
        browsingDataset.animations.leaveObliqueMode?.duration ??
        1100;
      const fitDuration = fitImage
        ? exitDuration * Math.min(0.6, 0.25 + 0.35 * fitOctaves)
        : 0;
      const easing =
        rotation?.easing ??
        browsingDataset.animations.leaveObliqueMode?.easingFunction;
      const leavePreview = () =>
        rotation?.footprintPan
          ? panBrowsingCamera(
              libreMap,
              rotation.footprintPan.from,
              rotation.footprintPan.to,
              { duration: exitDuration, easingFunction: easing }
            )
          : settleToPitch(libreMap, pitch, {
              bearingDeg: rotation?.bearingDeg,
              anchor: rotation?.anchor ?? readViewAnchor(),
              onProgress: rotation?.onProgress,
              orbitAroundAnchor: nextInterface && rotation?.orbitAroundAnchor,
              fovDeg: clamp(
                libreMap.getVerticalFieldOfView(),
                browsingDataset.minFovDeg,
                browsingDataset.maxFovDeg
              ) as Degrees,
              padding: getBrowsingPadding(),
              maxZoom: getBrowsingMaxZoom(),
              durationMs: exitDuration - fitDuration,
              easing,
            });
      let flight: CameraFlight;
      if (fitImage && camera && record && dataset) {
        const calibration = getCameraCalibration(dataset, record.cameraId);
        const principal = calibrationImageOffset(calibration);
        let current = flyToPose(
          libreMap,
          camera.pose,
          camera.altitude,
          { duration: fitDuration, easingFunction: easing },
          {
            anchor: readViewAnchor(),
            dynamicDuration: false,
            centerPreview: true,
            fitWholeImage: true,
            maxFovDeg: browsingDataset.maxFovDeg,
            preview: {
              aspectRatio: (calibration.widthPx /
                calibration.heightPx) as Ratio,
              halfFovTan: calibration.halfFovTan as Ratio,
              principal: {
                xOffset: principal.xOffset as Ratio,
                yOffset: principal.yOffset as Ratio,
              },
              roll: degreesToRadians(camera.pose.rollDeg as Degrees),
            },
          }
        );
        let cancelled = false;
        flight = {
          done: (async () => {
            await current.done;
            if (cancelled) return;
            publish({ previewVisible: false });
            setDimImage(true);
            current = leavePreview();
            await current.done;
          })(),
          cancel: () => {
            cancelled = true;
            current.cancel();
          },
        };
      } else flight = leavePreview();
      activeFlightRef.current = flight;
      flight.done.then(() => {
        if (activeFlightRef.current !== flight) return;
        activeFlightRef.current = null;
        publish({ previewVisible: false });
        setPreviewTransitionActive(false);
        setDimImage(false);
        if (runningRef.current)
          lockCamera(pitch, Boolean(rotation?.footprintPan));
        setBusy(false);
        // Keep the photo just left selected until a map gesture, so
        // "Flug zum Bild" returns to it instead of a nearby neighbour.
        if (leavingImage) navigationSelectionHeldRef.current = true;
        if (runningRef.current) void refreshSearch({ immediate: true });
      });
      return flight;
    },
    [
      libreMap,
      data,
      nextInterface,
      browsingDataset,
      readViewAnchor,
      getBrowsingPadding,
      getBrowsingMaxZoom,
      freeCamera,
      lockCamera,
      cancelRotationDrape,
      setBusy,
      publish,
      refreshSearch,
    ]
  );
  returnCameraRef.current = returnCameraToBrowsing;
  const settleToBrowsing = useCallback(async () => {
    await returnCameraToBrowsing()?.done;
  }, [returnCameraToBrowsing]);

  const switchViewMode = useCallback(
    async (mode: ObliqueViewMode, animate = true) => {
      if (!libreMap || !runningRef.current) return;
      if (
        mode !== "oblique" &&
        (!nextInterface ||
          (mode !== "nadir" &&
            !getObliqueViewerExtension(extensions, nextInterface, mode)))
      )
        return;
      if (busyRef.current && viewModeRef.current !== "objectCoverage") return;
      if (
        mode === "nadir" &&
        !enabledSeries.some((series) =>
          series.availableCameraViews?.includes("nadir")
        )
      )
        return;
      navigationSelectionHeldRef.current = false;
      const epoch = ++selectionEpochRef.current;
      const ready =
        mode === "objectCoverage"
          ? await awaitAll()
          : await awaitDirection(
              degreesToRadians(libreMap.getBearing() as Degrees),
              {
                cameraView: mode === "nadir" ? "nadir" : undefined,
              }
            );
      if (!ready || !runningRef.current || epoch !== selectionEpochRef.current)
        return;
      const keepPreview =
        previewVisibleRef.current &&
        (mode === "objectCoverage" || viewModeRef.current === "objectCoverage");
      activeFlightRef.current?.cancel();
      activeFlightRef.current = null;
      viewModeRef.current = mode;
      setViewMode(mode);
      setRuntimeError(null);
      setDimImage(false);
      if (keepPreview) {
        // Object selection uses the visible mesh depth beneath the current
        // photograph. Opening or cancelling the query does not move its camera.
        publish({ viewMode: mode });
        return;
      }
      if (!animate) {
        freeCamera();
        setPreviewTransitionActive(true);
      }
      publish({ viewMode: mode, previewVisible: false });
      if (animate) await settleToBrowsing();
    },
    [
      libreMap,
      enabledSeries,
      publish,
      freeCamera,
      settleToBrowsing,
      nextInterface,
      extensions,
      awaitDirection,
      awaitAll,
    ]
  );

  useEffect(() => {
    if (
      viewMode !== "oblique" &&
      browsing &&
      !isBusy &&
      (!nextInterface ||
        (viewMode !== "nadir" &&
          !getObliqueViewerExtension(extensions, nextInterface, viewMode)))
    )
      void switchViewMode("oblique");
  }, [extensions, nextInterface, viewMode, browsing, isBusy, switchViewMode]);

  const cancelExtension = useCallback(() => {
    void switchViewMode("oblique");
  }, [switchViewMode]);
  // The query cursor follows the request, not the mode's data wait.
  const viewModeRequest = useViewModeRequest<ObliqueViewMode>();
  const trackViewModeRequest = viewModeRequest.track;
  useQueryCursor({
    map: libreMap,
    active:
      running &&
      (viewMode === "objectCoverage" ||
        viewModeRequest.pendingMode === "objectCoverage"),
    readViewAnchor: readObjectViewAnchor,
    onEscape: () => {
      // Inside the mode useObjectCoverage owns Escape; a pending request is dropped.
      if (
        viewModeRef.current === "objectCoverage" ||
        !viewModeRequest.pendingMode
      )
        return;
      selectionEpochRef.current++;
      viewModeRequest.cancel();
    },
  });
  const extensionController = useRef<ObliqueViewerExtensionController | null>(
    null
  );
  const onExtensionControllerChange = useCallback(
    (controller: ObliqueViewerExtensionController | null) => {
      extensionController.current = controller;
    },
    []
  );
  const resetExtension = useCallback(() => {
    const interruptedFlight = busyRef.current;
    selectionEpochRef.current++;
    activeFlightRef.current?.cancel();
    activeFlightRef.current = null;
    setPreviewTransitionActive(false);
    setBusy(false);
    extensionController.current?.reset();
    if (interruptedFlight) void settleToBrowsing();
  }, [setBusy, settleToBrowsing]);
  useEffect(() => {
    if (!running || viewModeRef.current !== "objectCoverage") return;
    const interruptedFlight = busyRef.current;
    selectionEpochRef.current++;
    activeFlightRef.current?.cancel();
    activeFlightRef.current = null;
    setPreviewTransitionActive(false);
    setBusy(false);
    if (interruptedFlight) void settleToBrowsing();
  }, [data, enabledToken, running, setBusy]);

  useEffect(() => {
    if (
      viewMode === "nadir" &&
      !enabledSeries.some((series) =>
        series.availableCameraViews?.includes("nadir")
      ) &&
      browsing &&
      !isBusy
    ) {
      void switchViewMode("oblique");
    }
  }, [viewMode, enabledSeries, browsing, isBusy, switchViewMode]);
  const closePreview = useCallback(() => {
    releaseHoverFlight();
    cancelNavigationRef.current();
    if (!previewVisibleRef.current) return;
    selectionEpochRef.current++;
    if (nextInterface) {
      publish({ previewVisible: false });
      setDimImage(false);
    }
    void settleToBrowsing();
  }, [nextInterface, publish, settleToBrowsing, releaseHoverFlight]);
  const openPreview = useCallback(
    async (
      imageId?: string,
      centerPreview: boolean | "whole-image" = true,
      previewState?: ObliquePreviewState,
      animate = true,
      preserveView = true
    ): Promise<boolean> => {
      cancelNavigationRef.current();
      if (!runningRef.current) return false;
      navigationSelectionHeldRef.current = false;
      if (busyRef.current) {
        if (!imageId) return false;
        // Explicit image navigation can replace an in-progress flight.
        selectionEpochRef.current++;
        activeFlightRef.current?.cancel();
        activeFlightRef.current = null;
        setBusy(false);
      }
      const epoch = selectionEpochRef.current;
      let requested = imageId
        ? nearbyImages.find((image) => image.record.id === imageId)
        : undefined;
      if (imageId && !requested && data) {
        const record = data.imageRecords.get(imageId);
        const center = data.centers.get(imageId);
        if (record && center) {
          // Explicit footprint selection does not require coverage of the old view centre.
          const target = readTarget();
          const origin = target
            ? { lng: target.longitude, lat: target.latitude }
            : { lng: center.longitude, lat: center.latitude };
          requested = {
            record,
            imageCenter: center,
            distanceOnGround: groundDistanceM(origin, {
              lng: center.longitude,
              lat: center.latitude,
            }),
            distanceToCamera: groundDistanceM(origin, {
              lng: record.centerWGS84[0],
              lat: record.centerWGS84[1],
            }),
          };
        }
      }
      if (!imageId) {
        requested = (
          await refreshSearch({
            target: readTarget() ?? undefined,
            immediate: true,
            computeOnly: true,
          })
        )?.[0];
        if (
          busyRef.current ||
          !runningRef.current ||
          epoch !== selectionEpochRef.current
        )
          return false;
      }
      const record = requested?.record;
      if (
        !record ||
        busyRef.current ||
        !enabledSetRef.current.has(record.seriesId)
      )
        return false;
      publish({ lastActiveSeriesId: record.seriesId });
      if (mosaicActive) {
        setMosaicSeriesId(record.seriesId);
        if (requested) {
          selectedImageRef.current = requested;
          setSelectedImage(requested);
        }
        return true;
      }
      const selectionLock = { epoch };
      hoverSelectionRef.current = selectionLock;
      setBusy(true);
      try {
        const previousHover = hoverFlightRef.current;
        if (previousHover && previousHover.imageId !== record.id)
          releaseHoverFlight();
        const releaseHover =
          nextInterface && previewHoverDrape
            ? previousHover?.imageId === record.id
              ? previousHover.release
              : hoverDrapeRef.current?.pin(record.id)
            : undefined;
        const heldHover = releaseHover
          ? {
              imageId: record.id,
              settled: false,
              release: releaseHover,
            }
          : null;
        hoverFlightRef.current = heldHover;
        const sourceDrape =
          animate && nextInterface && previewVisibleRef.current
            ? await prepareRotationDrape(
                selectedImageRef.current?.record,
                record,
                epoch
              )
            : undefined;
        if (epoch !== selectionEpochRef.current || !runningRef.current) {
          sourceDrape?.dispose();
          return false;
        }

        if (
          animate &&
          nextInterface &&
          navigationDrapeEnabled &&
          previewVisibleRef.current &&
          viewModeRef.current === "oblique" &&
          !sourceDrape
        ) {
          setRuntimeError(
            "Das aktuelle Foto ist noch nicht für den Bildwechsel bereit."
          );
          if (heldHover && hoverFlightRef.current === heldHover)
            releaseHoverFlight();
          return false;
        }
        if (
          animate &&
          nextInterface &&
          previewVisibleRef.current &&
          viewModeRef.current === "oblique"
        ) {
          if (
            !(await fadeOutPreviewOverlay(record.id, !!sourceDrape)) ||
            epoch !== selectionEpochRef.current ||
            !runningRef.current
          )
            return false;
          setDimImage(true);
        }
        // Also cycle visibility for a same-image flight: the existing native
        // compositor must confirm its new landing frame before releasing source.
        if (sourceDrape) setDimImage(true);
        if (requested) {
          selectedImageRef.current = requested;
          setSelectedImage(requested);
        }
        if (libreMap) beginInteractionProfile(libreMap, "openPreview");
        targetRef.current = preserveView
          ? readTarget()
          : record.catalogCenter
          ? {
              longitude: record.catalogCenter.longitude,
              latitude: record.catalogCenter.latitude,
              heightMeters: record.catalogCenter.heightMeters,
              heightDatum: "dhhn2016",
              ecefMeters: record.catalogCenter.ecefMeters,
            }
          : null;
        const dataset = data?.datasets.get(record.seriesId);
        const importedViewAnchor =
          !preserveView && record.catalogCenter
            ? MercatorCoordinate.fromLngLat(
                [record.catalogCenter.longitude, record.catalogCenter.latitude],
                record.catalogCenter.heightMeters
              )
            : undefined;
        let succeeded = false;
        try {
          succeeded = await flyTo(
            record,
            animate
              ? dataset?.animations.flyToExteriorOrientation
              : { duration: 0 },
            true,
            preserveView || !!importedViewAnchor,
            importedViewAnchor,
            nextInterface ? centerPreview : true,
            nextInterface ? previewState : undefined,
            sourceDrape?.update
          );
        } finally {
          if (succeeded) finishRotationDrape(sourceDrape);
          else sourceDrape?.dispose();
          if (
            !succeeded ||
            epoch !== selectionEpochRef.current ||
            !runningRef.current
          ) {
            if (hoverFlightRef.current === heldHover) releaseHoverFlight();
            else heldHover?.release();
          }
        }
        if (epoch === selectionEpochRef.current) setDimImage(false);
        if (succeeded && heldHover && hoverFlightRef.current === heldHover) {
          // Arrival keeps the original photo projector underneath the flat preview.
          // Only a different image, leaving preview, or controller teardown releases it.
          heldHover.settled = true;
        }
        if (epoch !== selectionEpochRef.current || !runningRef.current)
          return false;
        if (succeeded) {
          publish({ previewVisible: true });
          setPreviewTransitionActive(false);
        } else {
          await settleToBrowsing();
        }
        return succeeded;
      } catch (error) {
        if (
          hoverSelectionRef.current === selectionLock &&
          !hoverFlightRef.current?.settled
        )
          releaseHoverFlight();
        throw error;
      } finally {
        if (hoverSelectionRef.current === selectionLock) {
          hoverSelectionRef.current = null;
          if (epoch === selectionEpochRef.current) setBusy(false);
        }
      }
    },
    [
      libreMap,
      readTarget,
      data,
      flyTo,
      publish,
      settleToBrowsing,
      nearbyImages,
      nextInterface,
      fadeOutPreviewOverlay,
      navigationDrapeEnabled,
      mosaicActive,
      previewHoverDrape,
      prepareRotationDrape,
      finishRotationDrape,
      releaseHoverFlight,
      refreshSearch,
      setBusy,
    ]
  );

  const openExtensionImage = useCallback(
    async (imageId: string) => {
      if (viewModeRef.current !== "objectCoverage") return;
      const succeeded = await openPreview(imageId, true);
      if (!succeeded || viewModeRef.current !== "objectCoverage") return;
      extensionController.current?.reset();
      viewModeRef.current = "oblique";
      setViewMode("oblique");
      publish({ viewMode: "oblique" });
    },
    [openPreview, publish]
  );

  writePreviewHashRef.current = () => {
    if (!libreMap || busyRef.current || !previewVisibleRef.current) return;
    const record = selectedImageRef.current?.record;
    const dataset = record && data?.datasets.get(record.seriesId);
    if (!record || !dataset) return;
    const calibration = getCameraCalibration(dataset, record.cameraId);
    const principal = calibrationImageOffset(calibration);
    const longEdge =
      2 * readCameraToCenterDistancePx(libreMap) * calibration.halfFovTan;
    const width =
      longEdge * Math.min(1, calibration.widthPx / calibration.heightPx);
    const height =
      longEdge / Math.max(1, calibration.widthPx / calibration.heightPx);
    const roll = degToRad(record.pose?.rollDeg ?? 0);
    const x = principal.xOffset * width,
      y = principal.yOffset * height;
    const offset = libreMap.transform.centerOffset;
    viewerConfig.previewState?.onChange({
      seriesId: record.seriesId,
      imageId: record.sourceId,
      panX: ((offset.x + Math.cos(roll) * x - Math.sin(roll) * y) /
        longEdge) as Ratio,
      panY: ((offset.y + Math.sin(roll) * x + Math.cos(roll) * y) /
        longEdge) as Ratio,
      zoom: (Math.min(width, height) /
        Math.min(libreMap.transform.width, libreMap.transform.height)) as Ratio,
    });
  };
  useEffect(() => {
    const initial = initialPreviewRef.current;
    if (
      !initial ||
      initialPreviewRestoredRef.current ||
      !browsing ||
      isBusy ||
      !data
    )
      return;
    const record = data.imageRecords.get(
      qualifiedImageId(initial.seriesId, initial.imageId)
    );
    if (!record) {
      // Another series may finish before the URL's series has even started loading.
      const status = perSeries.find((series) => series.id === initial.seriesId);
      if (status && !status.isLoading) initialPreviewRestoredRef.current = true;
      return;
    }
    initialPreviewRestoredRef.current = true;
    const flyToImportedImage = viewerConfig.initialPreviewFlyToImage === true;
    void openPreview(
      record.id,
      flyToImportedImage ? "whole-image" : true,
      initial,
      flyToImportedImage,
      !flyToImportedImage
    );
  }, [
    browsing,
    isBusy,
    perSeries,
    data,
    openPreview,
    viewerConfig.initialPreviewFlyToImage,
  ]);
  const hadPreviewRef = useRef(false);
  useEffect(() => {
    if (previewVisible) {
      hadPreviewRef.current = true;
      if (!isBusy) writePreviewHashRef.current();
    } else if (hadPreviewRef.current && !previewTransitionActive) {
      viewerConfig.previewState?.onChange(null);
      hadPreviewRef.current = false;
    }
  }, [
    previewVisible,
    isBusy,
    previewTransitionActive,
    selectedImageId,
    viewerConfig.previewState,
  ]);

  const loadedEnabledSeriesCount = useMemo(
    () =>
      perSeries.filter(
        (status) =>
          enabledSet.has(status.id) &&
          status.imageCount > 0 &&
          data?.datasets.has(status.id)
      ).length,
    [perSeries, enabledSet, data]
  );

  const hoverSeriesLabels = useMemo(
    () =>
      new Map(
        configuredSeries.map((series) => [
          series.id,
          footprintSeriesLabel(series, loadedEnabledSeriesCount),
        ])
      ),
    [configuredSeries, loadedEnabledSeriesCount]
  );

  const previewPhoto = useMemo(() => {
    if (
      !selectedRecord ||
      !selectedCalibration ||
      previewAltitude?.imageId !== selectedRecord.id
    )
      return undefined;
    const seamlessPreview = nextInterface && previewSeamless;
    const anchor =
      seamlessPreview && !previewAltitude.projectionAnchor
        ? readViewAnchor(undefined, "auto")
        : undefined;
    const location = anchor?.toLngLat();
    return {
      record: selectedRecord,
      calibration: selectedCalibration,
      pose: poseOf(selectedRecord, selectedDataset),
      altitude: previewAltitude.altitude,
      projectionAnchor:
        previewAltitude.projectionAnchor ??
        (anchor && location
          ? {
              longitude: location.lng,
              latitude: location.lat,
              heightMeters: anchor.toAltitude(),
            }
          : undefined),
    };
  }, [
    selectedRecord,
    selectedCalibration,
    selectedDataset,
    previewAltitude,
    nextInterface,
    previewSeamless,
    readViewAnchor,
  ]);

  const previewAlignmentAnchorRef = useRef(previewPhoto?.projectionAnchor);
  previewAlignmentAnchorRef.current = previewPhoto?.projectionAnchor;
  const previewCoveragePhotoRef = useRef(
    previewPhoto ? { ...previewPhoto, dataset: selectedDataset } : undefined
  );
  previewCoveragePhotoRef.current = previewPhoto
    ? { ...previewPhoto, dataset: selectedDataset }
    : undefined;
  const previewCoversViewport = useCallback(
    (frame: MaplibreMap["transform"]) => {
      const photo = previewCoveragePhotoRef.current;
      if (!libreMap || !photo) return false;
      try {
        const actualAnchor = photo.projectionAnchor;
        const projectionAnchor = actualAnchor
          ? MercatorCoordinate.fromLngLat(
              { lng: actualAnchor.longitude, lat: actualAnchor.latitude },
              actualAnchor.heightMeters
            )
          : undefined;
        return viewportImageCoversViewport(
          previewLandingProjection(
            libreMap,
            photo,
            photo.pose,
            photo.altitude,
            frame,
            projectionAnchor
          )
        );
      } catch {
        return false;
      }
    },
    [libreMap]
  );
  const previousSeamlessRef = useRef({
    seamless: previewSeamless,
    coveredOnly: previewUprightOnlyWhenCovered,
  });
  useEffect(() => {
    const toggled =
      previousSeamlessRef.current.seamless !== previewSeamless ||
      previousSeamlessRef.current.coveredOnly !== previewUprightOnlyWhenCovered;
    previousSeamlessRef.current = {
      seamless: previewSeamless,
      coveredOnly: previewUprightOnlyWhenCovered,
    };
    if (
      !libreMap ||
      !running ||
      !nextInterface ||
      !previewVisible ||
      mosaicActive ||
      !toggled
    )
      return cancelToggleCameraTween;
    cancelNavigationRef.current();
    activeFlightRef.current?.cancel();
    activeFlightRef.current = null;
    seamlessFlightEpochRef.current = null;
    setBusy(false);
    setDimImage(false);
    setPreviewTransitionActive(false);
    const cached = previewAlignmentAnchorRef.current ?? targetRef.current;
    if (cached) {
      const anchor = MercatorCoordinate.fromLngLat(
        { lng: cached.longitude, lat: cached.latitude },
        cached.heightMeters ?? libreMap.getCenterElevation()
      );
      toggleCameraTweenRef.current = tweenPreviewCameraUpright(
        libreMap,
        anchor,
        previewSeamless,
        () => {
          toggleCameraTweenRef.current = undefined;
          writePreviewHashRef.current();
        },
        previewUprightOnlyWhenCovered
          ? (frame) => previewCoversViewport(frame)
          : undefined
      );
    }
    return cancelToggleCameraTween;
  }, [
    libreMap,
    running,
    nextInterface,
    previewVisible,
    previewSeamless,
    mosaicActive,
    previewUprightOnlyWhenCovered,
    previewCoversViewport,
    selectedImageId,
    setBusy,
    cancelToggleCameraTween,
  ]);
  useEffect(() => {
    if (!libreMap) return;
    const surface = previewRoot ?? libreMap.getCanvasContainer();
    const cancel = () => cancelToggleCameraTween();
    const moved = (event: unknown) => {
      const internal = event as {
        obliqueFov?: boolean;
        obliqueUpright?: boolean;
      };
      if (!internal.obliqueFov && !internal.obliqueUpright) cancel();
    };
    surface.addEventListener("pointerdown", cancel, true);
    surface.addEventListener("wheel", cancel, { capture: true, passive: true });
    libreMap.on("movestart", moved);
    return () => {
      surface.removeEventListener("pointerdown", cancel, true);
      surface.removeEventListener("wheel", cancel, true);
      libreMap.off("movestart", moved);
      cancel();
    };
  }, [libreMap, previewRoot, cancelToggleCameraTween]);

  useEffect(() => {
    if (
      !libreMap ||
      !running ||
      !nextInterface ||
      !previewSeamless ||
      mosaicActive ||
      !previewVisible
    )
      return;
    let adjusting = false;
    const align = () => {
      if (
        adjusting ||
        toggleCameraTweenRef.current ||
        busyRef.current ||
        activeFlightRef.current
      )
        return;
      const cached = previewPhoto?.projectionAnchor ?? targetRef.current;
      if (!cached) return;
      const anchor = MercatorCoordinate.fromLngLat(
        { lng: cached.longitude, lat: cached.latitude },
        cached.heightMeters ?? libreMap.getCenterElevation()
      );
      const frame = libreMap.transform.clone();
      if (
        !uprightPreviewCamera(
          libreMap,
          frame,
          anchor,
          true,
          previewUprightOnlyWhenCovered
            ? (candidate) => previewCoversViewport(candidate)
            : undefined
        )
      )
        return;
      adjusting = true;
      try {
        libreMap.jumpTo(
          {
            center: frame.center,
            zoom: frame.zoom,
            pitch: frame.pitch,
            bearing: frame.bearing,
            roll: frame.roll,
            elevation: frame.elevation,
            padding: frame.padding,
          },
          { obliqueUpright: true, obliqueFov: true }
        );
      } finally {
        adjusting = false;
      }
    };
    alignPreviewCameraRef.current = align;
    align();
    return () => {
      alignPreviewCameraRef.current = () => {};
    };
  }, [
    libreMap,
    running,
    nextInterface,
    previewSeamless,
    mosaicActive,
    previewUprightOnlyWhenCovered,
    previewCoversViewport,
    previewVisible,
    selectedImageId,
    previewAltitude?.imageId,
    previewPhoto?.projectionAnchor,
  ]);

  const onPreviewDisplayReady = useCallback(
    (imageId: string) => {
      if (imageId !== selectedImageRef.current?.record.id) return;
      const epoch = selectionEpochRef.current;
      const preparedDrape = rotationDrapeTransitionRef.current;
      if (preparedDrape?.transition.targetImageId === imageId)
        preparedDrape.transition.reveal?.();
      const revealed = readyTransitionBackdrop(imageId);
      if (navigationDisplayTargetRef.current === imageId)
        navigationDisplayTargetRef.current = null;
      // Native pixels have now met the real crop/density. Replace the earlier
      // fit forecast so the other headings warm at this same display quality.
      refreshNavigationLookAheadRef.current();
      if (preparedLandingRef.current?.imageId === imageId) {
        preparedLandingRef.current.release();
        preparedLandingRef.current = null;
      }
      void revealed.then((visible) => {
        if (
          !visible ||
          epoch !== selectionEpochRef.current ||
          imageId !== selectedImageRef.current?.record.id
        )
          return;
        previewDisplayReadyRef.current = imageId;
        const drape = rotationDrapeTransitionRef.current;
        if (drape?.settled && drape.transition.targetImageId === imageId) {
          drape.transition.dispose();
          rotationDrapeTransitionRef.current = null;
          setTransitionSourceRecord(null);
        }
      });
    },
    [readyTransitionBackdrop]
  );
  useEffect(() => {
    const held = hoverFlightRef.current;
    if (
      held?.settled &&
      (held.imageId !== selectedImageId || !previewCameraActive)
    )
      releaseHoverFlight();
  }, [selectedImageId, previewCameraActive, releaseHoverFlight]);

  const onPreviewOutlineReady = useCallback(() => {
    if (
      previewVisibleRef.current &&
      selectedImageRef.current?.record.id === selectedImageId &&
      selectedImageId &&
      !missingImagesRef.current.has(selectedImageId) &&
      !currentPreviewMissingRef.current()
    ) {
      setPreviewOutlineReadyImageId(selectedImageId);
      void hideFootprintsRef.current();
    }
  }, [selectedImageId]);

  const previewThumbnailSource = useCallback(
    (record: ObliqueImageRecord | null) => {
      const dataset = record && data?.datasets.get(record.seriesId);
      if (!record || !dataset) return null;
      const camera = getCameraCalibration(dataset, record.cameraId);
      const pyramid = pyramidOptionsOf({ record, dataset });
      return {
        previewPath: dataset.previewPath,
        imageId: record.sourceId,
        avifOnly: dataset.avifOnly,
        originalImageUrl:
          dataset.avifOnly || pyramid.avifFormat
            ? undefined
            : record.assets?.original?.href,
        ...pyramid,
        nativeSize: { width: camera.widthPx, height: camera.heightPx },
      };
    },
    [data]
  );
  currentPreviewMissingRef.current = () => {
    const source = previewThumbnailSource(
      selectedImageRef.current?.record ?? null
    );
    return source ? isPreviewSourceMissing(source) : false;
  };
  const watchPreviewAvailability = useCallback(
    (record: ObliqueImageRecord | null) => {
      if (!record || !runningRef.current) return;
      const source = previewThumbnailSource(record);
      if (!source) return;
      const identity = JSON.stringify([
        source.previewPath,
        source.imageId,
        source.originalImageUrl,
        source.avifPyramidUrl,
        source.avifOnly,
      ]);
      const old = availabilitySubscriptions.current.get(record.id);
      if (old?.identity === identity) return;
      old?.unsubscribe();
      const entry = { identity, source, unsubscribe: () => {} };
      availabilitySubscriptions.current.set(record.id, entry);
      const update = () => {
        if (
          !runningRef.current ||
          availabilitySubscriptions.current.get(record.id) !== entry
        )
          return;
        const missing = isPreviewSourceMissing(source);
        setMissingImages((previous) => {
          if (previous.has(record.id) === missing) return previous;
          const next = new Set(previous);
          if (missing) next.add(record.id);
          else next.delete(record.id);
          return next;
        });
        if (missing && selectedImageRef.current?.record.id === record.id)
          setPreviewOutlineReadyImageId(null);
      };
      entry.unsubscribe = subscribePreviewThumbnail(source, update);
      update();
      while (availabilitySubscriptions.current.size > 128) {
        const id = availabilitySubscriptions.current.keys().next().value!;
        availabilitySubscriptions.current.get(id)?.unsubscribe();
        availabilitySubscriptions.current.delete(id);
        setMissingImages((previous) => {
          if (!previous.has(id)) return previous;
          const next = new Set(previous);
          next.delete(id);
          return next;
        });
      }
    },
    [previewThumbnailSource]
  );
  useEffect(() => {
    if (!running)
      setMissingImages((previous) => (previous.size ? new Set() : previous));
    return () => {
      for (const entry of availabilitySubscriptions.current.values())
        entry.unsubscribe();
      availabilitySubscriptions.current.clear();
    };
  }, [running]);
  useEffect(() => {
    for (const id of [...availabilitySubscriptions.current.keys()]) {
      const record = data?.imageRecords.get(id);
      if (record) watchPreviewAvailability(record);
      else {
        availabilitySubscriptions.current.get(id)?.unsubscribe();
        availabilitySubscriptions.current.delete(id);
        setMissingImages((previous) => {
          if (!previous.has(id)) return previous;
          const next = new Set(previous);
          next.delete(id);
          return next;
        });
      }
    }
    watchPreviewAvailability(selectedRecord);
  }, [data, selectedRecord, watchPreviewAvailability]);
  const selectedPreviewMissing =
    !!selectedImageId && missingImages.has(selectedImageId);
  useEffect(() => {
    publish({
      missingPreviewImageId:
        running && selectedPreviewMissing ? selectedImageId : null,
    });
  }, [running, selectedPreviewMissing, selectedImageId, publish]);

  const navigationWarmRef = useRef<(() => void) | null>(null);
  const navigationPrefetchGroupRef = useRef<string | null>(null);
  const refreshNavigationLookAheadRef = useRef<() => void>(() => {});
  const navigationDisplayTargetRef = useRef<string | null>(null);
  // Forecasts stop at their display ROI/level; a small byte cap can otherwise
  // leave every image permanently below the requested display resolution.
  const navigationPrefetchConfig = useMemo(
    () => ({
      imageBytes: viewerConfig.prefetch?.imageBytes ?? Number.MAX_SAFE_INTEGER,
      groupBytes: viewerConfig.prefetch?.groupBytes ?? Number.MAX_SAFE_INTEGER,
      maxImages: viewerConfig.prefetch?.maxImages ?? 4,
    }),
    [viewerConfig.prefetch]
  );
  const prepareNavigationForecast = useCallback(
    (
      candidate: NearestObliqueImageRecord | null,
      step?: PreparedObliqueNavigationTarget
    ) => {
      if (!candidate) return null;
      const record = candidate.record;
      const dataset = currentDataRef.current?.datasets.get(record.seriesId);
      const input = previewThumbnailSource(record);
      if (!libreMap || !dataset || !input || isPreviewSourceMissing(input))
        return null;
      const source = nativePreviewSource({
        imageId: record.sourceId,
        path: dataset.previewPath,
        sourceUrl: input.originalImageUrl ?? input.avifPyramidUrl ?? "",
        avifPyramidUrl: input.avifPyramidUrl,
        avifFormat: input.avifFormat,
        avifPyramidFallbackUrl: input.avifPyramidFallbackUrl,
        avifOnly: dataset.avifOnly,
        nativeSize: {
          width: input.nativeSize.width as DevicePixels,
          height: input.nativeSize.height as DevicePixels,
        },
        minimumQualityLevel: dataset.minimumPreviewQualityLevel,
      });
      const { width, height } = libreMap.transform;
      const forecast = fitNativePreviewView(
        source,
        width,
        height,
        degToRad(poseOf(record, dataset).rollDeg as Degrees),
        window.devicePixelRatio || 1
      );
      // NG on-the-spot rotation retains the current scale. Reuse a normalized
      // crop as the bounded initial forecast; settled geometry then replaces it.
      if (
        nextInterface &&
        step &&
        !step.fitNextImage &&
        previewVisibleRef.current
      ) {
        const previous = selectedImageRef.current?.record;
        const previousInput = previewThumbnailSource(previous ?? null);
        const previousDataset =
          previous && currentDataRef.current?.datasets.get(previous.seriesId);
        if (previous && previousInput && previousDataset) {
          const oldSource = nativePreviewSource({
            imageId: previous.sourceId,
            path: previousDataset.previewPath,
            sourceUrl:
              previousInput.originalImageUrl ??
              previousInput.avifPyramidUrl ??
              "",
            avifPyramidUrl: previousInput.avifPyramidUrl,
            avifFormat: previousInput.avifFormat,
            avifPyramidFallbackUrl: previousInput.avifPyramidFallbackUrl,
            avifOnly: previousDataset.avifOnly,
            nativeSize: {
              width: previousInput.nativeSize.width as DevicePixels,
              height: previousInput.nativeSize.height as DevicePixels,
            },
            minimumQualityLevel: previousDataset.minimumPreviewQualityLevel,
          });
          const old = lastNativePreviewView(oldSource);
          if (old && oldSource.nativeSize) {
            const scaleX = input.nativeSize.width / oldSource.nativeSize.width;
            const scaleY =
              input.nativeSize.height / oldSource.nativeSize.height;
            const crop = old.view.visible;
            forecast.view = {
              visible: {
                x: (crop.x * scaleX) as DevicePixels,
                y: (crop.y * scaleY) as DevicePixels,
                width: (crop.width * scaleX) as DevicePixels,
                height: (crop.height * scaleY) as DevicePixels,
              },
              density: (old.view.density / Math.min(scaleX, scaleY)) as Ratio,
            };
          }
        }
      }
      // Creating the new lease first protects a same-source warm stack from
      // stale hover cleanup. The pool alone gates work against visible demand.
      rememberNativePreviewView(source, forecast.view, forecast.pixels);
      return { source, view: forecast.view, viewportPixels: forecast.pixels };
    },
    [libreMap, nextInterface, previewThumbnailSource]
  );
  const prefetchNavigationLookAhead = useCallback(
    (
      candidate: NearestObliqueImageRecord | null,
      step?: PreparedObliqueNavigationTarget
    ) => {
      const forecast = prepareNavigationForecast(candidate, step);
      if (forecast)
        nativePixelPool.setPrefetchGroup(
          navigationPrefetchGroupRef.current ??
            selectedImageRef.current?.record.id ??
            forecast.source.url,
          navigationPrefetchConfig
        );
      const previous = navigationWarmRef.current;
      navigationWarmRef.current = forecast
        ? nativePixelPool.prewarm(
            forecast.source,
            forecast.view,
            forecast.viewportPixels
          )
        : null;
      previous?.();
    },
    [prepareNavigationForecast, navigationPrefetchConfig]
  );
  const prefetchNavigationGroup = useCallback(
    (targets: readonly PreparedObliqueNavigationTarget[], groupKey: string) => {
      const forecasts = targets
        .map((step) => prepareNavigationForecast(step.candidate, step))
        .filter(
          (forecast): forecast is NonNullable<typeof forecast> => !!forecast
        );
      navigationWarmRef.current?.();
      // Budget admission counts unique sources. New group membership needs a
      // new allowance; merely reordering hover priority or refining does not.
      const budgetKey = JSON.stringify([
        groupKey,
        [
          ...new Set(
            forecasts.map(({ source }) => `${source.kind}:${source.url}`)
          ),
        ].sort(),
      ]);
      navigationPrefetchGroupRef.current = budgetKey;
      nativePixelPool.setPrefetchGroup(budgetKey, navigationPrefetchConfig);
      navigationWarmRef.current = prewarmNavigationGroup(
        nativePixelPool,
        forecasts,
        () =>
          !busyRef.current &&
          (!navigationDisplayTargetRef.current ||
            navigationDisplayTargetRef.current !==
              selectedImageRef.current?.record.id)
      );
    },
    [prepareNavigationForecast, navigationPrefetchConfig]
  );
  useEffect(
    () => () => {
      navigationWarmRef.current?.();
      navigationWarmRef.current = null;
    },
    []
  );
  useEffect(() => {
    if (!running || viewMode === "objectCoverage") {
      navigationWarmRef.current?.();
      navigationWarmRef.current = null;
    }
  }, [running, viewMode]);

  const hoverCandidateQueueRef = useRef<ReturnType<
    typeof createHoverCandidatePrefetch
  > | null>(null);
  const directHoverLoadingRef = useRef(false);
  const hoverFadingImageIdsRef = useRef<ReadonlySet<string>>(new Set());
  const refreshHoverCandidatesRef = useRef<() => void>(() => undefined);
  const hoverCandidateSources = useMemo(
    () =>
      (!nextInterface || !previewHoverDrape ? [] : hoverPrewarmRecords).flatMap(
        (record) => {
          const dataset = data?.datasets.get(record.seriesId);
          const input = previewThumbnailSource(record);
          if (!dataset || !input || !enabledSet.has(record.seriesId)) return [];
          return [
            {
              recordId: record.id,
              source: nativePreviewSource({
                imageId: record.sourceId,
                path: dataset.previewPath,
                sourceUrl: input.originalImageUrl ?? input.avifPyramidUrl ?? "",
                avifPyramidUrl: input.avifPyramidUrl,
                avifOnly: dataset.avifOnly,
                nativeSize: {
                  width: input.nativeSize.width as DevicePixels,
                  height: input.nativeSize.height as DevicePixels,
                },
                minimumQualityLevel: dataset.minimumPreviewQualityLevel,
              }),
            },
          ];
        }
      ),
    [
      hoverPrewarmRecords,
      data,
      previewThumbnailSource,
      enabledSet,
      nextInterface,
      previewHoverDrape,
    ]
  );
  refreshHoverCandidatesRef.current = () => {
    hoverCandidateQueueRef.current?.update(
      hoverCandidateSources
        .filter(({ recordId }) => !hoverFadingImageIdsRef.current.has(recordId))
        .map(({ source }) => source),
      mosaicActive ||
        isBusy ||
        directHoverLoadingRef.current ||
        nativePixelPool.metrics.images.some(
          (image) => image.active && !image.visibleReady
        )
    );
  };
  useEffect(() => {
    if (
      !running ||
      !nextInterface ||
      !previewHoverDrape ||
      mosaicActive ||
      viewMode !== "oblique"
    )
      return;
    const queue = createHoverCandidatePrefetch();
    hoverCandidateQueueRef.current = queue;
    const unsubscribe = nativePixelPool.subscribe(() =>
      refreshHoverCandidatesRef.current()
    );
    refreshHoverCandidatesRef.current();
    return () => {
      unsubscribe();
      if (hoverCandidateQueueRef.current === queue)
        hoverCandidateQueueRef.current = null;
      queue.dispose();
    };
  }, [running, nextInterface, previewHoverDrape, viewMode, mosaicActive]);
  useEffect(() => {
    refreshHoverCandidatesRef.current();
  }, [hoverCandidateSources, isBusy, mosaicActive]);

  useEffect(() => {
    if (
      !libreMap ||
      !running ||
      !nextInterface ||
      !previewHoverDrape ||
      mosaicActive ||
      viewMode !== "oblique"
    )
      return;
    const controller = createHoverPhotoDrape(libreMap, {
      showBasemapLabels: () => rotationDrapeLabelsRef.current,
      intersectSurface: (ray, eye) =>
        axisPicker?.intersectSurface(ray, eye, "auto") ?? null,
      readBase: (source, signal) =>
        hoverCandidateQueueRef.current?.readBase(source, signal) ??
        Promise.resolve(undefined),
      onLoadingChange: (loading) => {
        directHoverLoadingRef.current = loading;
        refreshHoverCandidatesRef.current();
      },
    });
    hoverDrapeRef.current = controller;
    libreMap.triggerRepaint();
    return () => {
      if (hoverDrapeRef.current === controller) hoverDrapeRef.current = null;
      releaseHoverFlight();
      controller.dispose();
    };
  }, [
    libreMap,
    running,
    nextInterface,
    previewHoverDrape,
    mosaicActive,
    viewMode,
    releaseHoverFlight,
    axisPicker,
  ]);
  useEffect(() => {
    hoverDrapeRef.current?.refreshStyle();
  }, [previewBasemapLabels]);
  hideFootprintsRef.current = useFootprintLayer({
    map: libreMap,
    enabled: running && viewMode !== "objectCoverage",
    selectedImageId: transitionSourceRecord?.id ?? selectedImageId,
    selectedRecord: data?.imageRecords.has(
      (transitionSourceRecord ?? selectedRecord)?.id ?? ""
    )
      ? transitionSourceRecord ?? selectedRecord
      : null,
    nearbyRecords: visibleFootprints,
    datasets: data?.datasets,
    heightOffset,
    seriesLabels: hoverSeriesLabels,
    showSeriesLabels: loadedEnabledSeriesCount > 1,
    missingImageIds: missingImages,
    onClickClaim: (imageId) => {
      if (!nextInterface || !previewHoverDrape) return;
      const release = hoverDrapeRef.current?.pin(imageId);
      if (!release) return;
      releaseHoverFlight();
      const claimed = { imageId, settled: false, claimed: true, release };
      hoverFlightRef.current = claimed;
      return () => {
        if (hoverFlightRef.current === claimed) releaseHoverFlight();
      };
    },
    onHoveredRecord: (record) => {
      if (hoverSelectionRef.current || busyRef.current) return;
      if (mosaicActive) {
        if (mosaicHoveredId.current !== (record?.id ?? null)) {
          mosaicHoveredId.current = record?.id ?? null;
          clearTimeout(mosaicHoverTimer.current);
          if (record && record.seriesId !== activeMosaicSeriesId) {
            mosaicHoverTimer.current = setTimeout(() => {
              void openPreview(record.id, false);
            }, 250);
          }
        }
        return;
      }
      if (!record) axisPicker?.clearDebug();
      watchPreviewAvailability(record);
      if (!nextInterface || !previewHoverDrape)
        prefetchPreviewThumbnail(previewThumbnailSource(record));
    },
    onHoverProjections: (projections) => {
      const visible = previewCameraActive ? [] : projections;
      const fading = new Set(
        visible
          .filter((projection) => !projection.isCurrent)
          .map((projection) => projection.record.id)
      );
      const previous = hoverFadingImageIdsRef.current;
      const changed =
        fading.size !== previous.size ||
        [...fading].some((id) => !previous.has(id));
      // Exclude retiring sources before cancelling demand can resume idle work.
      hoverFadingImageIdsRef.current = fading;
      hoverDrapeRef.current?.update(visible);
      if (changed) refreshHoverCandidatesRef.current();
    },
    findAtScreenPoint: async (point) => {
      if (hoverSelectionRef.current || busyRef.current) return undefined;
      if (!axisPicker) return null;
      const catalogTarget = nextInterface
        ? readCatalogReferenceTarget(point)
        : null;
      const anchor = nextInterface ? undefined : readViewAnchor(point);
      const ground = anchor?.toLngLat();
      const groundPoint: [number, number] | null = catalogTarget
        ? [catalogTarget.longitude, catalogTarget.latitude]
        : ground
        ? [ground.lng, ground.lat]
        : null;
      if (!groundPoint) {
        axisPicker.clearDebug();
        return null;
      }
      const record = await findAtGroundPoint(
        groundPoint,
        selectedImageRef.current?.record.id,
        catalogTarget?.heightMeters ?? anchor?.toAltitude(),
        nextInterface
          ? { x: point.x as CssPixels, y: point.y as CssPixels }
          : undefined
      );
      if (hoverSelectionRef.current || busyRef.current) return undefined;
      if (!nextInterface) axisPicker.reportPointer(record, groundPoint);
      return record;
    },
    seriesLabel: footprintSeriesLabel(
      selectedDataset,
      loadedEnabledSeriesCount
    ),
    locked: (previewVisible && !mosaicActive) || isBusy,
    isLocked: () => !!hoverSelectionRef.current || busyRef.current,
    hidden:
      mosaicActive ||
      // The draped pair owns both fading contours. Do not revive the static
      // selection outline when retaining its source record during navigation.
      (nextInterface && !previewSeamless && !!transitionSourceRecord) ||
      (!transitionSourceRecord &&
        previewVisible &&
        !dimImage &&
        !selectedPreviewMissing &&
        previewOutlineReadyImageId === selectedImageId),
    style: {
      ...selectedDataset.footprintsStyle,
      outlineWidth: 2,
      ...(nextInterface && previewHoverDrape ? { fillOpacity: 0 } : {}),
    },
    fadeOut: selectedDataset.animations.outlineFadeOut,
    onClick: (imageId) => {
      void openPreview(imageId, !nextInterface);
    },
    onDoubleClick: (imageId) => {
      void openPreview(imageId, nextInterface);
    },
  });

  const chooseRequestedView = useCallback(
    async (
      headingRad: number,
      target: ObliqueGroundTarget,
      animation: AnimationConfig | undefined,
      requestedPitchRad?: number,
      forceFlight = false,
      viewAnchor?: MercatorCoordinate,
      fitNextImage = false
    ) => {
      if (!libreMap || busyRef.current) return;
      const sourceRecord = selectedImageRef.current?.record;
      cancelRotationDrape();
      targetRef.current = target;
      const epoch = ++selectionEpochRef.current;
      const ready = await awaitDirection(headingRad as Radians, {
        cameraView: viewModeRef.current === "nadir" ? "nadir" : undefined,
      });
      if (
        !ready ||
        !runningRef.current ||
        busyRef.current ||
        epoch !== selectionEpochRef.current
      )
        return;
      const candidates = await refreshSearchRef.current({
        headingRad,
        pitchRad: requestedPitchRad ?? degToRad(libreMap.getPitch()),
        target,
        immediate: true,
        computeOnly: true,
      });
      if (
        !runningRef.current ||
        busyRef.current ||
        epoch !== selectionEpochRef.current
      )
        return;
      const nearest = candidates?.find((candidate) =>
        enabledSetRef.current.has(candidate.record.seriesId)
      );
      if (mosaicActive) {
        if (nearest) {
          selectedImageRef.current = nearest;
          setSelectedImage(nearest);
        }
        return;
      }
      const withPreview = previewVisibleRef.current;
      if (!withPreview && viewAnchor) {
        const dataset =
          nearest &&
          currentDataRef.current?.datasets.get(nearest.record.seriesId);
        const drape =
          nearest && nextInterface
            ? await prepareRotationDrape(sourceRecord, nearest.record, epoch)
            : undefined;
        if (epoch !== selectionEpochRef.current || !runningRef.current) {
          drape?.dispose();
          return;
        }
        if (nearest) setSelectedImage(nearest);
        // Browsing ends at its regular pitch in the same tween as heading,
        // pan and scale, without visiting the photo pitch first.
        await returnCameraToBrowsing(animation?.duration, {
          bearingDeg:
            nearest && dataset
              ? poseOf(nearest.record, dataset).bearingDeg
              : radToDeg(headingRad),
          anchor: viewAnchor,
          orbitAroundAnchor: true,
          easing: animation?.easingFunction,
          onProgress: drape?.update,
        })?.done;
        finishRotationDrape(drape);
        return;
      }
      if (
        !nearest ||
        (nearest.record.id === selectedImageRef.current?.record.id &&
          !forceFlight)
      ) {
        setDimImage(false);
        return;
      }
      const drape =
        nextInterface && withPreview
          ? await prepareRotationDrape(sourceRecord, nearest.record, epoch)
          : undefined;
      if (epoch !== selectionEpochRef.current || !runningRef.current) {
        drape?.dispose();
        return;
      }
      if (
        nextInterface &&
        navigationDrapeEnabled &&
        withPreview &&
        viewModeRef.current === "oblique" &&
        !drape
      ) {
        setBusy(false);
        setRuntimeError(
          "Das aktuelle Foto ist noch nicht für den Bildwechsel bereit."
        );
        return;
      }
      if (nextInterface && withPreview && viewModeRef.current === "oblique") {
        setBusy(true);
        if (
          !(await fadeOutPreviewOverlay(nearest.record.id, !!drape)) ||
          epoch !== selectionEpochRef.current ||
          !runningRef.current
        ) {
          if (epoch === selectionEpochRef.current) setBusy(false);
          return;
        }
      }
      if (withPreview) setDimImage(true);
      selectedImageRef.current = nearest;
      setSelectedImage(nearest);
      const succeeded = await flyTo(
        nearest.record,
        animation,
        true,
        viewAnchor !== undefined ||
          (withPreview && (fitNextImage || !nextInterface)),
        viewAnchor,
        withPreview && (fitNextImage || !nextInterface) ? true : undefined,
        undefined,
        drape?.update,
        viewAnchor !== undefined
      );
      if (epoch !== selectionEpochRef.current || !runningRef.current) return;
      setDimImage(false);
      finishRotationDrape(drape);
      if (!succeeded) {
        publish({ previewVisible: false });
        if (runningRef.current) void settleToBrowsing();
      } else if (!withPreview) await settleToBrowsing();
      else setPreviewTransitionActive(false);
    },
    [
      libreMap,
      data,
      refreshSearch,
      awaitDirection,
      flyTo,
      publish,
      returnCameraToBrowsing,
      settleToBrowsing,
      nextInterface,
      fadeOutPreviewOverlay,
      navigationDrapeEnabled,
      mosaicActive,
      cancelRotationDrape,
      prepareRotationDrape,
      finishRotationDrape,
    ]
  );

  const ensureNavigationDirections = useCallback(
    async (queries: Parameters<typeof computeNavigation>[0]) => {
      const unique = new Map<
        string,
        { heading: Radians; cameraView?: "nadir" }
      >();
      for (const query of queries) {
        if (query.headingRad === undefined) continue;
        const cameraView = query.cameraView === "nadir" ? "nadir" : undefined;
        unique.set(`${cameraView ?? "oblique"}:${query.headingRad}`, {
          heading: query.headingRad as Radians,
          cameraView,
        });
      }
      await Promise.all(
        [...unique.values()].map(({ heading, cameraView }) =>
          awaitDirection(heading, { cameraView })
        )
      );
    },
    [awaitDirection]
  );
  const publishNavigationTargets = useCallback(
    (
      navigationTargets:
        | import("./oblique-actions").ObliqueNavigationTargets
        | null
    ) => publish({ navigationTargets }),
    [publish]
  );
  const {
    warmNavigation,
    refreshLookAhead: refreshNavigationLookAhead,
    requestTarget: requestNavigationTarget,
    requestAction: requestNavigationAction,
    cancel: cancelNavigation,
    getCardinal: getCardinalNavigationTarget,
    rememberDirection,
    rememberRotation,
    invalidate: invalidateNavigation,
  } = useObliqueNavigationTargets({
    map: libreMap,
    data,
    selectedImage,
    enabled: browsing,
    rotationReady: isCatalogComplete,
    viewMode,
    previewCameraActive,
    nextInterface,
    targetRef,
    preserveViewCenter:
      nextInterface &&
      previewNavigationMode === "view-center" &&
      !previewSeamless,
    busyRef,
    readTarget,
    readRotationTarget,
    computeNavigation,
    ensureDirections: ensureNavigationDirections,
    publish: publishNavigationTargets,
    onLookAhead: prefetchNavigationLookAhead,
    onLookAheadGroup: prefetchNavigationGroup,
  });
  useEffect(() => {
    publish({ warmNavigation });
    return () => publish({ warmNavigation: undefined });
  }, [publish, warmNavigation]);
  invalidateNavigationRef.current = invalidateNavigation;
  refreshNavigationLookAheadRef.current = refreshNavigationLookAhead;
  cancelNavigationRef.current = () => {
    if (hoverSelectionRef.current) {
      hoverSelectionRef.current = null;
      setBusy(false);
    }
    // Cancelling a pending flight releases its pin. Ordinary panning of the
    // arrived image keeps its calibrated underlay until that image is left.
    if (
      hoverFlightRef.current &&
      !hoverFlightRef.current.settled &&
      !hoverFlightRef.current.claimed
    )
      releaseHoverFlight();
    seamlessPanRef.current.cancel();
    navigationDisplayTargetRef.current = null;
    cancelNavigation();
    navigationWarmRef.current?.();
    navigationWarmRef.current = null;
    selectionEpochRef.current++;
    cancelRotationDrape();
  };
  const navigatePrepared = useCallback(
    async (
      step: PreparedObliqueNavigationTarget | undefined,
      key?: ObliqueNavigationKey,
      allowModeChange = false,
      intent: "manual" | "seamless" = "manual"
    ) => {
      if (
        !step ||
        !libreMap ||
        !runningRef.current ||
        viewModeRef.current === "objectCoverage" ||
        (!allowModeChange &&
          step.originImageId !== selectedImageRef.current?.record.id) ||
        !enabledSetRef.current.has(step.candidate.record.seriesId)
      )
        return;
      publish({ lastActiveSeriesId: step.candidate.record.seriesId });
      if (mosaicActive) {
        setMosaicSeriesId(step.candidate.record.seriesId);
        selectedImageRef.current = step.candidate;
        setSelectedImage(step.candidate);
        return;
      }
      const dataset = currentDataRef.current?.datasets.get(
        step.candidate.record.seriesId
      );
      if (!dataset) return;
      const sourceSelection = selectedImageRef.current;
      const sourceRecord = sourceSelection?.record;
      navigationDisplayTargetRef.current = previewVisibleRef.current
        ? step.candidate.record.id
        : null;
      const seamless = intent === "seamless";
      seamlessPanRef.current.cancel();
      cancelRotationDrape();
      prefetchNavigationLookAhead(step.candidate, step);
      if (key) rememberDirection(key);
      if (!step.fitNextImage && !step.preserveViewCenter && !seamless)
        rememberRotation(step.target);
      const epoch = ++selectionEpochRef.current;
      activeFlightRef.current?.cancel();
      activeFlightRef.current = null;
      targetRef.current = step.target;
      setRuntimeError(null);
      const withPreview = previewVisibleRef.current;
      navigationSelectionHeldRef.current = !withPreview;
      const pose = poseOf(step.candidate.record, dataset);
      const anchor = MercatorCoordinate.fromLngLat(
        { lng: step.target.longitude, lat: step.target.latitude },
        step.target.heightMeters ?? libreMap.getCenterElevation()
      );
      const rotation =
        key === OBLIQUE_NAVIGATION_KEYS.RotateLeft ||
        key === OBLIQUE_NAVIGATION_KEYS.RotateRight ||
        (key === undefined && !seamless);
      let panPreviewState: ObliquePreviewState | undefined;
      if (
        nextInterface &&
        withPreview &&
        !rotation &&
        !seamless &&
        !step.preserveViewCenter &&
        sourceRecord
      ) {
        const sourceDataset = currentDataRef.current?.datasets.get(
          sourceRecord.seriesId
        );
        if (sourceDataset) {
          const calibration = getCameraCalibration(
            sourceDataset,
            sourceRecord.cameraId
          );
          const aspect = calibration.widthPx / calibration.heightPx;
          const shortEdge =
            2 *
            readCameraToCenterDistancePx(libreMap) *
            calibration.halfFovTan *
            Math.min(aspect, 1 / aspect);
          // Use the same image zoom as URL restoration instead of refitting
          // every neighbour to the default 0.9 viewport fraction.
          panPreviewState = {
            seriesId: step.candidate.record.seriesId,
            imageId: step.candidate.record.sourceId,
            zoom: (shortEdge /
              Math.min(
                libreMap.transform.width,
                libreMap.transform.height
              )) as Ratio,
            panX: 0 as Ratio,
            panY: 0 as Ratio,
          };
        }
      }
      if (rotation) disposeNeighborDrape();
      const simpleCentered =
        !rotation && !!step.preserveViewCenter && !navigationDrapeEnabled;
      if (
        !rotation &&
        (simpleCentered ||
          (navigationDrapeEnabled &&
            (seamless || (nextInterface && previewSeamless)))) &&
        withPreview &&
        sourceRecord
      ) {
        const sourceDataset = currentDataRef.current?.datasets.get(
          sourceRecord.seriesId
        );
        if (!sourceDataset) return;
        let drape: PhotoRotationDrapeTransition | undefined;
        if (!simpleCentered) seamlessFlightEpochRef.current = epoch;
        const succeeded = await flyTo(
          step.candidate.record,
          {
            ...dataset.animations.flyToNextImage,
            duration: Math.min(
              500,
              dataset.animations.flyToNextImage?.duration ?? 500
            ),
          },
          simpleCentered,
          true,
          anchor,
          undefined,
          undefined,
          (progress) => drape?.update(progress),
          false,
          anchor,
          {
            source: { record: sourceRecord, dataset: sourceDataset },
            prepare: async (
              frame,
              targetPose,
              targetAltitude,
              preparedView
            ) => {
              const source = await resolveDrapePhoto(sourceRecord);
              const target = {
                record: step.candidate.record,
                dataset,
                calibration: getCameraCalibration(
                  dataset,
                  step.candidate.record.cameraId
                ),
                pose: targetPose,
                altitude: targetAltitude,
              };
              if (epoch !== selectionEpochRef.current || !runningRef.current)
                return false;
              const sourceView = previewLandingView(
                libreMap,
                source,
                source.pose,
                source.altitude,
                [libreMap.transform],
                anchor
              ).view;
              if (simpleCentered) {
                drape = createPhotoPreviewCrossfade(libreMap, {
                  from: source,
                  to: target,
                  sourceView,
                  targetView: preparedView,
                  sourceProjection: () =>
                    previewLandingProjection(
                      libreMap,
                      source,
                      source.pose,
                      source.altitude,
                      libreMap.transform,
                      anchor
                    ),
                  targetProjection: () =>
                    previewLandingProjection(
                      libreMap,
                      target,
                      targetPose,
                      targetAltitude,
                      libreMap.transform,
                      anchor
                    ),
                  showBasemapLabels: previewBasemapLabels,
                  decoration: {
                    backdropLook: {
                      contrast: BACKDROP_LOOK_DEFAULT.contrast / 100,
                      brightness: BACKDROP_LOOK_DEFAULT.brightness / 100,
                      saturation: BACKDROP_LOOK_DEFAULT.saturation / 100,
                    },
                    backdropTint: previewBackdropTint(
                      source.dataset.imagePreviewStyle?.backdropColor
                    ),
                  },
                });
                rotationDrapeTransitionRef.current = {
                  transition: drape,
                  settled: false,
                  seriesIds: [
                    sourceRecord.seriesId,
                    step.candidate.record.seriesId,
                  ],
                };
                return (
                  epoch === selectionEpochRef.current && runningRef.current
                );
              }
              const neighbor = installNeighborDrape(
                source,
                target,
                sourceView,
                preparedView
              );
              if (!neighbor) return false;
              drape = createPreparedPreviewBridge(
                libreMap,
                target,
                previewLandingProjection(
                  libreMap,
                  target,
                  targetPose,
                  targetAltitude,
                  frame,
                  anchor
                ),
                previewBasemapLabels,
                preparedView,
                () =>
                  previewLandingProjection(
                    libreMap,
                    target,
                    targetPose,
                    targetAltitude,
                    libreMap.transform,
                    anchor
                  )
              );
              rotationDrapeTransitionRef.current = {
                transition: drape,
                settled: false,
                seriesIds: [
                  sourceRecord.seriesId,
                  step.candidate.record.seriesId,
                ],
              };
              return (
                !!drape &&
                epoch === selectionEpochRef.current &&
                runningRef.current
              );
            },
            activate: () => {
              if (!simpleCentered)
                neighborDrapeRef.current?.transition.handover();
              releaseHoverFlight();
              setTransitionSourceRecord(sourceRecord);
              drape?.update(0);
              selectedImageRef.current = step.candidate;
              setSelectedImage(step.candidate);
              setDimImage(true);
            },
          }
        );
        if (!simpleCentered && seamlessFlightEpochRef.current === epoch)
          seamlessFlightEpochRef.current = null;
        if (epoch !== selectionEpochRef.current || !runningRef.current) {
          drape?.dispose();
          return;
        }
        setDimImage(false);
        if (succeeded) finishRotationDrape(drape);
        else {
          drape?.dispose();
          if (neighborDrapeRef.current?.toId === step.candidate.record.id)
            disposeNeighborDrape();
          if (
            preparedLandingRef.current?.imageId === step.candidate.record.id
          ) {
            preparedLandingRef.current.release();
            preparedLandingRef.current = null;
          }
          if (rotationDrapeTransitionRef.current?.transition === drape)
            rotationDrapeTransitionRef.current = null;
        }
        setPreviewTransitionActive(false);
        return;
      }
      if (nextInterface && !withPreview && !rotation && sourceSelection) {
        setSelectedImage(step.candidate);
        selectedImageRef.current = step.candidate;
        await returnCameraToBrowsing(
          dataset.animations.flyToNextImage?.duration,
          {
            bearingDeg: libreMap.getBearing(),
            anchor,
            footprintPan: {
              from: sourceSelection.imageCenter,
              to: step.candidate.imageCenter,
            },
            easing: dataset.animations.flyToNextImage?.easingFunction,
          }
        )?.done;
        if (epoch === selectionEpochRef.current && runningRef.current)
          targetRef.current = readTarget() ?? step.target;
        return;
      }
      const drape = await prepareRotationDrape(
        sourceRecord,
        step.candidate.record,
        epoch
      );
      if (
        epoch !== selectionEpochRef.current ||
        !runningRef.current ||
        !enabledSetRef.current.has(step.candidate.record.seriesId)
      ) {
        drape?.dispose();
        if (epoch === selectionEpochRef.current) setBusy(false);
        return;
      }
      if (
        nextInterface &&
        navigationDrapeEnabled &&
        withPreview &&
        viewModeRef.current === "oblique" &&
        !drape
      ) {
        setBusy(false);
        setRuntimeError(
          "Das aktuelle Foto ist noch nicht für den Bildwechsel bereit."
        );
        return;
      }
      if (nextInterface && withPreview && viewModeRef.current === "oblique") {
        setBusy(true);
        if (
          !(await fadeOutPreviewOverlay(step.candidate.record.id, !!drape)) ||
          epoch !== selectionEpochRef.current ||
          !runningRef.current
        ) {
          if (epoch === selectionEpochRef.current) setBusy(false);
          return;
        }
      }
      releaseHoverFlight();
      selectedImageRef.current = step.candidate;
      setSelectedImage(step.candidate);
      if (!withPreview) {
        await returnCameraToBrowsing(
          (rotation
            ? dataset.animations.flyToRotatedImage
            : dataset.animations.flyToNextImage
          )?.duration,
          {
            bearingDeg: pose.bearingDeg,
            anchor,
            orbitAroundAnchor: rotation,
            easing: (rotation
              ? dataset.animations.flyToRotatedImage
              : dataset.animations.flyToNextImage
            )?.easingFunction,
            onProgress: drape?.update,
          }
        )?.done;
        finishRotationDrape(drape);
        return;
      }
      setDimImage(true);
      const succeeded = await flyTo(
        step.candidate.record,
        rotation
          ? dataset.animations.flyToRotatedImage
          : dataset.animations.flyToNextImage,
        true,
        true,
        (rotation || seamless || step.preserveViewCenter) && nextInterface
          ? anchor
          : undefined,
        step.fitNextImage || !nextInterface ? true : undefined,
        panPreviewState,
        drape?.update,
        rotation,
        seamless || step.preserveViewCenter ? anchor : undefined
      );
      if (epoch !== selectionEpochRef.current || !runningRef.current) return;
      setDimImage(false);
      finishRotationDrape(drape);
      if (succeeded) setPreviewTransitionActive(false);
      else {
        publish({ previewVisible: false });
        void settleToBrowsing();
      }
    },
    [
      libreMap,
      releaseHoverFlight,
      nextInterface,
      fadeOutPreviewOverlay,
      navigationDrapeEnabled,
      mosaicActive,
      previewSeamless,
      previewBasemapLabels,
      resolveDrapePhoto,
      installNeighborDrape,
      disposeNeighborDrape,
      rememberDirection,
      rememberRotation,
      prefetchNavigationLookAhead,
      cancelRotationDrape,
      prepareRotationDrape,
      finishRotationDrape,
      setBusy,
      flyTo,
      readTarget,
      returnCameraToBrowsing,
      publish,
      settleToBrowsing,
    ]
  );
  const readSeamlessImagePoint = useCallback(
    async (record: ObliqueImageRecord, target: ObliqueGroundTarget) => {
      const dataset = currentDataRef.current?.datasets.get(record.seriesId);
      if (
        !dataset ||
        target.heightMeters === undefined ||
        !Number.isFinite(target.heightMeters)
      )
        return null;
      const calibration = getCameraCalibration(dataset, record.cameraId);
      const pose = poseOf(record, dataset);
      const altitude = await resolveCameraAltitude(
        record,
        dataset.heightDatum,
        heightOffset,
        dataset.allowUnverifiedSourceHeight
      );
      const projector = imageProjectionMatrix(
        record,
        calibration,
        pose,
        sceneToPhotoEnu(
          [target.longitude, target.latitude],
          new Matrix4(),
          pose,
          altitude
        )
      );
      const pixel = projectObjectCoveragePoint(
        projector,
        new Vector3(0, target.heightMeters, 0),
        calibration
      );
      return pixel
        ? {
            x: pixel.x / calibration.widthPx,
            y: 1 - pixel.y / calibration.heightPx,
          }
        : null;
    },
    [heightOffset]
  );
  const readSeamlessTarget = useCallback(
    (fallback?: ObliqueGroundTarget): ObliqueGroundTarget | null => {
      if (!libreMap) return null;
      const cached =
        previewAlignmentAnchorRef.current ?? targetRef.current ?? fallback;
      if (!cached) return null;
      const anchor = MercatorCoordinate.fromLngLat(
        { lng: cached.longitude, lat: cached.latitude },
        cached.heightMeters ?? libreMap.getCenterElevation()
      );
      // Intersect the current centre ray with the cached local ground plane;
      // This cheap anchor tracks drag start; readSeamlessView resolves the
      // shared visible-surface target and candidate reference points separately.
      const point = viewportCenterPlaneAnchor(
        new Matrix4().fromArray(
          libreMap.transform.getProjectionDataForCustomLayer(true).mainMatrix
        ),
        new Vector3(anchor.x, anchor.y, anchor.z),
        new Vector3(0, 0, 1)
      );
      const coordinate = new MercatorCoordinate(point.x, point.y, point.z);
      const location = coordinate.toLngLat();
      return {
        longitude: location.lng,
        latitude: location.lat,
        heightMeters: coordinate.toAltitude(),
        heightDatum: "dhhn2016",
      };
    },
    [libreMap]
  );
  const readSeamlessViewKey = useCallback(
    () =>
      libreMap
        ? Array.from(
            libreMap.transform.getProjectionDataForCustomLayer(true).mainMatrix
          ).join(",")
        : "",
    [libreMap]
  );
  const readSeamlessView =
    useCallback(async (): Promise<SeamlessPreviewView | null> => {
      const record = selectedImageRef.current?.record;
      if (!libreMap || !record || !referencePoints || busyRef.current)
        return null;
      const epoch = selectionEpochRef.current;
      const viewKey = readSeamlessViewKey();
      // One common visible-surface point for every candidate. Explicit screen
      // coordinates reuse the current scene matrices without traversing them.
      const anchor = readViewAnchor(
        { x: libreMap.transform.width / 2, y: libreMap.transform.height / 2 },
        rotationSurface,
        true
      );
      if (!anchor) return null;
      const location = anchor.toLngLat();
      const target = await physicalImageQueryTarget({
        longitude: location.lng,
        latitude: location.lat,
        heightMeters: anchor.toAltitude(),
        heightDatum: "dhhn2016",
      });
      const reference = await resolveReferencePoint(
        record,
        previewSeamlessCenterY,
        rotationSurface
      );
      if (
        selectedImageRef.current?.record.id !== record.id ||
        selectionEpochRef.current !== epoch
      )
        return null;
      return {
        imageId: record.id,
        sector: record.sector,
        target,
        epoch,
        viewKey,
        imagePoint: await readSeamlessImagePoint(record, target),
        referenceDistanceMeters: photoReferenceDistanceMeters(
          reference,
          target
        ),
      };
    }, [
      libreMap,
      referencePoints,
      resolveReferencePoint,
      readViewAnchor,
      readSeamlessViewKey,
      readSeamlessImagePoint,
      previewSeamlessCenterY,
      rotationSurface,
    ]);
  const centerDebugCandidatesRef = useRef<readonly ObliqueImageRecord[]>([]);
  const seamlessVisibleRecordsRef = useRef(visibleFootprints);
  seamlessVisibleRecordsRef.current = visibleFootprints;
  const findSeamlessCandidates = useCallback(
    async (view: SeamlessPreviewView, panStart?: ObliqueGroundTarget) => {
      const record = selectedImageRef.current?.record;
      const dataset =
        record && currentDataRef.current?.datasets.get(record.seriesId);
      if (!record || !dataset || record.id !== view.imageId) return [];
      const pose = poseOf(record, dataset);
      const headingRad = degToRad(pose.bearingDeg) as Radians;
      const [candidates] = await computeNavigation([
        {
          direction: view.sector,
          headingRad,
          pitchRad: degToRad(pose.pitchDeg),
          cameraView: "oblique",
          target: view.target,
          excludeImageId: view.imageId,
          numCandidates: 128,
        },
      ]);
      // Catalogue centres provide the broad spatial shortlist. The actual
      // handover metric uses each candidate's adjustable surface intersection.
      // Include visible neighbours before applying that metric across series.
      const currentData = currentDataRef.current;
      const local = currentData
        ? rankImagesForView(
            currentData,
            {
              headingRad,
              pitchRad: degToRad(pose.pitchDeg),
              target: view.target,
              excludeImageId: view.imageId,
              numCandidates: 128,
              enabledSeriesIds: [...enabledSetRef.current],
            },
            seamlessVisibleRecordsRef.current
              .filter((item) => item.sector === view.sector)
              .slice(0, 128)
          )
        : [];
      const neighbourhood = [
        ...new Map(
          [...(candidates ?? []), ...local].map((candidate) => [
            candidate.record.id,
            candidate,
          ])
        ).values(),
      ].slice(0, 128);
      if (
        selectedImageRef.current?.record.id === view.imageId &&
        selectionEpochRef.current === view.epoch
      )
        centerDebugCandidatesRef.current = neighbourhood.map(
          (candidate) => candidate.record
        );
      const startTarget = panStart
        ? await physicalImageQueryTarget(panStart)
        : null;
      return Promise.all(
        neighbourhood
          .filter((candidate) => {
            const source = previewThumbnailSource(candidate.record);
            return (
              candidate.record.sector === view.sector &&
              candidate.record.id !== view.imageId &&
              enabledSetRef.current.has(candidate.record.seriesId) &&
              source &&
              !isPreviewSourceMissing(source)
            );
          })
          .map(async (candidate) => {
            const imagePoint = await readSeamlessImagePoint(
              candidate.record,
              view.target
            );
            const coversTarget =
              imagePoint !== null &&
              imagePoint.x >= 0 &&
              imagePoint.x <= 1 &&
              imagePoint.y >= 0 &&
              imagePoint.y <= 1;
            // A candidate outside calibrated coverage cannot take over; avoid
            // queuing its surface query behind the useful neighbours.
            const reference = coversTarget
              ? await resolveReferencePoint(
                  candidate.record,
                  previewSeamlessCenterY,
                  rotationSurface
                )
              : null;
            const nowDistance = photoReferenceDistanceMeters(
              reference ?? null,
              view.target
            );
            const startDistance = startTarget
              ? photoReferenceDistanceMeters(reference ?? null, startTarget)
              : null;
            return {
              step: {
                candidate: { ...candidate, coversTarget },
                target: view.target,
                headingRad,
                originImageId: view.imageId,
                fitNextImage: false,
              },
              imagePoint,
              referenceDistanceMeters: nowDistance,
              approaching:
                nowDistance !== null &&
                startDistance !== null &&
                nowDistance < startDistance,
            };
          })
      );
    },
    [
      computeNavigation,
      previewThumbnailSource,
      readSeamlessImagePoint,
      previewSeamlessCenterY,
      resolveReferencePoint,
      rotationSurface,
    ]
  );
  const prepareSeamlessNeighbor = useCallback(
    async (
      view: SeamlessPreviewView,
      candidate: { step: PreparedObliqueNavigationTarget },
      signal: AbortSignal
    ) => {
      const from = selectedImageRef.current?.record;
      if (!libreMap || !from || from.id !== view.imageId || signal.aborted)
        return;
      const [source, target] = await Promise.all([
        resolveDrapePhoto(from),
        resolveDrapePhoto(candidate.step.candidate.record),
      ]);
      if (
        signal.aborted ||
        selectedImageRef.current?.record.id !== view.imageId
      )
        return;
      const anchor = MercatorCoordinate.fromLngLat(
        { lng: view.target.longitude, lat: view.target.latitude },
        view.target.heightMeters ?? libreMap.getCenterElevation()
      );
      const frame = libreMap.transform.clone();
      const sourceView = previewLandingView(
        libreMap,
        source,
        source.pose,
        source.altitude,
        [frame],
        anchor
      ).view;
      const targetView = previewLandingView(
        libreMap,
        target,
        target.pose,
        target.altitude,
        [frame],
        anchor
      ).view;
      const previous = neighborDrapeRef.current;
      const covers = (cached: ImageView, needed: ImageView) =>
        cached.density >= needed.density &&
        cached.visible.x <= needed.visible.x &&
        cached.visible.y <= needed.visible.y &&
        cached.visible.x + cached.visible.width >=
          needed.visible.x + needed.visible.width &&
        cached.visible.y + cached.visible.height >=
          needed.visible.y + needed.visible.height;
      if (
        previous?.fromId === from.id &&
        previous.toId === target.record.id &&
        covers(previous.sourceView, sourceView) &&
        covers(previous.targetView, targetView)
      )
        return;
      const prepared = await preparePreviewLanding(
        libreMap,
        target,
        target.pose,
        target.altitude,
        frame,
        anchor,
        signal,
        source,
        undefined,
        true,
        true
      );
      try {
        if (
          signal.aborted ||
          selectedImageRef.current?.record.id !== view.imageId ||
          view.epoch !== selectionEpochRef.current
        )
          return;
        const sourceView = previewLandingView(
          libreMap,
          source,
          source.pose,
          source.altitude,
          [libreMap.transform],
          anchor
        ).view;
        installNeighborDrape(source, target, sourceView, prepared.view);
      } finally {
        prepared();
      }
    },
    [libreMap, resolveDrapePhoto, installNeighborDrape]
  );
  const seamlessNavigation = useSeamlessPreviewNavigation({
    continuousHandover: previewSeamlessMode === "handover",
    enabled:
      nextInterface &&
      previewSeamless &&
      running &&
      previewCameraActive &&
      viewMode === "oblique",
    busyRef,
    centerY: previewSeamlessCenterY,
    selectionKey: `${selectedImage?.record.id ?? ""}:${
      selectionEpochRef.current
    }`,
    readTarget: readSeamlessTarget,
    readView: readSeamlessView,
    findCandidates: findSeamlessCandidates,
    prepareCandidate: navigationDrapeEnabled
      ? prepareSeamlessNeighbor
      : undefined,
    isSelectionCurrent: (view) => {
      if (
        !libreMap ||
        !runningRef.current ||
        !previewVisibleRef.current ||
        viewModeRef.current !== "oblique" ||
        selectionEpochRef.current !== view.epoch ||
        selectedImageRef.current?.record.id !== view.imageId
      )
        return false;
      return true;
    },
    isCurrent: (view) => {
      if (
        !libreMap ||
        !runningRef.current ||
        !previewVisibleRef.current ||
        viewModeRef.current !== "oblique" ||
        selectionEpochRef.current !== view.epoch ||
        selectedImageRef.current?.record.id !== view.imageId
      )
        return false;
      if (view.viewKey) return view.viewKey === readSeamlessViewKey();
      const target = readSeamlessTarget();
      return (
        !!target &&
        groundDistanceM(
          { lng: target.longitude, lat: target.latitude },
          { lng: view.target.longitude, lat: view.target.latitude }
        ) < 0.5
      );
    },
    navigate: (step) => navigatePrepared(step, undefined, false, "seamless"),
  });
  seamlessPanRef.current = seamlessNavigation;
  useEffect(() => {
    if (!isBusy && previewOutlineReadyImageId === selectedImageId)
      seamlessNavigation.refreshPreparation();
  }, [
    isBusy,
    selectedImageId,
    previewOutlineReadyImageId,
    visibleFootprints,
    previewSeamless,
    previewSeamlessCenterY,
    seamlessNavigation.refreshPreparation,
  ]);
  const previewDebugMappingRef = useRef<ScenePreviewImageMapping | null>(null);
  const onPreviewImageMapping = useCallback(
    (mapping: ScenePreviewImageMapping | null) => {
      previewDebugMappingRef.current = mapping;
    },
    []
  );
  const readCenterDebugPlane = useCallback(
    () => (previewVisibleRef.current ? previewDebugMappingRef.current : null),
    []
  );
  const readCenterDebugPointer = readCatalogReferenceTarget;
  const readCenterDebugTarget = useCallback(
    () => readCatalogReferenceTarget(),
    [readCatalogReferenceTarget]
  );
  const readCenterReferenceHeight = useCallback(
    (record: ObliqueImageRecord) =>
      currentDataRef.current?.datasets.get(record.seriesId)
        ?.referenceGroundHeightMeters ?? 0,
    []
  );
  const intersectCenterDebugSurface = useCallback(
    (ray: Raycaster, eye: [number, number], mode: PhotoAxisSurfaceMode) =>
      axisPicker?.intersectSurface(ray, eye, mode) ?? null,
    [axisPicker]
  );
  const readCenterDebugRecords = useCallback(() => {
    const selected = selectedImageRef.current?.record;
    return [
      ...(selected ? [selected] : []),
      ...readHoverCandidates(),
      ...centerDebugCandidatesRef.current,
      ...visibleFootprints,
    ].filter(
      (record) =>
        enabledSetRef.current.has(record.seriesId) &&
        (!selected || record.sector === selected.sector)
    );
  }, [visibleFootprints, enabledSet, selectedImageId, readHoverCandidates]);
  useImageCenterDebug({
    map: libreMap,
    enabled:
      running &&
      nextInterface &&
      previewCenterDebug &&
      (previewOpticalCenterDebug || previewScreenCenterDebug) &&
      viewMode === "oblique",
    readRecords: readCenterDebugRecords,
    selectedId: selectedImageId,
    centerY: previewSeamlessCenterY,
    showOpticalCenters: previewOpticalCenterDebug,
    showScreenCenters: previewScreenCenterDebug,
    surfaceMode: rotationSurface,
    resolvePhoto: resolveDrapePhoto,
    readReferenceHeight: readCenterReferenceHeight,
    readTarget: readCenterDebugTarget,
    readPointerTarget: readCenterDebugPointer,
    readPlaneMapping: readCenterDebugPlane,
    intersectSurface: intersectCenterDebugSurface,
    resolveReferencePoint,
    readReferenceRevision,
  });

  const readMosaicRecords = useCallback(() => {
    const selected = selectedImageRef.current?.record;
    const sector = getCardinalDirectionFromHeading(
      degreesToRadians((libreMap?.getBearing() ?? 0) as Degrees)
    );
    const seriesId = activeMosaicSeriesId;
    const seen = new Set<string>();
    return [...(selected ? [selected] : []), ...mosaicRecords].filter(
      (record) => {
        if (
          seen.has(record.id) ||
          !enabledSetRef.current.has(record.seriesId) ||
          missingImagesRef.current.has(record.id) ||
          record.sector !== sector ||
          record.seriesId !== seriesId
        )
          return false;
        seen.add(record.id);
        return true;
      }
    );
  }, [
    mosaicRecords,
    libreMap,
    activeMosaicSeriesId,
    enabledSet,
    missingImages,
    selectedImageId,
  ]);
  const mosaicStatus = usePhotoMosaic({
    map: libreMap,
    debug: previewCenterDebug,
    enabled: mosaicActive,
    centerY: previewSeamlessCenterY,
    groupKey: `${activeMosaicSeriesId ?? ""}:${getCardinalDirectionFromHeading(
      degreesToRadians((libreMap?.getBearing() ?? 0) as Degrees)
    )}`,
    readRecords: readMosaicRecords,
    resolvePhoto: resolveDrapePhoto,
    intersectSurface: (ray, eye) =>
      axisPicker?.intersectSurface(ray, eye, "auto") ?? null,
  });
  useEffect(() => {
    if (!mosaicActive) return;
    setDrapeTargetLoading(mosaicStatus.loading);
  }, [mosaicActive, mosaicStatus.loading, setDrapeTargetLoading]);
  useEffect(() => {
    if (mosaicActive) return () => setDrapeTargetLoading(false);
  }, [mosaicActive, setDrapeTargetLoading]);
  const mosaicEnteredRef = useRef(false);
  useEffect(() => {
    if (!mosaicActive) {
      mosaicEnteredRef.current = false;
      return;
    }
    // A mode change owns its camera flight until arrival. Cancelling it here
    // would preserve Nadir's zero-pitch lock when returning to oblique mosaic.
    if (mosaicEnteredRef.current || isBusy || phase !== "active") return;
    mosaicEnteredRef.current = true;
    setMosaicSeriesId((previous) =>
      previous && enabledSetRef.current.has(previous)
        ? previous
        : selectedImageRef.current?.record.seriesId ??
          browsingDataset?.id ??
          null
    );
    cancelNavigationRef.current();
    activeFlightRef.current?.cancel();
    activeFlightRef.current = null;
    cancelToggleCameraTween();
    releaseHoverFlight();
    disposeNeighborDrape();
    navigationSelectionHeldRef.current = false;
    setBusy(false);
    setDimImage(false);
    setPreviewTransitionActive(false);
    // Recover a previously persisted mosaic session that skipped oblique entry.
    // Explicit Nadir is excluded by mosaicActive, so its top-down view is kept.
    if (libreMap && Math.abs(libreMap.getPitch()) < 0.001)
      returnCameraToBrowsing(initialPreviewRef.current ? 0 : 250);
  }, [
    mosaicActive,
    isBusy,
    phase,
    libreMap,
    returnCameraToBrowsing,
    cancelToggleCameraTween,
    releaseHoverFlight,
    disposeNeighborDrape,
    setBusy,
  ]);

  const orbitUnlockedCamera = useCallback(
    async (
      direction: { clockwise: boolean } | { cardinal: CardinalDirection }
    ) => {
      if (
        !libreMap ||
        !runningRef.current ||
        previewVisibleRef.current ||
        hoverSelectionRef.current ||
        viewModeRef.current === "objectCoverage"
      )
        return;
      const headings = alignmentHeadingsRef.current;
      const heading =
        "cardinal" in direction
          ? headings[direction.cardinal]
          : nextSeriesCardinalHeading(
              degreesToRadians(libreMap.getBearing() as Degrees),
              headings,
              direction.clockwise
            );
      const anchor =
        readViewAnchor(undefined, rotationSurface) ??
        readViewAnchor(undefined, "auto");
      if (!anchor) return;
      navigationSelectionHeldRef.current = false;
      releaseHoverFlight();
      const animation = alignmentSeriesRef.current.animations.rotateCamera;
      const flight = returnCameraToBrowsing(animation?.duration ?? 1800, {
        bearingDeg: radToDeg(heading),
        anchor,
        orbitAroundAnchor: true,
        easing: animation?.easingFunction,
      });
      await flight?.done;
    },
    [
      libreMap,
      readViewAnchor,
      rotationSurface,
      releaseHoverFlight,
      returnCameraToBrowsing,
    ]
  );
  const requestNavigation = useCallback(
    (key: ObliqueNavigationKey) => {
      const rotation =
        key === OBLIQUE_NAVIGATION_KEYS.RotateLeft ||
        key === OBLIQUE_NAVIGATION_KEYS.RotateRight;
      if (
        nextInterface &&
        rotation &&
        !previewVisibleRef.current &&
        !hoverSelectionRef.current
      ) {
        void requestNavigationAction(() =>
          orbitUnlockedCamera({
            clockwise: key === OBLIQUE_NAVIGATION_KEYS.RotateRight,
          })
        );
        return;
      }
      void requestNavigationTarget(key, (target) =>
        navigatePrepared(target, key)
      );
    },
    [
      nextInterface,
      requestNavigationAction,
      orbitUnlockedCamera,
      requestNavigationTarget,
      navigatePrepared,
    ]
  );
  const requestNadir = useCallback(() => {
    void requestNavigationAction(() =>
      switchViewMode(viewModeRef.current === "nadir" ? "oblique" : "nadir")
    );
  }, [switchViewMode, requestNavigationAction]);
  const requestPan = useCallback(
    (horizontal: number, vertical: number) => {
      if (!Number.isFinite(horizontal) || !Number.isFinite(vertical)) return;
      const key =
        horizontal < 0
          ? OBLIQUE_NAVIGATION_KEYS.Left
          : horizontal > 0
          ? OBLIQUE_NAVIGATION_KEYS.Right
          : vertical > 0
          ? OBLIQUE_NAVIGATION_KEYS.Up
          : vertical < 0
          ? OBLIQUE_NAVIGATION_KEYS.Down
          : null;
      if (key) requestNavigation(key);
    },
    [requestNavigation]
  );
  useObliqueDirectionKeybindings({
    enabled: browsing && viewMode !== "objectCoverage",
    rotationEnabled:
      (nextInterface && !previewVisible && enabledSeries.length > 0) ||
      isCatalogComplete,
    onNavigate: requestNavigation,
    onNadir:
      nextInterface &&
      enabledSeries.some((series) =>
        series.availableCameraViews?.includes("nadir")
      )
        ? requestNadir
        : undefined,
  });

  const orbitToBearing = useCallback(
    async (bearingDeg: number, pitchDeg?: number) => {
      navigationSelectionHeldRef.current = false;
      if (
        !libreMap ||
        viewModeRef.current === "objectCoverage" ||
        busyRef.current ||
        !Number.isFinite(bearingDeg) ||
        (pitchDeg !== undefined && !Number.isFinite(pitchDeg))
      )
        return;
      const anchor = readViewAnchor();
      const lngLat = anchor?.toLngLat();
      const target: ObliqueGroundTarget | null =
        anchor && lngLat
          ? {
              longitude: lngLat.lng,
              latitude: lngLat.lat,
              heightMeters: anchor.toAltitude(),
              heightDatum: "dhhn2016",
            }
          : readTarget();
      if (!target) return;
      await chooseRequestedView(
        degToRad(bearingDeg),
        target,
        selectedDataset.animations.flyToRotatedImage,
        pitchDeg === undefined ? undefined : degToRad(pitchDeg),
        true,
        anchor
      );
    },
    [libreMap, readTarget, readViewAnchor, chooseRequestedView, selectedDataset]
  );

  const flyToCatalogImage = useCallback(
    async (id: string) => {
      const record = data?.imageRecords.get(id);
      if (!record || !runningRef.current) return false;
      const dataset = data?.datasets.get(record.seriesId);
      const mode =
        dataset?.cameras[record.cameraId]?.view === "nadir"
          ? "nadir"
          : "oblique";
      if (viewModeRef.current !== mode) await switchViewMode(mode, false);
      return openPreview(id, "whole-image", undefined, true, false);
    },
    [data, openPreview, switchViewMode]
  );
  const flyToCatalogExtent = useCallback(
    async (ids: readonly string[]) => {
      if (!data || !libreMap || !runningRef.current || !ids.length)
        return false;
      const filterKey = catalogFilterKeyRef.current;
      const previousEpoch = selectionEpochRef.current;
      const bounds = await catalogImageExtent(data, ids);
      if (
        !bounds ||
        !runningRef.current ||
        filterKey !== catalogFilterKeyRef.current ||
        previousEpoch !== selectionEpochRef.current
      )
        return false;
      cancelNavigationRef.current();
      activeFlightRef.current?.cancel();
      activeFlightRef.current = null;
      const epoch = ++selectionEpochRef.current;
      previewVisibleRef.current = false;
      publish({ previewVisible: false });
      await settleToBrowsing();
      if (
        !runningRef.current ||
        epoch !== selectionEpochRef.current ||
        filterKey !== catalogFilterKeyRef.current
      )
        return false;
      // The group overview is top-down. Ordinary NG pitch reconciliation must not
      // interrupt MapLibre's bounds flight after leaving the selected photo.
      freeCamera();
      libreMap.fitBounds(
        [
          [bounds[0], bounds[1]],
          [bounds[2], bounds[3]],
        ],
        {
          padding: 80 as CssPixels,
          maxZoom: getBrowsingMaxZoom(),
          duration: 900,
          pitch: 0,
          bearing: libreMap.getBearing(),
        }
      );
      return true;
    },
    [data, libreMap, publish, settleToBrowsing, getBrowsingMaxZoom, freeCamera]
  );
  const handledRequestRef = useRef(0);
  useEffect(() => {
    if (
      nextInterface &&
      running &&
      request?.type === "browseCatalog" &&
      request.seq !== handledRequestRef.current
    ) {
      handledRequestRef.current = request.seq;
      clearRequest(request.seq);
      if (request.seriesId && enabledSetRef.current.has(request.seriesId)) {
        const seriesId = request.seriesId;
        setCatalogFilter((previous) => ({ ...previous, series: [seriesId] }));
      }
      setCatalogBrowserOpen(true);
      return;
    }
    if (
      !request ||
      request.seq === handledRequestRef.current ||
      !browsing ||
      ((isBusy || busyRef.current) &&
        request.type !== "leavePreviewForNavigation" &&
        request.type !== "pan" &&
        request.type !== "rotate" &&
        request.type !== "rotateTo" &&
        request.type !== "flyToImage" &&
        request.type !== "closePreview" &&
        request.type !== "setViewMode")
    )
      return;
    handledRequestRef.current = request.seq;
    clearRequest(request.seq);
    if (
      viewModeRef.current === "objectCoverage" &&
      request.type !== "setViewMode" &&
      request.type !== "leavePreviewForNavigation"
    )
      return;
    if (request.type === "leavePreviewForNavigation") {
      cancelNavigationRef.current();
      if (viewModeRef.current === "objectCoverage") {
        extensionController.current?.reset();
        viewModeRef.current = "oblique";
        setViewMode("oblique");
        publish({ viewMode: "oblique" });
      }
      const epoch = ++selectionEpochRef.current;
      previewVisibleRef.current = false;
      publish({ previewVisible: false });
      setRuntimeError(null);
      const flight = returnCameraToBrowsing();
      void (flight?.done ?? Promise.resolve()).then(() => {
        if (epoch === selectionEpochRef.current && runningRef.current)
          request.onComplete();
      });
      return;
    }
    switch (request.type) {
      case "setViewMode":
        if (
          request.mode === "objectCoverage" ||
          viewModeRef.current === "objectCoverage"
        ) {
          cancelNavigationRef.current();
          trackViewModeRequest(request.mode, switchViewMode(request.mode));
        } else void requestNavigationAction(() => switchViewMode(request.mode));
        break;
      case "orbit":
        void orbitToBearing(request.bearingDeg, request.pitchDeg);
        break;
      case "rotate": {
        const key = request.clockwise
          ? OBLIQUE_NAVIGATION_KEYS.RotateRight
          : OBLIQUE_NAVIGATION_KEYS.RotateLeft;
        requestNavigation(key);
        break;
      }
      case "rotateTo":
        if (
          nextInterface &&
          !previewVisibleRef.current &&
          !hoverSelectionRef.current
        ) {
          void requestNavigationAction(() =>
            orbitUnlockedCamera({ cardinal: request.direction })
          );
          break;
        }
        void requestNavigationAction(async () => {
          const step = getCardinalNavigationTarget(request.direction);
          if (!step) return;
          const switching = viewModeRef.current === "nadir";
          if (switching) {
            selectionEpochRef.current++;
            activeFlightRef.current?.cancel();
            activeFlightRef.current = null;
            setBusy(false);
            await switchViewMode("oblique", false);
            previewVisibleRef.current = false;
          }
          await navigatePrepared(step, undefined, switching);
        }, true);
        break;
      case "pan":
        requestPan(request.horizontal, request.vertical);
        break;
      case "flyToImage":
        if (previewVisibleRef.current) closePreview();
        else void openPreview(selectedImageRef.current?.record.id);
        break;
      case "closePreview":
        closePreview();
        break;
    }
  }, [
    request,
    browsing,
    isBusy,
    clearRequest,
    orbitToBearing,
    orbitUnlockedCamera,
    navigatePrepared,
    requestNavigation,
    requestNavigationAction,
    getCardinalNavigationTarget,
    switchViewMode,
    trackViewModeRequest,
    libreMap,
    requestPan,
    closePreview,
    openPreview,
    returnCameraToBrowsing,
  ]);

  // Disabling a series cancels its pending flights and cannot leave its image on screen.
  useEffect(() => {
    if (enabledSeriesIds !== null) {
      const configuredIds = new Set(
        configuredSeries.map((series) => series.id)
      );
      const validIds = enabledSeriesIds.filter((id) => configuredIds.has(id));
      if (validIds.length !== enabledSeriesIds.length)
        setEnabledSeriesIds(validIds);
    }
  }, [configuredSeries, enabledSeriesIds, setEnabledSeriesIds]);
  useEffect(() => {
    cancelNavigationRef.current();
    selectionEpochRef.current += 1;
    if (running && !previewTransitionActive) {
      activeFlightRef.current?.cancel();
      activeFlightRef.current = null;
    }
    if (running && !previewTransitionActive) setBusy(false);
    setRuntimeError(null);
    const current = selectedImageRef.current?.record;
    if (!running || (current && !enabledSetRef.current.has(current.seriesId))) {
      const wasPreview = previewVisibleRef.current;
      setSelectedImage(null);
      setDimImage(false);
      publish({ previewVisible: false });
      if (running && wasPreview) void settleToBrowsing();
    }
  }, [enabledToken, configuredSeries, running, publish, setBusy]);
  useEffect(() => {
    if (
      selectedRecord &&
      (!data || !data.imageRecords.has(selectedRecord.id))
    ) {
      const wasPreview = previewVisibleRef.current;
      setSelectedImage(null);
      publish({ previewVisible: false });
      setDimImage(false);
      if (runningRef.current && wasPreview) void settleToBrowsing();
    }
  }, [selectedRecord, data, publish, settleToBrowsing]);
  useEffect(
    () => () => {
      runningRef.current = false;
      cancelNavigationRef.current();
      activeFlightRef.current?.cancel();
    },
    []
  );
  useEffect(() => {
    if (!libreMap) return undefined;
    const reportOrientation = () => {
      // Intermediate orbit poses belong to the render loop. Publishing them
      // through the addon context rerenders the entire layer/toolbar tree.
      // Read the final pose when busy settles; the map compass stays live.
      if (!runningRef.current || (nextInterface && busyRef.current)) return;
      const bearing = Math.round(
        radToDeg(
          zeroToTwoPi(degreesToRadians(libreMap.getBearing() as Degrees))
        )
      );
      publish({
        bearingDeg: (bearing === 360 ? 0 : bearing) as Degrees,
        pitchDeg: Math.round(libreMap.getPitch()) as Degrees,
      });
    };
    reportOrientation();
    let pendingGesture = false;
    const onGestureStart = (event: { originalEvent?: Event }) => {
      if (event.originalEvent) {
        cancelNavigationRef.current();
        navigationSelectionHeldRef.current = false;
        activeFlightRef.current?.cancel();
        activeFlightRef.current = null;
        setPreviewTransitionActive(false);
        setDimImage(false);
        setBusy(false);
      }
      if (
        !mosaicActive &&
        event.originalEvent &&
        previewVisibleRef.current &&
        !busyRef.current
      ) {
        pendingGesture = true;
        setDimImage(true);
      }
    };
    const onGestureEnd = (event: { obliqueFov?: boolean }) => {
      reportOrientation();
      if (
        mosaicActive ||
        !pendingGesture ||
        event.obliqueFov ||
        busyRef.current
      )
        return;
      pendingGesture = false;
      if (!runningRef.current || !previewVisibleRef.current) return;
      const target = readTarget();
      if (target)
        void chooseRequestedView(
          degToRad(libreMap.getBearing()),
          target,
          selectedDataset.animations.flyToRotatedImage,
          degToRad(libreMap.getPitch()),
          true
        );
    };
    libreMap.on("rotate", reportOrientation);
    libreMap.on("pitch", reportOrientation);
    libreMap.on("movestart", onGestureStart);
    libreMap.on("moveend", onGestureEnd);
    return () => {
      libreMap.off("rotate", reportOrientation);
      libreMap.off("pitch", reportOrientation);
      libreMap.off("movestart", onGestureStart);
      libreMap.off("moveend", onGestureEnd);
    };
  }, [
    libreMap,
    mosaicActive,
    readTarget,
    chooseRequestedView,
    selectedDataset,
    running,
    nextInterface,
    isBusy,
    publish,
    setBusy,
  ]);
  const onPreviewError = useCallback(
    (imageId: string, details?: { message: string; missing: boolean }) => {
      const record = selectedRecord;
      if (
        !record ||
        imageId !== record.sourceId ||
        selectedImageRef.current?.record.id !== record.id
      )
        return;
      cancelTransitionBackdrop();
      if (details?.missing) {
        const source = previewThumbnailSource(record);
        if (source) {
          watchPreviewAvailability(record);
          reportPreviewSourceMissing(source);
        }
        setPreviewOutlineReadyImageId(null);
        setRuntimeError(null);
        return;
      }
      setRuntimeError(
        details?.message ??
          "Das Vorschaubild ist noch nicht verfügbar oder konnte nicht geladen werden."
      );
    },
    [
      selectedRecord,
      previewThumbnailSource,
      watchPreviewAvailability,
      cancelTransitionBackdrop,
    ]
  );
  useEffect(() => {
    if (!previewVisible) prefetchPreviewThumbnail(null);
  }, [previewVisible]);
  if (!libreMap) return null;
  const extension = getObliqueViewerExtension(
    extensions,
    nextInterface,
    viewMode
  );
  const Extension = extension?.Component;
  return (
    <>
      {running && nextInterface && catalogBrowserOpen && (
        <Suspense fallback={null}>
          <ObliqueCatalogBrowser
            open={catalogBrowserOpen}
            onClose={() => setCatalogBrowserOpen(false)}
            catalog={catalogData}
            eligible={data}
            filter={catalogFilter}
            onFilterChange={setCatalogFilter}
            onFlyToImage={flyToCatalogImage}
            onFlyToExtent={flyToCatalogExtent}
            onLoadAll={() => awaitAll({ includeNadir: true })}
            loading={isLoading}
            complete={isCatalogComplete}
            busy={isBusy || catalogFilter !== deferredCatalogFilter}
          />
        </Suspense>
      )}
      {running && nextInterface && previewCenterDebug && previewPoolDebug && (
        <ObliqueOverlay map={libreMap} aboveControls>
          <ObliquePoolDebug
            pool={nativePixelPool}
            onClose={() => publish({ previewPoolDebug: false })}
          />
        </ObliqueOverlay>
      )}
      {running && (
        <ObliqueOverlay map={libreMap}>
          {isDebugMode && axisPicker && (
            <Suspense fallback={null}>
              <ObliqueDebug
                picker={axisPicker}
                surfaceMode={pointIntersectionSurface}
                onSurfaceModeChange={setPointIntersectionSurface}
              />
            </Suspense>
          )}
          {mosaicActive && previewCenterDebug && mosaicStatus.message && (
            <div
              role="status"
              style={{
                position: "absolute",
                left: 12,
                bottom: 12,
                maxWidth: "70%",
                padding: "4px 8px",
                background: "rgba(255,255,255,.9)",
                color: "#333",
                fontSize: 11,
                pointerEvents: "none",
              }}
            >
              {mosaicStatus.message}
            </div>
          )}
          {!mosaicActive &&
            previewVisible &&
            selectedRecord &&
            enabledSet.has(selectedRecord.seriesId) &&
            selectedCalibration && (
              <ObliqueImagePreview
                onImageMapping={
                  nextInterface && previewCenterDebug
                    ? onPreviewImageMapping
                    : undefined
                }
                key={selectedRecord.id}
                map={libreMap}
                photo={previewPhoto}
                onRootChange={setPreviewRoot}
                onOutlineReady={onPreviewOutlineReady}
                onDisplayReady={() => onPreviewDisplayReady(selectedRecord.id)}
                previewPath={selectedDataset.previewPath}
                avifOnly={selectedDataset.avifOnly}
                originalImageUrlTemplate={
                  selectedDataset.originalImageUrlTemplate
                }
                originalImageUrl={selectedRecord.assets?.original?.href}
                {...pyramidOptionsOf({
                  record: selectedRecord,
                  dataset: selectedDataset,
                })}
                nativePixelSize={{
                  width: selectedCalibration.widthPx as DevicePixels,
                  height: selectedCalibration.heightPx as DevicePixels,
                }}
                imageId={selectedRecord.sourceId}
                qualityLevel={previewQualityLevel}
                minimumQualityLevel={selectedDataset.minimumPreviewQualityLevel}
                halfFovTan={selectedCalibration.halfFovTan}
                dimImage={dimImage}
                opacityRef={
                  nextInterface ? previewTransitionOpacity : undefined
                }
                seamless={nextInterface && previewSeamless}
                transitioning={transitionBackdropActive}
                panEnabled={nextInterface && viewMode !== "objectCoverage"}
                showBasemapLabels={!nextInterface || previewBasemapLabels}
                rollDeg={rollDeg}
                interiorOrientationOffsets={principalOffset}
                style={selectedDataset.imagePreviewStyle}
                backdropLook={BACKDROP_LOOK_DEFAULT}
                onClose={closePreview}
                onError={onPreviewError}
              />
            )}
          <ObliqueNavigation nextInterface={nextInterface} />
        </ObliqueOverlay>
      )}
      {running && Extension && (
        <Suspense fallback={null}>
          <Extension
            map={libreMap}
            data={data}
            resetToken={enabledToken}
            heightOffset={heightOffset as Meters}
            suspended={isBusy}
            surfacePicker={axisPicker}
            surfaceMode={rotationSurface}
            readViewAnchor={readObjectViewAnchor}
            onControllerChange={onExtensionControllerChange}
            onReset={resetExtension}
            onCancel={cancelExtension}
            onOpen={openExtensionImage}
          />
        </Suspense>
      )}
      {showControl && (
        <Control position={controlPosition} order={controlOrder}>
          <Tooltip
            title={isOn ? strings.controlOff : strings.controlOn}
            placement="right"
          >
            <ControlButtonStyler
              onClick={toggle}
              dataTestId="oblique-viewer-control"
            >
              <FontAwesomeIcon
                icon={faImages}
                style={{ color: isOn && panelOpen ? ON_COLOR : OFF_COLOR }}
              />
            </ControlButtonStyler>
          </Tooltip>
        </Control>
      )}
    </>
  );
};
