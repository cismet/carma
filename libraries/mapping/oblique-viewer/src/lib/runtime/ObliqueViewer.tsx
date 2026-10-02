import type { Degrees, DevicePixels, Ratio } from "@carma-units";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  prefetchPreviewThumbnail,
  disposePreviewThumbnailPrefetch,
} from "./utils/preview-thumbnail-cache";
import { MercatorCoordinate, type Map as MaplibreMap } from "maplibre-gl";
import { Matrix4, Raycaster, Vector3 } from "three";
import {
  acquireSharedThreeScene,
  getSharedThreeSceneRuntimes,
} from "@carma-mapping/engines/maplibre";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faImages } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";
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
  DEFAULT_CONTROL_ORDER,
  DEFAULT_CONTROL_POSITION,
  WUPPERTAL_OBLIQUE_2024,
  resolveSeries,
  type ObliqueViewerConfig,
} from "../core/config";
import type {
  AnimationConfig,
  CardinalDirection,
  NearestObliqueImageRecord,
  ObliqueGroundTarget,
  ObliqueImageRecord,
  ObliqueViewMode,
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
import { groundDistanceM } from "./utils/cameraMath";
import { useFovWheelZoom } from "./hooks/useFovWheelZoom";
import { usePreviewPan } from "./hooks/usePreviewPan";
import { useNearestImage } from "./hooks/useNearestImage";
import { useObliqueCameraMode } from "./hooks/useObliqueCameraMode";
import { useObliqueData } from "./hooks/useObliqueData";
import { useBasemapStarted } from "./hooks/useBasemapStarted";
import { useObliqueDirectionKeybindings } from "./hooks/useObliqueDirectionKeybindings";
import { useObliqueViewerActions } from "./oblique-actions";
import { ObliqueImagePreview } from "./ObliqueImagePreview";
import { ObliqueOverlay } from "./ObliqueOverlay";
import { strings } from "./strings.de";
import {
  flyToPose,
  poseOf,
  resolveCameraAltitude,
  settleToPitch,
} from "./utils/flyToImage";
import { getImageUrls } from "./utils/imageUrls";
import type { CameraFlight } from "./utils/obliqueCamera";
import {
  beginInteractionProfile,
  interactionProfile,
} from "./utils/interaction-profile";

const ON_COLOR = "#1677ff";
const OFF_COLOR = "#000000";
const PAN_DEBOUNCE_MS = 80;
const EMPTY_CONFIG: ObliqueViewerConfig = {};

/** Metadata and renderer orchestration; the host supplies state through the actions context. */
export const ObliqueViewer = ({
  config,
  libreMap,
}: {
  config?: ObliqueViewerConfig;
  libreMap: MaplibreMap | null;
}) => {
  const viewerConfig = config ?? EMPTY_CONFIG;
  const {
    showControl = true,
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
    heightOffset = 0,
  } = viewerConfig;
  const configuredSeries = useMemo(
    () => resolveSeries(viewerConfig),
    [viewerConfig]
  );
  // Camera browsing policy remains stable while the user toggles image series.
  const browsingDataset = configuredSeries[0] ?? WUPPERTAL_OBLIQUE_2024;
  const {
    isOn,
    panelOpen,
    previewVisible,
    isBusy,
    previewQuality,
    backdropLook,
    enabledSeriesIds,
    request,
    toggle,
    publish,
    clearRequest,
    setEnabledSeriesIds,
  } = useObliqueViewerActions();
  const enabledIds = useMemo(
    () =>
      enabledSeriesIds ??
      configuredSeries
        .filter((series) => series.enabledByDefault !== false)
        .map((series) => series.id),
    [enabledSeriesIds, configuredSeries]
  );
  const enabledSet = useMemo(() => new Set(enabledIds), [enabledIds]);
  const enabledSeries = useMemo(
    () => configuredSeries.filter((series) => enabledSet.has(series.id)),
    [configuredSeries, enabledSet]
  );
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
  const { data, isLoading, isAllDataReady, error, perSeries } = useObliqueData(
    enabledSeries,
    running && basemapStarted
  );
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ObliqueViewMode>("oblique");
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
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
      canPan: (data?.imageRecords.size ?? 0) > 1,
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

  const [previewRoot, setPreviewRoot] = useState<HTMLDivElement | null>(null);
  const resetPreviewPanRef = useRef(() => {});
  const returnCameraRef = useRef<
    (durationMs?: number) => CameraFlight | undefined
  >(() => undefined);
  const beforeLeave = useCallback(() => returnCameraRef.current(250), []);
  const [previewTransitionActive, setPreviewTransitionActive] = useState(false);
  const previewCameraActive = previewVisible || previewTransitionActive;
  const { phase, freeCamera, lockCamera } = useObliqueCameraMode({
    map: libreMap,
    enabled: running,
    dataset: browsingDataset,
    onBeforeLeave: beforeLeave,
  });
  const browsing = running && phase === "active";
  const busyRef = useRef(false);
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
  const { records: visibleFootprints, findAtGroundPoint } =
    useVisibleFootprints({
      map: libreMap,
      data,
      enabled: running,
      locked: previewVisible || isBusy,
      viewMode,
    });
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
  const previewQualityLevel =
    previewQuality === "hq"
      ? selectedDataset.hqQualityLevel
      : selectedDataset.previewQualityLevel;
  const [dimImage, setDimImage] = useState(false);
  const activeFlightRef = useRef<CameraFlight | null>(null);
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
    enabled: browsing && !isBusy,
    dataset: browsingDataset,
    viewMode,
    data,
    locked: previewVisible || isBusy,
    selectedImageId,
    onSelect,
    onCandidates,
  });
  const { downloadUrl } = useMemo(
    () =>
      resolvedSelectedDataset
        ? getImageUrls(
            selectedRecord?.sourceId,
            selectedDataset.previewPath,
            selectedDataset.previewQualityLevel,
            selectedDataset.downloadQualityLevel,
            selectedDataset
          )
        : { downloadUrl: null },
    [selectedRecord, selectedDataset, resolvedSelectedDataset]
  );
  useEffect(() => {
    publish({
      selectedImageId,
      selectedSourceImageId: selectedRecord?.sourceId ?? null,
      selectedSeriesId: selectedRecord?.seriesId ?? null,
      selectedCameraId: selectedRecord?.cameraId ?? null,
      selectedImageBearingDeg:
        (selectedRecord?.pose?.bearingDeg as Degrees) ?? null,
      downloadUrl,
    });
  }, [publish, selectedImageId, selectedRecord, downloadUrl]);
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
        (runtime) => runtime.providesTerrain && runtime.root.visible
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
      centerPreview?: boolean
    ): Promise<boolean> => {
      if (
        !libreMap ||
        !runningRef.current ||
        !enabledSetRef.current.has(record.seriesId)
      )
        return false;
      const dataset = data?.datasets.get(record.seriesId);
      if (!dataset) return false;
      const epoch = selectionEpochRef.current;
      const anchor = preserveView ? viewAnchor ?? readViewAnchor() : undefined;
      setBusy(true);
      setRuntimeError(null);
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
        const quality =
          previewQuality === "hq"
            ? dataset.hqQualityLevel
            : dataset.previewQualityLevel;
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
        const flight = flyToPose(libreMap, pose, altitude, animation, {
          dynamicDuration,
          anchor,
          maxFovDeg: browsingDataset.maxFovDeg,
          centerPreview,
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
      previewQuality,
      freeCamera,
      setBusy,
      beginPreview,
      readViewAnchor,
      browsingDataset.maxFovDeg,
    ]
  );

  const returnCameraToBrowsing = useCallback(
    (durationMs?: number): CameraFlight | undefined => {
      if (!libreMap) return undefined;
      activeFlightRef.current?.cancel();
      setBusy(true);
      setPreviewTransitionActive(true);
      setDimImage(true);
      freeCamera();
      const pitch =
        viewModeRef.current === "nadir" ? 0 : browsingDataset.pitchDeg;
      const anchor = readViewAnchor();
      const flight = settleToPitch(libreMap, pitch, {
        anchor,
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
      browsingDataset,
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
    async (mode: ObliqueViewMode) => {
      if (!libreMap || !runningRef.current || busyRef.current) return;
      if (
        mode === "nadir" &&
        !enabledSeries.some((series) =>
          series.availableCameraViews?.includes("nadir")
        )
      )
        return;
      viewModeRef.current = mode;
      setViewMode(mode);
      setRuntimeError(null);
      setDimImage(false);
      publish({ viewMode: mode, previewVisible: false });
      await settleToBrowsing();
    },
    [libreMap, enabledSeries, publish, settleToBrowsing]
  );

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
    publish({ previewVisible: false });
    setDimImage(false);
    void settleToBrowsing();
  }, [publish, settleToBrowsing]);
  const openPreview = useCallback(
    async (imageId?: string, centerPreview = true) => {
      if (!runningRef.current) return;
      if (busyRef.current) {
        if (!imageId || !centerPreview) return;
        // A double-click upgrades the immediate single-click flight to centering.
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
          return;
      }
      const record = requested?.record;
      if (
        !record ||
        busyRef.current ||
        !enabledSetRef.current.has(record.seriesId)
      )
        return;
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
        centerPreview
      );
      if (epoch !== selectionEpochRef.current || !runningRef.current) return;
      if (succeeded) {
        publish({ previewVisible: true });
        setPreviewTransitionActive(false);
      } else {
        await settleToBrowsing();
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
      refreshSearch,
      setBusy,
    ]
  );

  const hoverSeriesLabels = useMemo(
    () =>
      new Map(
        configuredSeries.map((series) => [
          series.id,
          footprintSeriesLabel(series, enabledSeries.length, true),
        ])
      ),
    [configuredSeries, enabledSeries]
  );

  useFootprintLayer({
    map: libreMap,
    enabled: running,
    selectedImageId,
    selectedRecord: selectedRecord,
    nearbyRecords: visibleFootprints,
    datasets: data?.datasets,
    heightOffset,
    seriesLabels: hoverSeriesLabels,
    onHoveredRecord: (record) => {
      const dataset = record && data?.datasets.get(record.seriesId);
      prefetchPreviewThumbnail(
        record && dataset
          ? { previewPath: dataset.previewPath, imageId: record.sourceId }
          : null
      );
    },
    findAtScreenPoint: async (point) => {
      const ground = readViewAnchor(point)?.toLngLat();
      return ground
        ? findAtGroundPoint(
            [ground.lng, ground.lat],
            selectedImageRef.current?.record.id
          )
        : null;
    },
    seriesLabel: footprintSeriesLabel(selectedDataset, enabledSeries.length),
    locked: previewVisible || isBusy,
    style: selectedDataset.footprintsStyle,
    fadeOut: selectedDataset.animations.outlineFadeOut,
    onClick: (imageId) => {
      void openPreview(imageId, false);
    },
    onDoubleClick: (imageId) => {
      void openPreview(imageId, true);
    },
  });

  const chooseRequestedView = useCallback(
    async (
      headingRad: number,
      target: ObliqueGroundTarget,
      animation: AnimationConfig | undefined,
      requestedPitchRad?: number,
      forceFlight = false,
      viewAnchor?: MercatorCoordinate
    ) => {
      if (!libreMap || busyRef.current) return;
      targetRef.current = target;
      const epoch = selectionEpochRef.current;
      const candidates = await refreshSearch({
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
      if (
        !nearest ||
        (nearest.record.id === selectedImageRef.current?.record.id &&
          !forceFlight)
      ) {
        setDimImage(false);
        return;
      }
      const withPreview = previewVisibleRef.current;
      if (withPreview) setDimImage(true);
      setSelectedImage(nearest);
      const succeeded = await flyTo(
        nearest.record,
        animation,
        true,
        viewAnchor !== undefined,
        viewAnchor
      );
      if (epoch !== selectionEpochRef.current || !runningRef.current) return;
      setDimImage(false);
      if (!succeeded) {
        publish({ previewVisible: false });
        if (runningRef.current) void settleToBrowsing();
      } else if (!withPreview) await settleToBrowsing();
      else setPreviewTransitionActive(false);
    },
    [libreMap, refreshSearch, flyTo, publish, settleToBrowsing]
  );

  const pan = useCallback(
    async (horizontal: number, vertical: number) => {
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
        dataset.animations.flyToNextImage
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
    enabled: browsing && (data?.imageRecords.size ?? 0) > 1,
    onPan: requestPan,
  });

  const orbitToBearing = useCallback(
    async (bearingDeg: number, pitchDeg?: number) => {
      if (
        !libreMap ||
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
        request.type !== "leavePreviewForNavigation")
    )
      return;
    handledRequestRef.current = request.seq;
    clearRequest(request.seq);
    if (request.type === "leavePreviewForNavigation") {
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
          if (viewModeRef.current === "nadir") await switchViewMode("oblique");
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
  const enabledToken = JSON.stringify(enabledIds);
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
  if (!libreMap) return null;
  return (
    <>
      {running &&
        previewVisible &&
        selectedRecord &&
        enabledSet.has(selectedRecord.seriesId) &&
        selectedCalibration && (
          <ObliqueOverlay map={libreMap}>
            <ObliqueImagePreview
              key={selectedRecord.id}
              map={libreMap}
              onRootChange={setPreviewRoot}
              previewPath={selectedDataset.previewPath}
              originalPixelPreviewPath={
                selectedDataset.originalPixelPreviewPath
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
              rollDeg={rollDeg}
              interiorOrientationOffsets={principalOffset}
              style={selectedDataset.imagePreviewStyle}
              backdropLook={backdropLook}
              onClose={closePreview}
              onError={onPreviewError}
            />
          </ObliqueOverlay>
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
