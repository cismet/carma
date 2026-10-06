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
} from "./utils/preview-thumbnail-cache";
import { MercatorCoordinate, type Map as MaplibreMap } from "maplibre-gl";
import { Matrix4, Raycaster, Vector3 } from "three";
import { sceneToPhotoEnu } from "./utils/image-projection";
import {
  acquireSharedThreeScene,
  getSharedThreeSceneRuntimes,
} from "@carma-mapping/engines/maplibre";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faImages } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import { createPhotoAxisPicker } from "./utils/photo-axis-picker";
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
import { panViewTarget } from "../core/utils/selection";
import { footprintSeriesLabel } from "../core/utils/footprint-marker";
import { getHeadingFromCardinalDirection } from "../core/utils/orientation";
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
import { useObliqueCameraMode } from "./hooks/useObliqueCameraMode";
import { useObliqueData } from "./hooks/useObliqueData";
import { useBasemapStarted } from "./hooks/useBasemapStarted";
import { useObliqueDirectionKeybindings } from "./hooks/useObliqueDirectionKeybindings";
import {
  OBLIQUE_STATE_DEFAULT,
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
const PAN_DEBOUNCE_MS = 80;
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
  const browsingPitchDeg = useMemo(() => {
    let pitchSumRad = 0 as Radians;
    let imageCount = 0;
    for (const [id, total] of data?.obliquePitchBySeries ?? []) {
      if (!enabledSet.has(id)) continue;
      pitchSumRad = (pitchSumRad + total.pitchSumRad) as Radians;
      imageCount += total.imageCount;
    }
    return clamp(
      imageCount > 0
        ? radToDeg(pitchSumRad / imageCount)
        : enabledSeries[0]?.pitchDeg ?? browsingDataset.pitchDeg,
      0,
      FREE_MAX_PITCH_DEG
    ) as Degrees;
  }, [
    data?.obliquePitchBySeries,
    enabledSet,
    enabledSeries,
    browsingDataset.pitchDeg,
  ]);
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
  const axisPicker = useMemo(
    () =>
      nextInterface && libreMap && data
        ? createPhotoAxisPicker(libreMap, data, heightOffset)
        : null,
    [nextInterface, libreMap, data, heightOffset]
  );
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
    enabled: nextInterface && running && viewMode !== "objectCoverage",
    locked: previewVisible || isBusy,
    viewMode,
    refineAtGroundPoint: axisPicker?.pick,
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
  } | null>(null);
  // The desired ground point survives image-camera flights, which move the map centre.
  const targetRef = useRef<ObliqueGroundTarget | null>(null);
  const selectionEpochRef = useRef(0);
  const readTarget = useCallback((): ObliqueGroundTarget | null => {
    if (!libreMap) return null;
    const center = libreMap.unproject([
      libreMap.transform.width / 2,
      libreMap.transform.height / 2,
    ]);
    return {
      longitude: center.lng,
      latitude: center.lat,
      heightMeters:
        libreMap.queryTerrainElevation(center) ?? libreMap.getCenterElevation(),
      heightDatum: "dhhn2016",
    };
  }, [libreMap]);
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
      writePreviewHashRef.current();
    },
  });
  resetPreviewPanRef.current = resetPreviewPan;
  const onSelect = useCallback(
    (next: NearestObliqueImageRecord | null) => {
      if (next && !enabledSetRef.current.has(next.record.seriesId)) return;
      setSelectedImage(next);
      if (!previewVisibleRef.current) targetRef.current = readTarget();
    },
    [readTarget]
  );
  const refreshSearch = useNearestImage({
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
      tiff:
        /(?:^|\/)tiff(?:$|;)/i.test(mime ?? "") || /\.tiff?$/i.test(pathname),
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
      selectedImageBearingDeg:
        (selectedRecord?.pose?.bearingDeg as Degrees) ?? null,
      downloadUrl,
      downloadOptions,
    });
  }, [publish, selectedImageId, selectedRecord, downloadUrl, downloadOptions]);
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
    enabled: browsing,
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
      if (previewVisibleRef.current) targetRef.current = readTarget();
      writePreviewHashRef.current();
    },
    minFovDeg: browsingDataset.minFovDeg,
    maxFovDeg: browsingDataset.maxFovDeg,
    busyRef,
  });

  const readViewAnchor = useCallback(
    (screenPoint?: {
      x: number;
      y: number;
    }): MercatorCoordinate | undefined => {
      if (!libreMap) return undefined;
      let anchor: MercatorCoordinate | undefined;
      const surfaces = getSharedThreeSceneRuntimes(libreMap).filter(
        (runtime) =>
          (runtime.providesTerrain || runtime.receivesMapStyleTexture) &&
          runtime.root.visible
      );
      if (surfaces.length) {
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
            const hit = ray
              .intersectObjects(
                surfaces.map(({ root }) => root),
                true
              )
              .find(({ object }) => {
                for (let parent = object; parent; parent = parent.parent!) {
                  if (!parent.visible) return false;
                }
                return true;
              });
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
      if (!anchor) {
        const point = libreMap.unproject([
          screenPoint?.x ?? libreMap.transform.width / 2,
          screenPoint?.y ?? libreMap.transform.height / 2,
        ]);
        anchor = MercatorCoordinate.fromLngLat(
          point,
          libreMap.queryTerrainElevation(point) ?? libreMap.getCenterElevation()
        );
      }
      return anchor;
    },
    [libreMap]
  );

  const flyTo = useCallback(
    async (
      record: ObliqueImageRecord,
      animation: AnimationConfig | undefined,
      dynamicDuration: boolean,
      preserveView = false,
      viewAnchor?: MercatorCoordinate,
      centerPreview?: boolean,
      previewState?: ObliquePreviewState
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
        const quality = dataset.minimumPreviewQualityLevel ?? "0";
        const url = getImageUrls(
          record.sourceId,
          dataset.previewPath,
          quality
        ).previewUrl;
        if (!url)
          throw new Error("Für dieses Bild ist keine Vorschau-URL verfügbar.");
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
        if (activeFlightRef.current === flight) activeFlightRef.current = null;
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
      rotation?: { bearingDeg: number; anchor: MercatorCoordinate }
    ): CameraFlight | undefined => {
      if (!libreMap) return undefined;
      activeFlightRef.current?.cancel();
      setBusy(true);
      setPreviewTransitionActive(true);
      freeCamera();
      const pitch = viewModeRef.current === "nadir" ? 0 : browsingPitchDeg;
      const record = selectedImageRef.current?.record;
      const dataset = record && data?.datasets.get(record.seriesId);
      const camera = previewCameraRef.current;
      const recenterImage =
        !nextInterface &&
        previewVisibleRef.current &&
        record &&
        dataset &&
        camera?.imageId === record.id;
      setDimImage(!recenterImage);
      const returnToBrowsing = () =>
        settleToPitch(libreMap, pitch, {
          bearingDeg: rotation?.bearingDeg,
          anchor: rotation?.anchor ?? readViewAnchor(),
          fovDeg: clamp(
            libreMap.getVerticalFieldOfView(),
            browsingDataset.minFovDeg,
            browsingDataset.maxFovDeg
          ) as Degrees,
          padding: getBrowsingPadding(),
          maxZoom: getBrowsingMaxZoom(),
          durationMs:
            durationMs ?? browsingDataset.animations.leaveObliqueMode?.duration,
        });
      let flight: CameraFlight;
      if (recenterImage && camera && record && dataset) {
        const calibration = getCameraCalibration(dataset, record.cameraId);
        const principal = calibrationImageOffset(calibration);
        let current = flyToPose(
          libreMap,
          camera.pose,
          camera.altitude,
          {
            duration:
              durationMs ??
              dataset.animations.flyToExteriorOrientation?.duration,
          },
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
            current = returnToBrowsing();
            await current.done;
          })(),
          cancel: () => {
            cancelled = true;
            current.cancel();
          },
        };
      } else {
        flight = returnToBrowsing();
      }
      activeFlightRef.current = flight;
      flight.done.then(() => {
        if (activeFlightRef.current !== flight) return;
        activeFlightRef.current = null;
        publish({ previewVisible: false });
        setPreviewTransitionActive(false);
        setDimImage(false);
        if (runningRef.current) lockCamera(pitch);
        setBusy(false);
        if (runningRef.current) void refreshSearch({ immediate: true });
      });
      return flight;
    },
    [
      libreMap,
      data,
      nextInterface,
      browsingDataset,
      browsingPitchDeg,
      readViewAnchor,
      getBrowsingPadding,
      getBrowsingMaxZoom,
      freeCamera,
      lockCamera,
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
      window.clearTimeout(panTimerRef.current);
      pendingPanRef.current = null;
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
    if (!previewVisibleRef.current) return;
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
      if (!runningRef.current) return false;
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

  const onPreviewOutlineReady = useCallback(() => {
    if (
      previewVisibleRef.current &&
      selectedImageRef.current?.record.id === selectedImageId &&
      selectedImageId
    ) {
      setPreviewOutlineReadyImageId(selectedImageId);
      void hideFootprintsRef.current();
    }
  }, [selectedImageId]);

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
    onHoveredRecord: (record) => {
      if (!record) axisPicker?.clearDebug();
      const dataset = record && data?.datasets.get(record.seriesId);
      const camera =
        record && dataset
          ? getCameraCalibration(dataset, record.cameraId)
          : null;
      prefetchPreviewThumbnail(
        record && dataset
          ? {
              previewPath: dataset.previewPath,
              imageId: record.sourceId,
              originalImageUrl: record.assets?.original?.href,
              avifPyramidUrl:
                record.assets?.pyramid?.href ??
                dataset.avifPyramidTemplate?.replace(
                  /\{imageId\}/g,
                  encodeURIComponent(record.sourceId)
                ),
              nativeSize: camera
                ? { width: camera.widthPx, height: camera.heightPx }
                : undefined,
            }
          : null
      );
    },
    findAtScreenPoint: nextInterface
      ? async (point) => {
          const anchor = readViewAnchor(point);
          const ground = anchor?.toLngLat();
          return ground
            ? findAtGroundPoint(
                [ground.lng, ground.lat],
                selectedImageRef.current?.record.id,
                anchor?.toAltitude()
              )
            : null;
        }
      : undefined,
    seriesLabel: footprintSeriesLabel(
      selectedDataset,
      loadedEnabledSeriesCount
    ),
    locked: previewVisible || isBusy,
    hidden:
      previewVisible &&
      !dimImage &&
      previewOutlineReadyImageId === selectedImageId,
    style: { ...selectedDataset.footprintsStyle, outlineWidth: 2 },
    fadeOut: selectedDataset.animations.outlineFadeOut,
    onClick: nextInterface
      ? (imageId) => {
          void openPreview(imageId, true);
        }
      : undefined,
    onDoubleClick: nextInterface
      ? (imageId) => {
          void openPreview(imageId, false);
        }
      : undefined,
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
        if (nearest) setSelectedImage(nearest);
        // Browsing ends at its regular pitch in the same tween as heading,
        // pan and scale, without visiting the photo pitch first.
        await returnCameraToBrowsing(animation?.duration, {
          bearingDeg:
            nearest && dataset
              ? poseOf(nearest.record, dataset).bearingDeg
              : radToDeg(headingRad),
          anchor: viewAnchor,
        })?.done;
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
      if (withPreview) setDimImage(true);
      setSelectedImage(nearest);
      const succeeded = await flyTo(
        nearest.record,
        animation,
        true,
        viewAnchor !== undefined ||
          (withPreview && (fitNextImage || !nextInterface)),
        viewAnchor,
        withPreview && (fitNextImage || !nextInterface) ? true : undefined
      );
      if (epoch !== selectionEpochRef.current || !runningRef.current) return;
      setDimImage(false);
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
    ]
  );

  const pan = useCallback(
    async (horizontal: number, vertical: number) => {
      if (viewModeRef.current === "objectCoverage") return;
      const record = selectedImageRef.current?.record;
      const dataset = record ? data?.datasets.get(record.seriesId) : null;
      const target = targetRef.current ?? readTarget();
      if (
        !record ||
        !dataset ||
        !target ||
        !libreMap ||
        busyRef.current ||
        !Number.isFinite(horizontal) ||
        !Number.isFinite(vertical)
      )
        return;
      const nextTarget = panViewTarget(record, dataset, target, {
        right: horizontal,
        forward: vertical,
      });
      await chooseRequestedView(
        degToRad(libreMap.getBearing()),
        nextTarget,
        dataset.animations.flyToNextImage,
        undefined,
        false,
        undefined,
        true
      );
    },
    [data, readTarget, libreMap, chooseRequestedView]
  );
  const pendingPanRef = useRef<[number, number] | null>(null);
  const panTimerRef = useRef<number | undefined>(undefined);
  const requestPan = useCallback(
    (horizontal: number, vertical: number) => {
      pendingPanRef.current = [horizontal, vertical];
      window.clearTimeout(panTimerRef.current);
      panTimerRef.current = window.setTimeout(() => {
        const next = pendingPanRef.current;
        pendingPanRef.current = null;
        if (next) void pan(...next);
      }, PAN_DEBOUNCE_MS);
    },
    [pan]
  );
  useObliqueDirectionKeybindings({
    enabled:
      browsing &&
      viewMode !== "objectCoverage" &&
      (data?.imageRecords.size ?? 0) > 1,
    onPan: requestPan,
  });

  const orbitToBearing = useCallback(
    async (bearingDeg: number, pitchDeg?: number) => {
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
        !(
          request.type === "setViewMode" &&
          viewModeRef.current === "objectCoverage"
        ))
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
      if (viewModeRef.current === "objectCoverage") {
        extensionController.current?.reset();
        viewModeRef.current = "oblique";
        setViewMode("oblique");
        publish({ viewMode: "oblique" });
      }
      const epoch = ++selectionEpochRef.current;
      window.clearTimeout(panTimerRef.current);
      pendingPanRef.current = null;
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
        void switchViewMode(request.mode);
        break;
      case "orbit":
        void orbitToBearing(request.bearingDeg, request.pitchDeg);
        break;
      case "rotate":
        void orbitToBearing(
          (libreMap?.getBearing() ?? 0) + (request.clockwise ? 90 : -90)
        );
        break;
      case "rotateTo":
        void (async () => {
          if (viewModeRef.current === "nadir")
            await switchViewMode("oblique", false);
          await orbitToBearing(
            radToDeg(getHeadingFromCardinalDirection(request.direction))
          );
        })();
        break;
      case "pan":
        requestPan(request.horizontal, request.vertical);
        break;
      case "flyToImage":
        if (previewVisibleRef.current) closePreview();
        else void openPreview();
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
    switchViewMode,
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
    selectionEpochRef.current += 1;
    if (running && !previewTransitionActive) {
      activeFlightRef.current?.cancel();
      activeFlightRef.current = null;
    }
    window.clearTimeout(panTimerRef.current);
    pendingPanRef.current = null;
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
      window.clearTimeout(panTimerRef.current);
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
  ]);
  const onPreviewError = useCallback(
    () =>
      setRuntimeError(
        "Das Vorschaubild ist noch nicht verfügbar oder konnte nicht geladen werden."
      ),
    []
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
              <ObliqueDebug picker={axisPicker} />
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
                previewPath={selectedDataset.previewPath}
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
