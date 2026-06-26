import { useCallback, useMemo, type MutableRefObject } from "react";

import {
  CesiumWidget,
  CesiumTerrainProvider,
  ImageryProvider,
  EllipsoidTerrainProvider,
  ImageryLayer,
  Cesium3DTileset,
  type Scene,
  type Camera,
} from "@carma-cesium";

import {
  DEFAULT_IMAGERY_LAYER_ID,
  DEFAULT_SURFACE_PROVIDER_ID,
  DEFAULT_TERRAIN_PROVIDER_ID,
} from "../utils/cesiumProviders";
import {
  isValidCesiumWidget as isValidRuntimeNoCtx,
  isValidImageryLayer,
  isValidTileset,
  isValidCesiumTerrainProvider,
} from "../utils/instanceGates";
export type KnownProviders =
  | CesiumTerrainProvider
  | ImageryProvider
  | EllipsoidTerrainProvider;

// Return-value-first guarded access. Each `withX` runs the callback ONLY when
// the runtime (and the requested resource) is valid, and returns the callback's
// value — or `undefined` when invalid. SYNCHRONOUS-ENTRY-ONLY: the validity is
// checked at entry and is NOT guaranteed across an `await`; for async work
// re-acquire via a fresh withX/getScene after each await and bail on undefined.
export const useValidInstances = (
  runtimeRef: MutableRefObject<CesiumWidget | null>,
  imageryLayerRefsByIdRef: MutableRefObject<
    Record<string, ImageryLayer | null | undefined>
  >,
  tilesetRefsByIdRef: MutableRefObject<
    Record<string, Cesium3DTileset | null | undefined>
  >,
  terrainProviderRefsByIdRef: MutableRefObject<
    Record<string, CesiumTerrainProvider | null | undefined>
  >,
  terrainProviderId: string = DEFAULT_TERRAIN_PROVIDER_ID,
  surfaceProviderId: string = DEFAULT_SURFACE_PROVIDER_ID
) => {
  const isValidRuntime = useCallback(
    () => isValidRuntimeNoCtx(runtimeRef.current),
    [runtimeRef]
  );

  const withRuntime = useCallback(
    <T>(cb: (runtime: CesiumWidget) => T): T | undefined =>
      isValidRuntimeNoCtx(runtimeRef.current)
        ? cb(runtimeRef.current)
        : undefined,
    [runtimeRef]
  );

  const withScene = useCallback(
    <T>(cb: (scene: Scene, runtime: CesiumWidget) => T): T | undefined =>
      withRuntime((runtime) => cb(runtime.scene, runtime)),
    [withRuntime]
  );
  const withCamera = useCallback(
    <T>(cb: (camera: Camera, runtime: CesiumWidget) => T): T | undefined =>
      withRuntime((runtime) => cb(runtime.camera, runtime)),
    [withRuntime]
  );

  const getImageryLayerById = useCallback(
    (id: string): ImageryLayer | null => {
      const layer = imageryLayerRefsByIdRef.current[id];
      return isValidImageryLayer(layer) ? layer : null;
    },
    [imageryLayerRefsByIdRef]
  );

  const getImageryLayer = useCallback(
    () => getImageryLayerById(DEFAULT_IMAGERY_LAYER_ID),
    [getImageryLayerById]
  );

  const withImageryLayerById = useCallback(
    <T>(
      id: string,
      cb: (imageryLayer: ImageryLayer, scene: Scene) => T
    ): T | undefined => {
      const layer = getImageryLayerById(id);
      return isValidRuntimeNoCtx(runtimeRef.current) && layer
        ? cb(layer, runtimeRef.current.scene)
        : undefined;
    },
    [runtimeRef, getImageryLayerById]
  );

  const withImageryLayer = useCallback(
    <T>(cb: (imageryLayer: ImageryLayer, scene: Scene) => T): T | undefined =>
      withImageryLayerById(DEFAULT_IMAGERY_LAYER_ID, cb),
    [withImageryLayerById]
  );

  const withTileset = useCallback(
    <T>(
      id: string,
      cb: (tileset: Cesium3DTileset, runtime: CesiumWidget) => T
    ): T | undefined => {
      const tileset = tilesetRefsByIdRef.current[id];
      return isValidRuntimeNoCtx(runtimeRef.current) && isValidTileset(tileset)
        ? cb(tileset, runtimeRef.current)
        : undefined;
    },
    [runtimeRef, tilesetRefsByIdRef]
  );

  const getTerrainProviderById = useCallback(
    (id: string): CesiumTerrainProvider | null => {
      const provider = terrainProviderRefsByIdRef.current[id];
      return isValidCesiumTerrainProvider(provider) ? provider : null;
    },
    [terrainProviderRefsByIdRef]
  );

  const getTerrainProvider = useCallback(
    () => getTerrainProviderById(terrainProviderId),
    [getTerrainProviderById, terrainProviderId]
  );

  const getSurfaceProvider = useCallback(
    () =>
      getTerrainProviderById(surfaceProviderId) ??
      getTerrainProviderById(terrainProviderId),
    [getTerrainProviderById, surfaceProviderId, terrainProviderId]
  );

  const withTerrainProviderById = useCallback(
    <T>(
      id: string,
      cb: (provider: CesiumTerrainProvider, runtime: CesiumWidget) => T
    ): T | undefined => {
      const provider = getTerrainProviderById(id);
      return isValidRuntimeNoCtx(runtimeRef.current) && provider
        ? cb(provider, runtimeRef.current)
        : undefined;
    },
    [runtimeRef, getTerrainProviderById]
  );

  const withTerrainProvider = useCallback(
    <T>(cb: (provider: CesiumTerrainProvider, runtime: CesiumWidget) => T) =>
      withTerrainProviderById(terrainProviderId, cb),
    [withTerrainProviderById, terrainProviderId]
  );

  const withSurfaceProvider = useCallback(
    <T>(
      cb: (provider: CesiumTerrainProvider, runtime: CesiumWidget) => T
    ): T | undefined => {
      const provider = getSurfaceProvider();
      return isValidRuntimeNoCtx(runtimeRef.current) && provider
        ? cb(provider, runtimeRef.current)
        : undefined;
    },
    [runtimeRef, getSurfaceProvider]
  );

  return useMemo(
    () => ({
      isValidRuntime,
      withRuntime,
      withScene,
      withCamera,
      getImageryLayer,
      getImageryLayerById,
      withImageryLayer,
      withImageryLayerById,
      withTileset,
      getTerrainProvider,
      getSurfaceProvider,
      getTerrainProviderById,
      withTerrainProvider,
      withTerrainProviderById,
      withSurfaceProvider,
    }),
    [
      isValidRuntime,
      withRuntime,
      withScene,
      withCamera,
      getImageryLayer,
      getImageryLayerById,
      withImageryLayer,
      withImageryLayerById,
      withTileset,
      getTerrainProvider,
      getSurfaceProvider,
      getTerrainProviderById,
      withTerrainProvider,
      withTerrainProviderById,
      withSurfaceProvider,
    ]
  );
};
