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
  advanceShadowAnimationFrame,
  getSolarPosition,
  type ShadowDateState,
  type ShadowSimulationState,
} from "@carma-mapping/shadow-simulation/core";

import type { ShadowTextureState } from ".";
import type { ModelCollectionState } from "../ModelCollection";
import { getDzbPrmShadowVisibility } from "./shadow-texture-assets";
import { DZ_B_PRM_POSITION } from "./shadow-texture-georef";
import {
  createDzbPrmShadowCapture,
  createDzbPrmShadowFrameCache,
  DZB_SHADOW_SUN_DISC_SAMPLES,
  type DzbPrmShadowImage,
  type DzbPrmShadowViewBounds,
} from "./shadow-texture-capture";

const SOURCE_ID = "__shadow_texture_canvas__";
const LAYER_ID = "__shadow_texture_raster__";

const removeImage = (map: MaplibreMap) => {
  if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
};

const showImage = (map: MaplibreMap, image: DzbPrmShadowImage) => {
  if (!map.isStyleLoaded()) return;
  removeImage(map);
  map.addSource(SOURCE_ID, {
    type: "canvas",
    canvas: image.canvas,
    coordinates: image.coordinates,
    animate: false,
  });
  map.addLayer({
    id: LAYER_ID,
    type: "raster",
    source: SOURCE_ID,
    paint: { "raster-fade-duration": 0 },
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
  pixelsPerMeter: number;
  bounds: DzbPrmShadowViewBounds;
}>;

export const ShadowTextureRuntime = ({
  assetBaseUrl,
  map,
  shadowState,
  dateState,
  textureState,
  modelState,
  setTextureState,
  setDateState,
}: {
  assetBaseUrl: string;
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
  const [styleReady, setStyleReady] = useState(false);
  const capture = useRef<ReturnType<typeof createDzbPrmShadowCapture> | null>(
    null
  );
  const cache = useRef(createDzbPrmShadowFrameCache());
  const renderQueue = useRef<Promise<void>>(Promise.resolve());
  const lastImage = useRef<DzbPrmShadowImage | null>(null);
  const subscribeToScene = useCallback(
    (listener: () => void) => subscribeSharedThreeSceneContent(map, listener),
    [map]
  );
  const getCatalogBridgeVisible = useCallback(
    () =>
      getSharedThreeSceneRuntimes(map).some(
        (runtime) => runtime.id === "geoportal-catalog-bridge"
      ),
    [map]
  );
  const catalogBridgeVisible = useSyncExternalStore(
    subscribeToScene,
    getCatalogBridgeVisible,
    () => false
  );

  useEffect(() => {
    const updateView = () => {
      const zoom = Math.ceil(map.getZoom() * 4) / 4;
      const scale = Math.max(1, window.devicePixelRatio || 1);
      const samplesPerDisplayPixel = textureState.quality === "8k" ? 8 : 4;
      setView({
        pixelsPerMeter:
          (512 * 2 ** zoom * scale * samplesPerDisplayPixel) /
          EARTH_CIRCUMFERENCE,
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
  }, [map, textureState.quality]);

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
    if (shadowState.enabled && styleReady && lastImage.current) {
      showImage(map, lastImage.current);
    }
  }, [map, shadowState.enabled, styleReady]);

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
    () => getDzbPrmShadowVisibility(modelState, catalogBridgeVisible),
    [catalogBridgeVisible, modelState]
  );

  const contextKey = JSON.stringify([
    assetBaseUrl,
    catalogBridgeVisible,
    modelState.bridge,
    modelState.quality,
    modelState.visible,
    textureState.quality,
    view,
  ]);
  // Interactive playback stays responsive even when the still-image mode
  // requests a full sampled sun disc. Video export is a separate path.
  const sunDiscSamples =
    shadowState.isAnimating || textureState.mode === "hard"
      ? 1
      : DZB_SHADOW_SUN_DISC_SAMPLES;

  useEffect(() => {
    if (!shadowState.enabled) {
      removeImage(map);
      setTextureState((previous) => ({ ...previous!, status: "idle" }));
      return;
    }
    if (!modelState.visible) {
      removeImage(map);
      lastImage.current = null;
      setTextureState((previous) => ({ ...previous!, status: "Kein Modell" }));
      return;
    }
    if (!view || !styleReady) return;
    const solar = getSolarPosition(dateState, DZ_B_PRM_POSITION);
    if (solar.elevationDegrees <= 0) {
      removeImage(map);
      setTextureState((previous) => ({ ...previous!, status: "night" }));
      return;
    }
    let cancelled = false;
    let animationTimer: ReturnType<typeof setTimeout> | undefined;
    const frameKey = JSON.stringify([
      contextKey,
      solar.azimuthDegrees,
      solar.elevationDegrees,
      sunDiscSamples,
    ]);
    const render = async () => {
      const cached = await cache.current.get(frameKey);
      if (cancelled) return;
      let image = cached;
      if (!image) {
        setTextureState((previous) => ({ ...previous!, status: "Lade GLB …" }));
        capture.current ??= createDzbPrmShadowCapture();
        image = await capture.current.render({
          assetBaseUrl: `${assetBaseUrl.replace(/\/$/, "")}/${
            modelState.quality
          }`,
          visibility,
          sunAzimuthDegrees: solar.azimuthDegrees,
          sunElevationDegrees: solar.elevationDegrees,
          pixelsPerMeter: view.pixelsPerMeter,
          maxImageDimension: textureState.quality === "8k" ? 8192 : 4096,
          sunDiscSamples,
          viewBounds: view.bounds,
          isCancelled: () => cancelled,
          onProgress: (progress) => {
            if (!cancelled) {
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
            if (!cancelled) {
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
      showImage(map, image);
      setTextureState((previous) => ({
        ...previous!,
        status: `${image.canvas.width}×${image.canvas.height}${
          cached ? " Cache" : ""
        }`,
      }));
      if (!cached) void cache.current.put(frameKey, image);
      if (shadowState.isAnimating) {
        animationTimer = setTimeout(() => {
          const next = advanceShadowAnimationFrame(
            shadowState,
            dateState,
            dateState,
            DZ_B_PRM_POSITION,
            0
          );
          setDateState(next.dateState);
        }, 250);
      }
    };
    renderQueue.current = renderQueue.current
      .then(render)
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("[shadowTexture]", error);
          setTextureState((previous) => ({
            ...previous!,
            status: error instanceof Error ? error.message : "Schattenfehler",
          }));
        }
      });
    return () => {
      cancelled = true;
      if (animationTimer) clearTimeout(animationTimer);
    };
  }, [
    assetBaseUrl,
    contextKey,
    dateState,
    map,
    modelState.quality,
    modelState.visible,
    setDateState,
    setTextureState,
    shadowState,
    styleReady,
    textureState.quality,
    sunDiscSamples,
    view,
    visibility,
  ]);

  return null;
};
