import { useCallback, useMemo, type MutableRefObject } from "react";

import { Viewer } from "cesium";

import {
  CesiumTerrainProvider,
  ImageryProvider,
  EllipsoidTerrainProvider,
  ImageryLayer,
  Cesium3DTileset,
  Scene,
  isValidScene,
} from "@carma/cesium";

import {
  isValidViewer as isValidViewerNoCtx,
  withValidViewer,
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
  viewerRef: MutableRefObject<Viewer | null>,
  imageryLayerRef: MutableRefObject<ImageryLayer | null>,
  primaryTilesetRef: MutableRefObject<Cesium3DTileset | null>,
  secondaryTilesetRef: MutableRefObject<Cesium3DTileset | null>,
  terrainProviderRef: MutableRefObject<CesiumTerrainProvider | null>,
  ellipsoidTerrainProviderRef: MutableRefObject<EllipsoidTerrainProvider | null>,
  surfaceProviderRef: MutableRefObject<CesiumTerrainProvider | null>
) => {
  const withViewer = useCallback(
    (cb: (viewer: Viewer) => void): boolean =>
      withValidViewer(viewerRef.current, cb),
    [viewerRef]
  );

  const isValidViewer = useCallback(
    () => isValidViewerNoCtx(viewerRef.current),
    [viewerRef]
  );

  const withCamera = useCallback(
    (cb) => withViewer((viewer) => cb(viewer.camera, viewer)),
    [withViewer]
  );
  const withCanvas = useCallback(
    (cb) => withViewer((viewer) => cb(viewer.canvas, viewer)),
    [withViewer]
  );
  const withScene = useCallback(
    (cb) => withViewer((viewer) => cb(viewer.scene, viewer)),
    [withViewer]
  );
  const withEntities = useCallback(
    (cb) => withViewer((viewer) => cb(viewer.entities, viewer)),
    [withViewer]
  );

  const withImageryLayerRef = useCallback(
    (
      imageryLayerRef: MutableRefObject<ImageryLayer | null>,
      cb: (imageryLayer: ImageryLayer, scene: Scene) => void
    ): boolean => {
      if (
        isValidViewerNoCtx(viewerRef.current) &&
        isValidScene(viewerRef.current.scene) &&
        isValidImageryLayer(imageryLayerRef.current)
      ) {
        cb(imageryLayerRef.current, viewerRef.current.scene);
        return true;
      }
      return false;
    },
    [viewerRef]
  );

  const withTerrainProviderRef = useCallback(
    (
      terrainProviderRef: MutableRefObject<CesiumTerrainProvider | null>,
      cb: (terrainProvider: CesiumTerrainProvider, viewer: Viewer) => void
    ): boolean => {
      if (
        isValidViewerNoCtx(viewerRef.current) &&
        isValidCesiumTerrainProvider(terrainProviderRef.current)
      ) {
        cb(terrainProviderRef.current, viewerRef.current);
        return true;
      }
      return false;
    },
    [viewerRef]
  );

  const withEllipsoidTerrainProviderRef = useCallback(
    (
      ellipsoidTerrainProviderRef: MutableRefObject<EllipsoidTerrainProvider | null>,
      cb: (
        ellipsoidTerrainProvider: EllipsoidTerrainProvider,
        viewer: Viewer
      ) => void
    ): boolean => {
      if (
        isValidViewerNoCtx(viewerRef.current) &&
        isValidEllipsoidTerrainProvider(ellipsoidTerrainProviderRef.current)
      ) {
        cb(ellipsoidTerrainProviderRef.current, viewerRef.current);
        return true;
      }
      return false;
    },
    [viewerRef]
  );

  const withTilesetRef = useCallback(
    (
      tilesetRef: MutableRefObject<Cesium3DTileset | null>,
      cb: (tileset: Cesium3DTileset, viewer: Viewer) => void
    ): boolean => {
      if (
        isValidViewerNoCtx(viewerRef.current) &&
        isValidTileset(tilesetRef.current)
      ) {
        cb(tilesetRef.current, viewerRef.current);
        return true;
      }
      return false;
    },
    [viewerRef]
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
      withTilesetRef(primaryTilesetRef, (tileset, viewer) =>
        cb(tileset, viewer)
      ),
    [primaryTilesetRef, withTilesetRef]
  );
  const withSecondaryTileset = useCallback(
    (cb) =>
      withTilesetRef(secondaryTilesetRef, (tileset, viewer) =>
        cb(tileset, viewer)
      ),
    [secondaryTilesetRef, withTilesetRef]
  );
  const withEllipsoidTerrainProvider = useCallback(
    (cb) =>
      withEllipsoidTerrainProviderRef(
        ellipsoidTerrainProviderRef,
        (provider, viewer) => cb(provider, viewer)
      ),
    [ellipsoidTerrainProviderRef, withEllipsoidTerrainProviderRef]
  );
  const withTerrainProvider = useCallback(
    (cb) =>
      withTerrainProviderRef(terrainProviderRef, (provider, viewer) =>
        cb(provider, viewer)
      ),
    [terrainProviderRef, withTerrainProviderRef]
  );
  const withSurfaceProvider = useCallback(
    (cb) =>
      withTerrainProviderRef(surfaceProviderRef, (provider, viewer) =>
        cb(provider, viewer)
      ),
    [surfaceProviderRef, withTerrainProviderRef]
  );

  // Direct getters for terrain providers (don't require viewer)
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
      withViewer,
      isValidViewer,
      withScene,
      withCamera,
      withCanvas,
      withEntities,
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
      withViewer,
      isValidViewer,
      withScene,
      withCamera,
      withCanvas,
      withEntities,
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
