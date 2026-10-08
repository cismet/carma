import { nativePixelPool, nativePreviewSource, fitNativePreviewView, lastNativePreviewView, rememberNativePreviewView } from "./utils/native-preview-pool";
import type {
  Degrees,
  DevicePixels,
  Meters,
  Radians,
  Ratio,
} from "@carma-units";
import {
  lazy,
  Suspense,
  useCallback,
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
import { sceneToPhotoEnu } from "../core/utils/image-projection";
import { getBrowsingPitchDeg } from "../core/utils/browsing-pitch";
import {
  createPhotoRotationDrape,
  type PhotoRotationDrape,
  type PhotoRotationDrapeTransition,
} from "./utils/photo-rotation-drape";
import {
  acquireSharedThreeScene,
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
  const basemapStarted = useBasemapStarted(libreMap, libreMap !== null, true);
  const { publish } = useObliqueViewerActions();
  const [remote, setRemote] = useState<{
    uri: string;
    series: ObliqueDataset[];
  } | null>(null);
  const inlineSeries = useMemo(
    () => resolveSeries(viewerConfig),
    [viewerConfig.series]
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
    />
  ) : null;
};

const ObliqueViewerRuntime = ({
  config,
  libreMap,
  extensions,
}: {
  config: ObliqueViewerConfig;
  libreMap: MaplibreMap | null;
  extensions: readonly ObliqueViewerExtension[];
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
    bearingDeg: currentBearingDeg,
    selectionStrategy: configuredSelectionStrategy,
    rotationSurface,
    previewBasemapLabels,
    previewRotationDrape,
    request,
    toggle,
    publish,
    clearRequest,
    setEnabledSeriesIds,
  } = useObliqueViewerActions();
  const selectionStrategy = nextInterface
    ? configuredSelectionStrategy
    : OBLIQUE_STATE_DEFAULT.selectionStrategy;
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
  const basemapStarted = useBasemapStarted(libreMap, running, true);
  const [viewMode, setViewMode] = useState<ObliqueViewMode>("oblique");
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const {
    data,
    isLoading,
    isAllDataReady,
    isCatalogComplete,
    error,
    perSeries,
    awaitDirection,
    awaitAll,
  } = useObliqueData(
    enabledSeries,
    running &&
      basemapStarted &&
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
  const currentDataRef = useRef(data);
  currentDataRef.current = data;
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
    libreMap?.getBearing() ?? currentBearingDeg
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
  const previewCameraActive = previewVisible || previewTransitionActive;
  const { phase, freeCamera, lockCamera } = useObliqueCameraMode({
    map: libreMap,
    enabled: running,
    dataset: browsingDataset,
    pitchDeg: browsingPitchDeg,
    suspended: previewCameraActive || isBusy || viewMode !== "oblique",
    onBeforeLeave: beforeLeave,
  });
  const browsing = running && phase === "active";
  const [previewAltitude, setPreviewAltitude] = useState<{
    imageId: string;
    altitude: number;
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
    records: visibleFootprints,
    findAtGroundPoint: findLoadedAtGroundPoint,
  } = useVisibleFootprints({
    map: libreMap,
    data,
    enabled: running && viewMode !== "objectCoverage",
    locked: previewVisible || isBusy,
    viewMode,
    selectionStrategy,
  });
  const groundPickerRef = useRef(findLoadedAtGroundPoint);
  groundPickerRef.current = findLoadedAtGroundPoint;
  const findAtGroundPoint = useCallback(
    async (
      point: [number, number],
      activeImageId?: string | null,
      heightMeters?: number
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
        heightMeters
      );
      if (result !== null) return result;
      const allReady = await awaitAll();
      if (
        !allReady ||
        !runningRef.current ||
        epoch !== selectionEpochRef.current
      )
        return undefined;
      return groundPickerRef.current(point, activeImageId, heightMeters);
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
  const selectedCalibration =
    selectedRecord && resolvedSelectedDataset
      ? getCameraCalibration(resolvedSelectedDataset, selectedRecord.cameraId)
      : null;
  const rollDeg =
    selectedRecord && resolvedSelectedDataset
      ? poseOf(selectedRecord, resolvedSelectedDataset).rollDeg
      : 0;
  const principalOffset = selectedCalibration
    ? calibrationImageOffset(selectedCalibration)
    : undefined;
  const previewQualityLevel = selectedDataset.minimumPreviewQualityLevel ?? "0";
  const [dimImage, setDimImage] = useState(false);
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
  const readViewAnchor = useCallback(
    (
      screenPoint?: { x: number; y: number },
      surfaceMode: PhotoAxisSurfaceMode = pointIntersectionSurface
    ): MercatorCoordinate | undefined => {
      if (!libreMap) return undefined;
      let anchor: MercatorCoordinate | undefined;
      const surfaces = getSharedThreeSceneRuntimes(libreMap).filter(
        (runtime) =>
          (runtime.providesTerrain || runtime.receivesMapStyleTexture) &&
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
            if (hit) {
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
      if (!anchor && surfaceMode !== "mesh") {
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
  const readRotationTarget = useCallback((): ObliqueGroundTarget | null => {
    const anchor = readViewAnchor(undefined, rotationSurface);
    if (!anchor) return null;
    const point = anchor.toLngLat();
    return {
      longitude: point.lng,
      latitude: point.lat,
      heightMeters: anchor.toAltitude(),
      heightDatum: "dhhn2016",
    };
  }, [readViewAnchor, rotationSurface]);
  const {
    beginPreview,
    resetPan: resetPreviewPan,
    getBrowsingPadding,
  } = usePreviewPan({
    map: libreMap,
    root: previewRoot,
    enabled: previewCameraActive,
    panEnabled: nextInterface,
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
    onPanEnd: () => {
      targetRef.current = readTarget();
      invalidateNavigationRef.current(false);
      writePreviewHashRef.current();
    },
  });
  resetPreviewPanRef.current = resetPreviewPan;
  const onSelect = useCallback(
    (next: NearestObliqueImageRecord | null) => {
      if (next && !enabledSetRef.current.has(next.record.seriesId)) return;
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
    [readTarget]
  );
  const { refreshSearch, computeNavigation } = useNearestImage({
    map: libreMap,
    enabled: browsing && !isBusy && viewMode !== "objectCoverage",
    dataset: browsingDataset,
    viewMode,
    data,
    locked: previewVisible || isBusy,
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

  const previewDisplayReadyRef = useRef<string | null>(null);
  const rotationDrapeLabelsRef = useRef(previewBasemapLabels);
  rotationDrapeLabelsRef.current = previewBasemapLabels;
  const rotationDrapeControllerRef = useRef<PhotoRotationDrape | null>(null);
  const rotationDrapeTransitionRef = useRef<{
    transition: PhotoRotationDrapeTransition;
    settled: boolean;
    seriesIds: readonly string[];
  } | null>(null);
  const cancelRotationDrape = useCallback(() => {
    rotationDrapeTransitionRef.current?.transition.dispose();
    rotationDrapeTransitionRef.current = null;
    rotationDrapeControllerRef.current?.cancel();
  }, []);
  useEffect(() => {
    if (!libreMap || !nextInterface || !previewRotationDrape || !running) return;
    const controller = createPhotoRotationDrape(libreMap, {
      showBasemapLabels: () => rotationDrapeLabelsRef.current,
    });
    rotationDrapeControllerRef.current = controller;
    return () => {
      rotationDrapeTransitionRef.current = null;
      if (rotationDrapeControllerRef.current === controller)
        rotationDrapeControllerRef.current = null;
      controller.dispose();
    };
  }, [libreMap, nextInterface, previewRotationDrape, running]);
  useEffect(() => {
    const pair = rotationDrapeTransitionRef.current;
    if (pair?.seriesIds.some((id) => !enabledSet.has(id))) cancelRotationDrape();
  }, [enabledSet, cancelRotationDrape]);
  const prepareRotationDrape = useCallback(
    async (from: ObliqueImageRecord | undefined, to: ObliqueImageRecord, epoch: number) => {
      const controller = rotationDrapeControllerRef.current;
      if (!controller || !from || from.id === to.id || viewModeRef.current !== "oblique")
        return undefined;
      setBusy(true);
      const photoOf = async (record: ObliqueImageRecord) => {
        const dataset = currentDataRef.current?.datasets.get(record.seriesId);
        if (!dataset) throw Error("Photo series unavailable");
        return {
          record, dataset,
          calibration: getCameraCalibration(dataset, record.cameraId),
          pose: poseOf(record, dataset),
          altitude: await resolveCameraAltitude(record, dataset.heightDatum, heightOffset, dataset.allowUnverifiedSourceHeight),
        };
      };
      try {
        const [source, target] = await Promise.all([photoOf(from), photoOf(to)]);
        if (epoch !== selectionEpochRef.current || !runningRef.current) return undefined;
        const transition = await controller.prepare(source, target);
        if (epoch !== selectionEpochRef.current || !runningRef.current) {
          transition?.dispose();
          return undefined;
        }
        if (transition) rotationDrapeTransitionRef.current = {
          transition, settled: false, seriesIds: [from.seriesId, to.seriesId],
        };
        return transition;
      } catch {
        // Missing photo pixels never block the ordinary geometric rotation.
        return undefined;
      }
    }, [heightOffset, setBusy]
  );
  const finishRotationDrape = useCallback((transition?: PhotoRotationDrapeTransition) => {
    if (!transition || rotationDrapeTransitionRef.current?.transition !== transition) return;
    rotationDrapeTransitionRef.current.settled = true;
    if (previewVisibleRef.current && previewDisplayReadyRef.current !== transition.targetImageId)
      transition.finish();
    else {
      transition.dispose();
      rotationDrapeTransitionRef.current = null;
    }
  }, []);

  const flyTo = useCallback(
    async (
      record: ObliqueImageRecord,
      animation: AnimationConfig | undefined,
      dynamicDuration: boolean,
      preserveView = false,
      viewAnchor?: MercatorCoordinate,
      centerPreview?: boolean,
      previewState?: ObliquePreviewState,
      onProgress?: (progress: number) => void
    ): Promise<boolean> => {
      if (
        !libreMap ||
        !runningRef.current ||
        !enabledSetRef.current.has(record.seriesId)
      )
        return false;
      const dataset = currentDataRef.current?.datasets.get(record.seriesId);
      if (!dataset) return false;
      const epoch = selectionEpochRef.current;
      const anchor = preserveView ? viewAnchor ?? readViewAnchor() : undefined;
      setBusy(true);
      setRuntimeError(null);
      setPreviewOutlineReadyImageId(null);
      previewDisplayReadyRef.current = null;
      if (preserveView) {
        beginPreview();
        setPreviewTransitionActive(true);
      } else resetPreviewPanRef.current();
      try {
        const pose = poseOf(record, dataset);
        const altitude = await resolveCameraAltitude(
          record,
          dataset.heightDatum,
          heightOffset,
          dataset.allowUnverifiedSourceHeight
        );
        setPreviewAltitude({ imageId: record.id, altitude });
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
        freeCamera();
        profile?.phase("flight");
        const calibration = getCameraCalibration(dataset, record.cameraId);
        const principal = calibrationImageOffset(calibration);
        previewCameraRef.current = {
          imageId: record.id,
          pose: viewPose,
          altitude: viewAltitude as Meters,
        };
        const flight = flyToPose(libreMap, viewPose, viewAltitude, animation, {
          dynamicDuration,
          anchor,
          maxFovDeg: browsingDataset.maxFovDeg,
          centerPreview,
          fitWholeImage: !nextInterface,
          previewState,
          onProgress,
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
        return (
          epoch === selectionEpochRef.current &&
          runningRef.current &&
          enabledSetRef.current.has(record.seriesId)
        );
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
        if (epoch === selectionEpochRef.current) setBusy(false);
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
      browsingDataset.maxFovDeg,
      nextInterface,
    ]
  );

  const returnCameraToBrowsing = useCallback(
    (
      durationMs?: number,
      rotation?: { bearingDeg: number; anchor: MercatorCoordinate; easing?: AnimationConfig["easingFunction"]; onProgress?: (progress: number) => void }
    ): CameraFlight | undefined => {
      if (!libreMap) return undefined;
      if (!rotation?.onProgress) cancelRotationDrape();
      activeFlightRef.current?.cancel();
      setBusy(true);
      setPreviewTransitionActive(true);
      freeCamera();
      const pitch =
        viewModeRef.current === "nadir"
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
        settleToPitch(libreMap, pitch, {
          bearingDeg: rotation?.bearingDeg,
          anchor: rotation?.anchor ?? readViewAnchor(),
          onProgress: rotation?.onProgress,
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
        if (runningRef.current) lockCamera(pitch);
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
      activeFlightRef.current?.cancel();
      activeFlightRef.current = null;
      viewModeRef.current = mode;
      setViewMode(mode);
      setRuntimeError(null);
      setDimImage(false);
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
    readViewAnchor,
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
    cancelNavigationRef.current();
    if (!previewVisibleRef.current) return;
    selectionEpochRef.current++;
    if (nextInterface) {
      publish({ previewVisible: false });
      setDimImage(false);
    }
    void settleToBrowsing();
  }, [nextInterface, publish, settleToBrowsing]);
  const openPreview = useCallback(
    async (
      imageId?: string,
      centerPreview = true,
      previewState?: ObliquePreviewState
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
      if (requested) {
        selectedImageRef.current = requested;
        setSelectedImage(requested);
      }
      if (libreMap) beginInteractionProfile(libreMap, "openPreview");
      targetRef.current = readTarget();
      const dataset = data?.datasets.get(record.seriesId);
      const succeeded = await flyTo(
        record,
        dataset?.animations.flyToExteriorOrientation,
        true,
        true,
        undefined,
        nextInterface ? centerPreview : true,
        nextInterface ? previewState : undefined
      );
      if (epoch !== selectionEpochRef.current || !runningRef.current)
        return false;
      if (succeeded) {
        publish({ previewVisible: true });
        setPreviewTransitionActive(false);
      } else {
        await settleToBrowsing();
      }
      return succeeded;
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
    void openPreview(record.id, true, initial);
  }, [browsing, isBusy, perSeries, data, openPreview]);
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

  const previewPhoto = useMemo(
    () =>
      selectedRecord &&
      selectedCalibration &&
      previewAltitude?.imageId === selectedRecord.id
        ? {
            record: selectedRecord,
            calibration: selectedCalibration,
            pose: poseOf(selectedRecord, selectedDataset),
            altitude: previewAltitude.altitude,
          }
        : undefined,
    [selectedRecord, selectedCalibration, selectedDataset, previewAltitude]
  );

  const onPreviewDisplayReady = useCallback((imageId: string) => {
    if (imageId !== selectedImageRef.current?.record.id) return;
    previewDisplayReadyRef.current = imageId;
    const drape = rotationDrapeTransitionRef.current;
    if (drape?.settled && drape.transition.targetImageId === imageId) {
      drape.transition.dispose();
      rotationDrapeTransitionRef.current = null;
    }
  }, []);

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
      return {
        previewPath: dataset.previewPath,
        imageId: record.sourceId,
        avifOnly: dataset.avifOnly,
        originalImageUrl: dataset.avifOnly
          ? undefined
          : record.assets?.original?.href,
        avifPyramidUrl:
          record.assets?.pyramid?.href ??
          dataset.avifPyramidTemplate?.replace(
            /\{imageId\}/g,
            encodeURIComponent(record.sourceId)
          ),
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
  const prefetchNavigationLookAhead = useCallback(
    (candidate: NearestObliqueImageRecord | null, step?: PreparedObliqueNavigationTarget) => {
      if (!candidate) {
        navigationWarmRef.current?.(); navigationWarmRef.current = null;
        return;
      }
      const record = candidate.record;
      const dataset = currentDataRef.current?.datasets.get(record.seriesId);
      const input = previewThumbnailSource(record);
      if (!libreMap || !dataset || !input || isPreviewSourceMissing(input)) {
        navigationWarmRef.current?.(); navigationWarmRef.current = null;
        return;
      }
      const source = nativePreviewSource({
        imageId: record.sourceId, path: dataset.previewPath,
        sourceUrl: input.originalImageUrl ?? input.avifPyramidUrl ?? "",
        avifPyramidUrl: input.avifPyramidUrl, avifOnly: dataset.avifOnly,
        nativeSize: input.nativeSize,
        minimumQualityLevel: dataset.minimumPreviewQualityLevel,
      });
      const { width, height } = libreMap.transform;
      const forecast = fitNativePreviewView(source, width, height,
        degToRad(poseOf(record, dataset).rollDeg as Degrees), window.devicePixelRatio || 1);
      // NG on-the-spot rotation retains the current scale. Reuse a normalized
      // crop as the bounded initial forecast; settled geometry then replaces it.
      if (nextInterface && step && !step.fitNextImage && previewVisibleRef.current) {
        const previous = selectedImageRef.current?.record;
        const previousInput = previewThumbnailSource(previous ?? null);
        const previousDataset = previous && currentDataRef.current?.datasets.get(previous.seriesId);
        if (previous && previousInput && previousDataset) {
          const oldSource = nativePreviewSource({ imageId: previous.sourceId,
            path: previousDataset.previewPath,
            sourceUrl: previousInput.originalImageUrl ?? previousInput.avifPyramidUrl ?? "",
            avifPyramidUrl: previousInput.avifPyramidUrl, avifOnly: previousDataset.avifOnly,
            nativeSize: previousInput.nativeSize,
            minimumQualityLevel: previousDataset.minimumPreviewQualityLevel });
          const old = lastNativePreviewView(oldSource);
          if (old && oldSource.nativeSize) {
            const scaleX = input.nativeSize.width / oldSource.nativeSize.width;
            const scaleY = input.nativeSize.height / oldSource.nativeSize.height;
            const crop = old.view.visible;
            forecast.view = { visible: { x: (crop.x * scaleX) as DevicePixels,
              y: (crop.y * scaleY) as DevicePixels, width: (crop.width * scaleX) as DevicePixels,
              height: (crop.height * scaleY) as DevicePixels },
              density: (old.view.density / Math.min(scaleX, scaleY)) as Ratio };
          }
        }
      }
      // Creating the new lease first protects a same-source warm stack from
      // stale hover cleanup. The pool alone gates work against visible demand.
      rememberNativePreviewView(source, forecast.view, forecast.pixels);
      const previous = navigationWarmRef.current;
      navigationWarmRef.current = nativePixelPool.prewarm(source, forecast.view, forecast.pixels);
      previous?.();
    },
    [libreMap, nextInterface, previewThumbnailSource]
  );
  useEffect(() => () => { navigationWarmRef.current?.(); navigationWarmRef.current = null; }, []);
  useEffect(() => {
    if (!running || viewMode === "objectCoverage") {
      navigationWarmRef.current?.(); navigationWarmRef.current = null;
    }
  }, [running, viewMode]);

  hideFootprintsRef.current = useFootprintLayer({
    map: libreMap,
    enabled: running && viewMode !== "objectCoverage",
    selectedImageId,
    selectedRecord: selectedRecord,
    nearbyRecords: visibleFootprints,
    datasets: data?.datasets,
    heightOffset,
    seriesLabels: hoverSeriesLabels,
    showSeriesLabels: loadedEnabledSeriesCount > 1,
    missingImageIds: missingImages,
    onHoveredRecord: (record) => {
      if (!record) axisPicker?.clearDebug();
      watchPreviewAvailability(record);
      prefetchPreviewThumbnail(previewThumbnailSource(record));
    },
    findAtScreenPoint: async (point) => {
      if (!axisPicker) return null;
      const anchor = readViewAnchor(point);
      const ground = anchor?.toLngLat();
      if (!ground) {
        axisPicker.clearDebug();
        return null;
      }
      const groundPoint: [number, number] = [ground.lng, ground.lat];
      const record = await findAtGroundPoint(
        groundPoint,
        selectedImageRef.current?.record.id,
        anchor?.toAltitude()
      );
      axisPicker.reportPointer(record, groundPoint);
      return record;
    },
    seriesLabel: footprintSeriesLabel(
      selectedDataset,
      loadedEnabledSeriesCount
    ),
    locked: previewVisible || isBusy,
    hidden:
      previewVisible &&
      !dimImage &&
      !selectedPreviewMissing &&
      previewOutlineReadyImageId === selectedImageId,
    style: { ...selectedDataset.footprintsStyle, outlineWidth: 2 },
    fadeOut: selectedDataset.animations.outlineFadeOut,
    onClick: (imageId) => {
      void openPreview(imageId, true);
    },
    onDoubleClick: (imageId) => {
      void openPreview(imageId, false);
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
      const withPreview = previewVisibleRef.current;
      if (!withPreview && viewAnchor) {
        const dataset =
          nearest &&
          currentDataRef.current?.datasets.get(nearest.record.seriesId);
        const drape = nearest && nextInterface
          ? await prepareRotationDrape(sourceRecord, nearest.record, epoch)
          : undefined;
        if (epoch !== selectionEpochRef.current || !runningRef.current) { drape?.dispose(); return; }
        if (nearest) setSelectedImage(nearest);
        // Browsing ends at its regular pitch in the same tween as heading,
        // pan and scale, without visiting the photo pitch first.
        await returnCameraToBrowsing(animation?.duration, {
          bearingDeg:
            nearest && dataset
              ? poseOf(nearest.record, dataset).bearingDeg
              : radToDeg(headingRad),
          anchor: viewAnchor,
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
      const drape = nextInterface && withPreview && viewAnchor
        ? await prepareRotationDrape(sourceRecord, nearest.record, epoch)
        : undefined;
      if (epoch !== selectionEpochRef.current || !runningRef.current) { drape?.dispose(); return; }
      if (withPreview) setDimImage(true);
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
        drape?.update
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
    requestTarget: requestNavigationTarget,
    requestAction: requestNavigationAction,
    cancel: cancelNavigation,
    getCardinal: getCardinalNavigationTarget,
    rememberDirection,
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
    busyRef,
    readTarget,
    readRotationTarget,
    computeNavigation,
    ensureDirections: ensureNavigationDirections,
    publish: publishNavigationTargets,
    onLookAhead: prefetchNavigationLookAhead,
  });
  useEffect(() => {
    publish({ warmNavigation });
    return () => publish({ warmNavigation: undefined });
  }, [publish, warmNavigation]);
  invalidateNavigationRef.current = invalidateNavigation;
  cancelNavigationRef.current = () => {
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
      allowModeChange = false
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
      const dataset = currentDataRef.current?.datasets.get(
        step.candidate.record.seriesId
      );
      if (!dataset) return;
      const sourceRecord = selectedImageRef.current?.record;
      prefetchNavigationLookAhead(step.candidate, step);
      cancelRotationDrape();
      if (key) rememberDirection(key);
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
        key === undefined;
      if (rotation && rotationDrapeControllerRef.current) setBusy(true);
      const drape = rotation ? await prepareRotationDrape(sourceRecord, step.candidate.record, epoch) : undefined;
      if (epoch !== selectionEpochRef.current || !runningRef.current || !enabledSetRef.current.has(step.candidate.record.seriesId)) {
        drape?.dispose();
        if (epoch === selectionEpochRef.current) setBusy(false);
        return;
      }
      selectedImageRef.current = step.candidate;
      setSelectedImage(step.candidate);
      if (!withPreview) {
        await returnCameraToBrowsing(
          dataset.animations.flyToNextImage?.duration,
          { bearingDeg: pose.bearingDeg, anchor, onProgress: drape?.update }
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
        rotation && nextInterface ? anchor : undefined,
        step.fitNextImage || !nextInterface ? true : undefined,
        undefined,
        drape?.update
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
      nextInterface,
      rememberDirection,
      prefetchNavigationLookAhead,
      cancelRotationDrape,
      prepareRotationDrape,
      finishRotationDrape,
      setBusy,
      flyTo,
      returnCameraToBrowsing,
      publish,
      settleToBrowsing,
    ]
  );
  const requestNavigation = useCallback(
    (key: ObliqueNavigationKey) => {
      void requestNavigationTarget(key, (target) =>
        navigatePrepared(target, key)
      );
    },
    [requestNavigationTarget, navigatePrepared]
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
    rotationEnabled: isCatalogComplete,
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

  const handledRequestRef = useRef(0);
  useEffect(() => {
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
      if (!runningRef.current) return;
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
        setBusy(false);
      }
      if (
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
      if (!pendingGesture || event.obliqueFov || busyRef.current) return;
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
    readTarget,
    chooseRequestedView,
    selectedDataset,
    running,
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
    [selectedRecord, previewThumbnailSource, watchPreviewAvailability]
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
          {previewVisible &&
            selectedRecord &&
            enabledSet.has(selectedRecord.seriesId) &&
            selectedCalibration && (
              <ObliqueImagePreview
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
                avifPyramidUrl={
                  selectedRecord.assets?.pyramid?.href ??
                  selectedDataset.avifPyramidTemplate?.replace(
                    /\{imageId\}/g,
                    encodeURIComponent(selectedRecord.sourceId)
                  )
                }
                nativePixelSize={{
                  width: selectedCalibration.widthPx as DevicePixels,
                  height: selectedCalibration.heightPx as DevicePixels,
                }}
                imageId={selectedRecord.sourceId}
                qualityLevel={previewQualityLevel}
                minimumQualityLevel={selectedDataset.minimumPreviewQualityLevel}
                halfFovTan={selectedCalibration.halfFovTan}
                dimImage={dimImage}
                panEnabled={nextInterface}
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
            readViewAnchor={readViewAnchor}
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
