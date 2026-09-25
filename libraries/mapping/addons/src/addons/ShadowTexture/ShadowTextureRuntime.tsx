import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import maplibregl, { type Map as MaplibreMap } from "maplibre-gl";

import { EARTH_CIRCUMFERENCE } from "@carma-geo/proj";
import {
  getSharedThreeSceneRuntimes,
  subscribeSharedThreeSceneContent,
} from "@carma-mapping/engines/maplibre";
import {
  getSolarPosition,
  type ShadowDateState,
  type ShadowSimulationState,
} from "@carma-mapping/shadow-simulation/core";
import { useShadowAnimation } from "@carma-mapping/shadow-simulation";

import type { ShadowTextureState } from ".";
import type { ModelCollectionState } from "../ModelCollection";
import { loadDzbPrmCollection } from "../ModelCollection/dzb-prm-collection";
import { getDzbPrmShadowVisibility } from "./shadow-texture-assets";
import {
  DEFAULT_CAPTURE_HEIGHT_METERS,
  getPrintedBoardBounds,
} from "./shadow-texture-camera";
import { DZ_B_PRM_POSITION } from "./shadow-texture-georef";
import {
  createDzbPrmShadowCapture,
  createDzbPrmShadowFrameCache,
  DZB_SHADOW_SUN_DISC_SAMPLES,
  type DzbPrmShadowImage,
  type DzbPrmShadowViewBounds,
} from "./shadow-texture-capture";
import { DEFAULT_SHADOW_TEXTURE_APPEARANCE } from "./shadow-texture-appearance";

const SOURCE_ID = "__shadow_texture_canvas__";
const LAYER_ID = "__shadow_texture_raster__";

const removeImage = (map: MaplibreMap) => {
  if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
};

const showImage = (
  map: MaplibreMap,
  image: DzbPrmShadowImage,
  appearance: { color: string; intensity: number }
) => {
  if (!map.isStyleLoaded()) return;
  const source = map.getSource(SOURCE_ID) as
    | maplibregl.CanvasSource
    | undefined;
  const existing = source && map.getLayer(LAYER_ID);
  // Keep the untinted mask separate so appearance changes never rerender GLBs.
  const canvas = existing
    ? source.getCanvas()
    : document.createElement("canvas");
  if (canvas.width !== image.canvas.width) canvas.width = image.canvas.width;
  if (canvas.height !== image.canvas.height)
    canvas.height = image.canvas.height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image.canvas, 0, 0);
  context.globalCompositeOperation = "source-in";
  context.fillStyle = appearance.color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "source-over";
  if (existing) {
    map.setPaintProperty(LAYER_ID, "raster-opacity", appearance.intensity);
    if (
      source.coordinates.some(
        (corner, index) =>
          corner[0] !== image.coordinates[index][0] ||
          corner[1] !== image.coordinates[index][1]
      )
    ) {
      source.setCoordinates(image.coordinates);
    }
    // Canvas sources with animate=false otherwise keep their previous GPU copy.
    source.play();
    source.pause();
    map.triggerRepaint();
    return;
  }
  removeImage(map);
  map.addSource(SOURCE_ID, {
    type: "canvas",
    canvas,
    coordinates: image.coordinates,
    animate: false,
  });
  map.addLayer({
    id: LAYER_ID,
    type: "raster",
    source: SOURCE_ID,
    paint: {
      "raster-fade-duration": 0,
      "raster-opacity": appearance.intensity,
    },
  });
};

const getViewBounds = (map: MaplibreMap): DzbPrmShadowViewBounds => {
  const bounds = map.getBounds();
  const northwest = maplibregl.MercatorCoordinate.fromLngLat([
    bounds.getWest(),
    bounds.getNorth(),
  ]);
  const southeast = maplibregl.MercatorCoordinate.fromLngLat([
    bounds.getEast(),
    bounds.getSouth(),
  ]);
  const anchor = maplibregl.MercatorCoordinate.fromLngLat([
    DZ_B_PRM_POSITION.longitude,
    DZ_B_PRM_POSITION.latitude,
  ]);
  const marginX = (southeast.x - northwest.x) * EARTH_CIRCUMFERENCE * 0.1;
  const marginZ = (southeast.y - northwest.y) * EARTH_CIRCUMFERENCE * 0.1;
  return {
    minX: (northwest.x - anchor.x) * EARTH_CIRCUMFERENCE - marginX,
    maxX: (southeast.x - anchor.x) * EARTH_CIRCUMFERENCE + marginX,
    minZ: (northwest.y - anchor.y) * EARTH_CIRCUMFERENCE - marginZ,
    maxZ: (southeast.y - anchor.y) * EARTH_CIRCUMFERENCE + marginZ,
  };
};

type View = Readonly<{
  basePixelsPerMeter: number;
  bounds: DzbPrmShadowViewBounds;
}>;

type PrintedBoard = Readonly<{
  bounds: DzbPrmShadowViewBounds;
  bottomHeightMeters: number;
}>;

export const ShadowTextureRuntime = ({
  assetBaseUrl,
  manifestUrl,
  map,
  shadowState,
  dateState,
  textureState,
  modelState,
  setTextureState,
  setDateState,
}: {
  assetBaseUrl: string;
  manifestUrl: string | undefined;
  map: MaplibreMap;
  shadowState: ShadowSimulationState;
  dateState: ShadowDateState;
  textureState: ShadowTextureState;
  modelState: ModelCollectionState;
  setTextureState: (
    action:
      | ShadowTextureState
      | ((previous: ShadowTextureState | undefined) => ShadowTextureState)
  ) => void;
  setDateState: (
    action:
      | ShadowDateState
      | ((previous: ShadowDateState | undefined) => ShadowDateState)
  ) => void;
}) => {
  const [view, setView] = useState<View | null>(null);
  const [printedBoard, setPrintedBoard] = useState<PrintedBoard | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const timeSignature = JSON.stringify(dateState);
  const timeActive = Boolean(
    shadowState.isAnimating || textureState.timeAdjusting
  );
  const [settledTimeSignature, setSettledTimeSignature] = useState<
    string | null
  >(timeSignature);
  const [styleReady, setStyleReady] = useState(false);
  const capture = useRef<ReturnType<typeof createDzbPrmShadowCapture> | null>(
    null
  );
  const cache = useRef(createDzbPrmShadowFrameCache());
  const renderQueue = useRef<Promise<void>>(Promise.resolve());
  const lastImage = useRef<DzbPrmShadowImage | null>(null);
  const color = textureState.color ?? DEFAULT_SHADOW_TEXTURE_APPEARANCE.color;
  const intensity =
    textureState.intensity ?? DEFAULT_SHADOW_TEXTURE_APPEARANCE.intensity;
  const appearance = useRef({ color, intensity });
  const requestCapture = useRef<((date: ShadowDateState) => void) | null>(null);
  const onAnimationFrame = useCallback((date: ShadowDateState) => {
    requestCapture.current?.(date);
  }, []);
  const animatedDate = useShadowAnimation({
    dateState,
    setDateState,
    location: DZ_B_PRM_POSITION,
    shadowState,
    onFrame: onAnimationFrame,
    realtime: true,
  });
  const selectedDate = useRef(dateState);
  selectedDate.current = dateState;
  const subscribeToScene = useCallback(
    (listener: () => void) => subscribeSharedThreeSceneContent(map, listener),
    [map]
  );
  const getCatalogBridgePresent = useCallback(
    () =>
      getSharedThreeSceneRuntimes(map).some(
        (runtime) => runtime.id === "geoportal-catalog-bridge"
      ),
    [map]
  );
  const catalogBridgePresent = useSyncExternalStore(
    subscribeToScene,
    getCatalogBridgePresent,
    () => false
  );

  useEffect(() => {
    if (timeActive) {
      setSettledTimeSignature(null);
      return;
    }
    if (timeSignature === settledTimeSignature) return;
    const timeout = setTimeout(
      () => setSettledTimeSignature(timeSignature),
      1500
    );
    return () => clearTimeout(timeout);
  }, [settledTimeSignature, timeSignature, timeActive]);

  useEffect(() => {
    let cancelled = false;
    setPrintedBoard(null);
    setManifestError(null);
    if (!manifestUrl) {
      setManifestError("Collection-Manifest fehlt");
      return;
    }
    void loadDzbPrmCollection(manifestUrl)
      .then((collection) => {
        if (cancelled) return;
        const board = getPrintedBoardBounds(collection);
        setPrintedBoard({
          bounds: {
            minX: board.min.x,
            maxX: board.max.x,
            minZ: board.min.z,
            maxZ: board.max.z,
          },
          bottomHeightMeters: collection.boardBottomHeightMeters,
        });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setManifestError(
            error instanceof Error ? error.message : String(error)
          );
      });
    return () => {
      cancelled = true;
    };
  }, [manifestUrl]);

  useEffect(() => {
    const updateView = () => {
      const zoom = Math.ceil(map.getZoom() * 4) / 4;
      const scale = Math.max(1, window.devicePixelRatio || 1);
      setView({
        basePixelsPerMeter: (512 * 2 ** zoom * scale) / EARTH_CIRCUMFERENCE,
        bounds: getViewBounds(map),
      });
    };
    updateView();
    map.on("moveend", updateView);
    map.on("resize", updateView);
    return () => {
      map.off("moveend", updateView);
      map.off("resize", updateView);
    };
  }, [map]);

  useEffect(() => {
    const onStyleLoad = () => setStyleReady(false);
    const onIdle = () => {
      if (map.isStyleLoaded()) setStyleReady(true);
    };
    map.on("style.load", onStyleLoad);
    map.on("idle", onIdle);
    onIdle();
    return () => {
      map.off("style.load", onStyleLoad);
      map.off("idle", onIdle);
    };
  }, [map]);

  useEffect(() => {
    appearance.current = { color, intensity };
    if (shadowState.enabled && styleReady && lastImage.current) {
      showImage(map, lastImage.current, appearance.current);
    }
  }, [map, shadowState.enabled, styleReady, color, intensity]);

  useEffect(
    () => () => {
      if (map.getLayer(LAYER_ID) || map.getSource(SOURCE_ID)) removeImage(map);
      capture.current?.dispose();
      capture.current = null;
      cache.current.clear();
      lastImage.current = null;
    },
    [map]
  );

  const visibility = useMemo(
    () => getDzbPrmShadowVisibility(modelState, catalogBridgePresent),
    [catalogBridgePresent, modelState.bridge]
  );

  const contextKey = JSON.stringify([
    assetBaseUrl,
    manifestUrl,
    catalogBridgePresent,
    modelState.bridge,
    modelState.quality,
    textureState.quality,
    textureState.captureProjection ?? "orthographic",
    textureState.cameraHeightMeters ?? DEFAULT_CAPTURE_HEIGHT_METERS,
    view,
  ]);
  // Interactive playback stays responsive even when the still-image mode
  // requests a full sampled sun disc. Video export is a separate path.
  const sunDiscSamples =
    timeActive ||
    timeSignature !== settledTimeSignature ||
    textureState.mode === "hard" ||
    textureState.cameraHeightAdjusting
      ? 1
      : DZB_SHADOW_SUN_DISC_SAMPLES;

  useEffect(() => {
    if (!shadowState.enabled) {
      removeImage(map);
      setTextureState((previous) => ({ ...previous!, status: "idle" }));
      return;
    }
    if (!view || !styleReady) return;
    if (textureState.captureProjection === "perspective" && !printedBoard) {
      setTextureState((previous) => ({
        ...previous!,
        status: manifestError
          ? `Aufnahmefehler: ${manifestError}`
          : "Lade Aufnahmebereich …",
      }));
      return;
    }
    let cancelled = false;
    let pending: ShadowDateState | null = null;
    let running = false;
    const setStatus = (status: string) => {
      setTextureState((previous) =>
        previous?.status === status ? previous : { ...previous!, status }
      );
    };
    const render = async (date: ShadowDateState) => {
      if (cancelled) return;
      const solar = getSolarPosition(date, DZ_B_PRM_POSITION);
      const frameKey = JSON.stringify([
        contextKey,
        solar.azimuthDegrees,
        solar.elevationDegrees,
        sunDiscSamples,
      ]);
      const cached = shadowState.isAnimating
        ? null
        : await cache.current.get(frameKey);
      if (cancelled) return;
      let image = cached;
      if (!image) {
        if (!shadowState.isAnimating || !lastImage.current)
          setStatus("Lade GLB …");
        capture.current ??= createDzbPrmShadowCapture();
        image = await capture.current.render({
          assetBaseUrl: `${assetBaseUrl.replace(/\/$/, "")}/${
            modelState.quality
          }`,
          visibility,
          sunAzimuthDegrees: solar.azimuthDegrees,
          sunElevationDegrees: solar.elevationDegrees,
          pixelsPerMeter:
            view.basePixelsPerMeter * (textureState.quality === "8k" ? 8 : 4),
          maxImageDimension: textureState.quality === "8k" ? 8192 : 4096,
          outputSize:
            textureState.captureProjection === "perspective"
              ? textureState.quality === "8k"
                ? { width: 7680, height: 4320 }
                : { width: 3840, height: 2160 }
              : undefined,
          sunDiscSamples: solar.elevationDegrees <= 0 ? 1 : sunDiscSamples,
          viewBounds: view.bounds,
          perspective:
            textureState.captureProjection === "perspective" && printedBoard
              ? {
                  cameraHeightMeters:
                    textureState.cameraHeightMeters ??
                    DEFAULT_CAPTURE_HEIGHT_METERS,
                  boardBottomHeightMeters: printedBoard.bottomHeightMeters,
                  boardBounds: printedBoard.bounds,
                }
              : undefined,
          isCancelled: () => cancelled,
          onProgress: (progress) => {
            if (!cancelled && !shadowState.isAnimating) {
              setTextureState((previous) => ({
                ...previous!,
                status:
                  progress.state === "ready"
                    ? "Berechne Schatten …"
                    : progress.activePartBytes && progress.activePartTotalBytes
                    ? `Lade ${progress.activePartLabel}: ${Math.round(
                        (progress.activePartBytes /
                          progress.activePartTotalBytes) *
                          100
                      )}% (${progress.loaded}/${progress.total})`
                    : `Lade ${progress.loaded}/${progress.total} GLBs …`,
              }));
            }
          },
          onSampleProgress: (sample, total) => {
            if (!cancelled && !shadowState.isAnimating) {
              setTextureState((previous) => ({
                ...previous!,
                status: `Berechne Schatten ${sample}/${total} …`,
              }));
            }
          },
        });
      }
      if (cancelled || !image) return;
      lastImage.current = image;
      showImage(map, image, appearance.current);
      setStatus(
        solar.elevationDegrees <= 0
          ? "night"
          : `${image.canvas.width}×${image.canvas.height}${
              cached ? " Cache" : ""
            }`
      );
      if (!cached && !shadowState.isAnimating)
        void cache.current.put(frameKey, image);
    };
    // Decision: latest-only frames, independent wall-clock time; see
    // apps/geoportal/scripts/README.dz-b-prm.md#animation-clock.
    const enqueue = (date: ShadowDateState) => {
      pending = date;
      if (running || cancelled) return;
      running = true;
      renderQueue.current = renderQueue.current
        .then(async () => {
          while (pending && !cancelled) {
            const next = pending;
            pending = null;
            await render(next);
          }
        })
        .catch((error: unknown) => {
          pending = null;
          if (!cancelled) {
            console.error("[shadowTexture]", error);
            setStatus(
              error instanceof Error ? error.message : "Schattenfehler"
            );
          }
        })
        .finally(() => {
          running = false;
          if (pending && !cancelled) enqueue(pending);
        });
    };
    requestCapture.current = enqueue;
    enqueue(animatedDate.current ?? selectedDate.current);
    return () => {
      cancelled = true;
      pending = null;
      if (requestCapture.current === enqueue) requestCapture.current = null;
    };
  }, [
    assetBaseUrl,
    contextKey,
    map,
    modelState.quality,
    printedBoard,
    manifestError,
    setTextureState,
    shadowState,
    styleReady,
    textureState.quality,
    textureState.captureProjection,
    textureState.cameraHeightMeters,
    textureState.cameraHeightAdjusting,
    sunDiscSamples,
    view,
    visibility,
    animatedDate,
  ]);

  useEffect(() => {
    if (!shadowState.isAnimating)
      requestCapture.current?.(animatedDate.current ?? dateState);
  }, [animatedDate, dateState, shadowState.isAnimating]);

  return null;
};
