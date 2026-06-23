import { useCallback, useMemo, type MutableRefObject } from "react";

import {
  CesiumWidget,
  CesiumTerrainProvider,
  ImageryProvider,
  EllipsoidTerrainProvider,
  ImageryLayer,
  Cesium3DTileset,
  Scene,
} from "@carma-cesium";
import { isValidScene } from "@carma-mapping/engines/cesium/core";

import {
  isValidCesiumWidget as isValidRuntimeNoCtx,
  withValidCesiumWidget,
  isValidImageryLayer,
  isValidTileset,
  isValidCesiumTerrainProvider,
  isValidEllipsoidTerrainProvider,
} from "../utils/instanceGates";
export type KnownProviders =
  | CesiumTerrainProvider
  | ImageryProvider
  | EllipsoidTerrainProvider;

export const useValidInstances = (
  runtimeRef: MutableRefObject<CesiumWidget | null>,
  imageryLayerRef: MutableRefObject<ImageryLayer | null>,
  primaryTilesetRef: MutableRefObject<Cesium3DTileset | null>,
  secondaryTilesetRef: MutableRefObject<Cesium3DTileset | null>,
  terrainProviderRef: MutableRefObject<CesiumTerrainProvider | null>,
  ellipsoidTerrainProviderRef: MutableRefObject<EllipsoidTerrainProvider | null>,
  surfaceProviderRef: MutableRefObject<CesiumTerrainProvider | null>
) => {
  const withRuntime = useCallback(
    (cb: (runtime: CesiumWidget) => void): boolean =>
      withValidCesiumWidget(runtimeRef.current, cb),
    [runtimeRef]
  );

  const isValidRuntime = useCallback(
    () => isValidRuntimeNoCtx(runtimeRef.current),
    [runtimeRef]
  );

  const withCamera = useCallback(
    (cb) => withRuntime((runtime) => cb(runtime.camera, runtime)),
    [withRuntime]
  );
  const withCanvas = useCallback(
    (cb) => withRuntime((runtime) => cb(runtime.canvas, runtime)),
    [withRuntime]
  );
  const withScene = useCallback(
    (cb) => withRuntime((runtime) => cb(runtime.scene, runtime)),
    [withRuntime]
  );

  const withImageryLayerRef = useCallback(
    (
      imageryLayerRef: MutableRefObject<ImageryLayer | null>,
      cb: (imageryLayer: ImageryLayer, scene: Scene) => void
    ): boolean => {
      if (
        isValidRuntimeNoCtx(runtimeRef.current) &&
        isValidScene(runtimeRef.current.scene) &&
        isValidImageryLayer(imageryLayerRef.current)
      ) {
        cb(imageryLayerRef.current, runtimeRef.current.scene);
        return true;
      }
      return false;
    },
    [runtimeRef]
  );

  const withTerrainProviderRef = useCallback(
    (
      terrainProviderRef: MutableRefObject<CesiumTerrainProvider | null>,
      cb: (
        terrainProvider: CesiumTerrainProvider,
        runtime: CesiumWidget
      ) => void
    ): boolean => {
      if (
        isValidRuntimeNoCtx(runtimeRef.current) &&
        isValidCesiumTerrainProvider(terrainProviderRef.current)
      ) {
        cb(terrainProviderRef.current, runtimeRef.current);
        return true;
      }
      return false;
    },
    [runtimeRef]
  );

  const withEllipsoidTerrainProviderRef = useCallback(
    (
      ellipsoidTerrainProviderRef: MutableRefObject<EllipsoidTerrainProvider | null>,
      cb: (
        ellipsoidTerrainProvider: EllipsoidTerrainProvider,
        runtime: CesiumWidget
      ) => void
    ): boolean => {
      if (
        isValidRuntimeNoCtx(runtimeRef.current) &&
        isValidEllipsoidTerrainProvider(ellipsoidTerrainProviderRef.current)
      ) {
        cb(ellipsoidTerrainProviderRef.current, runtimeRef.current);
        return true;
      }
      return false;
    },
    [runtimeRef]
  );

  const withTilesetRef = useCallback(
    (
      tilesetRef: MutableRefObject<Cesium3DTileset | null>,
      cb: (tileset: Cesium3DTileset, runtime: CesiumWidget) => void
    ): boolean => {
      if (
        isValidRuntimeNoCtx(runtimeRef.current) &&
        isValidTileset(tilesetRef.current)
      ) {
        cb(tilesetRef.current, runtimeRef.current);
        return true;
      }
      return false;
    },
    [runtimeRef]
  );

  const withImageryLayer = useCallback(
    (cb) =>
      withImageryLayerRef(imageryLayerRef, (imageryLayer, scene) =>
        cb(imageryLayer, scene)
      ),
    [imageryLayerRef, withImageryLayerRef]
  );
  const withPrimaryTileset = useCallback(
    (cb) =>
      withTilesetRef(primaryTilesetRef, (tileset, runtime) =>
        cb(tileset, runtime)
      ),
    [primaryTilesetRef, withTilesetRef]
  );
  const withSecondaryTileset = useCallback(
    (cb) =>
      withTilesetRef(secondaryTilesetRef, (tileset, runtime) =>
        cb(tileset, runtime)
      ),
    [secondaryTilesetRef, withTilesetRef]
  );
  const withEllipsoidTerrainProvider = useCallback(
    (cb) =>
      withEllipsoidTerrainProviderRef(
        ellipsoidTerrainProviderRef,
        (provider, runtime) => cb(provider, runtime)
      ),
    [ellipsoidTerrainProviderRef, withEllipsoidTerrainProviderRef]
  );
  const withTerrainProvider = useCallback(
    (cb) =>
      withTerrainProviderRef(terrainProviderRef, (provider, runtime) =>
        cb(provider, runtime)
      ),
    [terrainProviderRef, withTerrainProviderRef]
  );
  const withSurfaceProvider = useCallback(
    (cb) =>
      withTerrainProviderRef(surfaceProviderRef, (provider, runtime) =>
        cb(provider, runtime)
      ),
    [surfaceProviderRef, withTerrainProviderRef]
  );

  // Direct getters for terrain providers (don't require runtime)
  const getTerrainProvider = useCallback(
    (): CesiumTerrainProvider | null => terrainProviderRef.current,
    [terrainProviderRef]
  );

  const getSurfaceProvider = useCallback(
    (): CesiumTerrainProvider | null => surfaceProviderRef.current,
    [surfaceProviderRef]
  );

  return useMemo(
    () => ({
      withRuntime,
      isValidRuntime,
      withScene,
      withCamera,
      withCanvas,
      withImageryLayerRef,
      withTerrainProviderRef,
      withEllipsoidTerrainProviderRef,
      withTilesetRef,
      withImageryLayer,
      withPrimaryTileset,
      withSecondaryTileset,
      withEllipsoidTerrainProvider,
      withTerrainProvider,
      withSurfaceProvider,
      getTerrainProvider,
      getSurfaceProvider,
    }),
    [
      withRuntime,
      isValidRuntime,
      withScene,
      withCamera,
      withCanvas,
      withImageryLayerRef,
      withTerrainProviderRef,
      withEllipsoidTerrainProviderRef,
      withTilesetRef,
      withImageryLayer,
      withPrimaryTileset,
      withSecondaryTileset,
      withEllipsoidTerrainProvider,
      withTerrainProvider,
      withSurfaceProvider,
      getTerrainProvider,
      getSurfaceProvider,
    ]
  );
};
