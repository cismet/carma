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
  imageryLayerRef: MutableRefObject<ImageryLayer | null>,
  primaryTilesetRef: MutableRefObject<Cesium3DTileset | null>,
  secondaryTilesetRef: MutableRefObject<Cesium3DTileset | null>,
  terrainProviderRef: MutableRefObject<CesiumTerrainProvider | null>,
  surfaceProviderRef: MutableRefObject<CesiumTerrainProvider | null>
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

  const withImageryLayer = useCallback(
    <T>(cb: (imageryLayer: ImageryLayer, scene: Scene) => T): T | undefined =>
      isValidRuntimeNoCtx(runtimeRef.current) &&
      isValidImageryLayer(imageryLayerRef.current)
        ? cb(imageryLayerRef.current, runtimeRef.current.scene)
        : undefined,
    [runtimeRef, imageryLayerRef]
  );

  // Private validated-tileset access; the primary/secondary wrappers are the
  // public surface (no ref-builder is exposed).
  const withTileset = useCallback(
    <T>(
      tilesetRef: MutableRefObject<Cesium3DTileset | null>,
      cb: (tileset: Cesium3DTileset, runtime: CesiumWidget) => T
    ): T | undefined =>
      isValidRuntimeNoCtx(runtimeRef.current) &&
      isValidTileset(tilesetRef.current)
        ? cb(tilesetRef.current, runtimeRef.current)
        : undefined,
    [runtimeRef]
  );
  const withPrimaryTileset = useCallback(
    <T>(cb: (tileset: Cesium3DTileset, runtime: CesiumWidget) => T) =>
      withTileset(primaryTilesetRef, cb),
    [withTileset, primaryTilesetRef]
  );
  const withSecondaryTileset = useCallback(
    <T>(cb: (tileset: Cesium3DTileset, runtime: CesiumWidget) => T) =>
      withTileset(secondaryTilesetRef, cb),
    [withTileset, secondaryTilesetRef]
  );

  const withProvider = useCallback(
    <T>(
      providerRef: MutableRefObject<CesiumTerrainProvider | null>,
      cb: (provider: CesiumTerrainProvider, runtime: CesiumWidget) => T
    ): T | undefined =>
      isValidRuntimeNoCtx(runtimeRef.current) &&
      isValidCesiumTerrainProvider(providerRef.current)
        ? cb(providerRef.current, runtimeRef.current)
        : undefined,
    [runtimeRef]
  );
  const withTerrainProvider = useCallback(
    <T>(cb: (provider: CesiumTerrainProvider, runtime: CesiumWidget) => T) =>
      withProvider(terrainProviderRef, cb),
    [withProvider, terrainProviderRef]
  );
  const withSurfaceProvider = useCallback(
    <T>(cb: (provider: CesiumTerrainProvider, runtime: CesiumWidget) => T) =>
      withProvider(surfaceProviderRef, cb),
    [withProvider, surfaceProviderRef]
  );

  return useMemo(
    () => ({
      isValidRuntime,
      withRuntime,
      withScene,
      withCamera,
      withImageryLayer,
      withPrimaryTileset,
      withSecondaryTileset,
      withTerrainProvider,
      withSurfaceProvider,
    }),
    [
      isValidRuntime,
      withRuntime,
      withScene,
      withCamera,
      withImageryLayer,
      withPrimaryTileset,
      withSecondaryTileset,
      withTerrainProvider,
      withSurfaceProvider,
    ]
  );
};
