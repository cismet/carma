import { useCallback, type MutableRefObject } from "react";
import {
  Camera,
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  EntityCollection,
  ImageryLayer,
  ImageryProvider,
  Scene,
  Viewer,
  Cesium3DTileset,
} from "cesium";

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

export type ViewerCallback = (viewer: Viewer) => void;
export type CameraCallback = (camera: Camera, viewer: Viewer) => void;
export type CanvasCallback = (
  canvas: HTMLCanvasElement,
  viewer: Viewer
) => void;
export type SceneCallback = (scene: Scene, viewer: Viewer) => void;
export type EntitiesCallback = (
  entities: EntityCollection,
  viewer: Viewer
) => void;
export type ImageryLayerCallback = (
  imageryLayer: ImageryLayer,
  viewer: Viewer
) => void;
export type TilesetCallback = (
  tileset: Cesium3DTileset,
  viewer: Viewer
) => void;
export type TerrainProviderCallback = (
  provider: CesiumTerrainProvider,
  viewer: Viewer
) => void;
export type EllipsoidTerrainProviderCallback = (
  provider: EllipsoidTerrainProvider,
  viewer: Viewer
) => void;

export type WithCallback<TCallback> = (cb: TCallback, label?: string) => void;

export type WithAsyncCallback<TCallback> = (
  cb: TCallback,
  label?: string
) => Promise<void>;

export type TerrainProviderAsyncCallback = (
  provider: CesiumTerrainProvider,
  viewer: Viewer
) => Promise<void>;

export type ElevationProvidersAsyncCallback = (
  terrainProvider: CesiumTerrainProvider,
  surfaceProvider: CesiumTerrainProvider,
  viewer: Viewer
) => Promise<void>;

export type WithElevationProvidersAsyncCallback = (
  cb: ElevationProvidersAsyncCallback,
  label?: string
) => Promise<void>;

type WithRefCallback<TInstance, TCallback> = (
  ref: MutableRefObject<TInstance | null>,
  cb: TCallback,
  label?: string
) => void;

type WithRefAsyncCallback<TInstance, TCallback> = (
  ref: MutableRefObject<TInstance | null>,
  cb: TCallback,
  label?: string
) => Promise<void>;

export const useValidInstances = (
  viewerRef: MutableRefObject<Viewer | null>,
  imageryLayerRef: MutableRefObject<ImageryLayer | null>,
  primaryTilesetRef: MutableRefObject<Cesium3DTileset | null>,
  secondaryTilesetRef: MutableRefObject<Cesium3DTileset | null>,
  terrainProviderRef: MutableRefObject<CesiumTerrainProvider | null>,
  ellipsoidTerrainProviderRef: MutableRefObject<EllipsoidTerrainProvider | null>,
  surfaceProviderRef: MutableRefObject<CesiumTerrainProvider | null>
) => {
  const withViewer = useCallback<WithCallback<ViewerCallback>>(
    (cb, label = "withViewer") => {
      try {
        withValidViewer(viewerRef.current, cb);
      } catch (error) {
        console.error(`[VIEWER|CALLBACK] ${label} failed`, error);
      }
    },
    [viewerRef]
  );

  const isValidViewer = useCallback(
    () => isValidViewerNoCtx(viewerRef.current),
    [viewerRef]
  );

  const withCamera = useCallback<WithCallback<CameraCallback>>(
    (cb, label = "withCamera") =>
      withViewer((viewer) => cb(viewer.scene.camera, viewer), label),
    [withViewer]
  );
  const withCanvas = useCallback<WithCallback<CanvasCallback>>(
    (cb, label = "withCanvas") =>
      withViewer((viewer) => cb(viewer.scene.canvas, viewer), label),
    [withViewer]
  );
  const withScene = useCallback<WithCallback<SceneCallback>>(
    (cb, label = "withScene") =>
      withViewer((viewer) => cb(viewer.scene, viewer), label),
    [withViewer]
  );
  const withEntities = useCallback<WithCallback<EntitiesCallback>>(
    (cb, label = "withEntities") =>
      withViewer((viewer) => cb(viewer.entities, viewer), label),
    [withViewer]
  );

  const withImageryLayerRef = useCallback<
    WithRefCallback<ImageryLayer, ImageryLayerCallback>
  >(
    (imageryLayerRef, cb, label = "withImageryLayerRef") => {
      if (
        isValidViewerNoCtx(viewerRef.current) &&
        isValidImageryLayer(imageryLayerRef.current)
      ) {
        try {
          cb(imageryLayerRef.current, viewerRef.current);
        } catch (error) {
          console.error(`[IMAGERY_LAYER|CALLBACK] ${label} failed`, error);
        }
      }
    },
    [viewerRef]
  );

  const withTerrainProviderRef = useCallback<
    WithRefCallback<CesiumTerrainProvider, TerrainProviderCallback>
  >(
    (terrainProviderRef, cb, label = "withTerrainProviderRef") => {
      if (
        isValidViewerNoCtx(viewerRef.current) &&
        isValidCesiumTerrainProvider(terrainProviderRef.current)
      ) {
        try {
          cb(terrainProviderRef.current, viewerRef.current);
        } catch (error) {
          console.error(`[TERRAIN_PROVIDER|CALLBACK] ${label} failed`, error);
        }
      }
    },
    [viewerRef]
  );

  const withTerrainProviderRefAsync = useCallback<
    WithRefAsyncCallback<CesiumTerrainProvider, TerrainProviderAsyncCallback>
  >(
    async (terrainProviderRef, cb, label = "withTerrainProviderRefAsync") => {
      if (
        isValidViewerNoCtx(viewerRef.current) &&
        isValidCesiumTerrainProvider(terrainProviderRef.current)
      ) {
        try {
          await cb(terrainProviderRef.current, viewerRef.current);
        } catch (error) {
          console.error(`[TERRAIN_PROVIDER|CALLBACK] ${label} failed`, error);
        }
      }
    },
    [viewerRef]
  );

  const withEllipsoidTerrainProviderRef = useCallback<
    WithRefCallback<EllipsoidTerrainProvider, EllipsoidTerrainProviderCallback>
  >(
    (
      ellipsoidTerrainProviderRef,
      cb,
      label = "withEllipsoidTerrainProviderRef"
    ) => {
      if (
        isValidViewerNoCtx(viewerRef.current) &&
        isValidEllipsoidTerrainProvider(ellipsoidTerrainProviderRef.current)
      ) {
        try {
          cb(ellipsoidTerrainProviderRef.current, viewerRef.current);
        } catch (error) {
          console.error(
            `[ELLIPSOID_TERRAIN_PROVIDER|CALLBACK] ${label} failed`,
            error
          );
        }
      }
    },
    [viewerRef]
  );

  const withTilesetRef = useCallback<
    WithRefCallback<Cesium3DTileset, TilesetCallback>
  >(
    (tilesetRef, cb, label = "withTilesetRef") => {
      if (
        isValidViewerNoCtx(viewerRef.current) &&
        isValidTileset(tilesetRef.current)
      ) {
        try {
          cb(tilesetRef.current, viewerRef.current);
        } catch (error) {
          console.error(`[TILESET|CALLBACK] ${label} failed`, error);
        }
      }
    },
    [viewerRef]
  );

  const withImageryLayer = useCallback<WithCallback<ImageryLayerCallback>>(
    (cb, label = "withImageryLayer") =>
      withImageryLayerRef(
        imageryLayerRef,
        (imageryLayer, viewer) => cb(imageryLayer, viewer),
        label
      ),
    [imageryLayerRef, withImageryLayerRef]
  );
  const withPrimaryTileset = useCallback<WithCallback<TilesetCallback>>(
    (cb, label = "withPrimaryTileset") =>
      withTilesetRef(
        primaryTilesetRef,
        (tileset, viewer) => cb(tileset, viewer),
        label
      ),
    [primaryTilesetRef, withTilesetRef]
  );
  const withSecondaryTileset = useCallback<WithCallback<TilesetCallback>>(
    (cb, label = "withSecondaryTileset") =>
      withTilesetRef(
        secondaryTilesetRef,
        (tileset, viewer) => cb(tileset, viewer),
        label
      ),
    [secondaryTilesetRef, withTilesetRef]
  );
  const withEllipsoidTerrainProvider = useCallback<
    WithCallback<EllipsoidTerrainProviderCallback>
  >(
    (cb, label = "withEllipsoidTerrainProvider") =>
      withEllipsoidTerrainProviderRef(
        ellipsoidTerrainProviderRef,
        (provider, viewer) => cb(provider, viewer),
        label
      ),
    [ellipsoidTerrainProviderRef, withEllipsoidTerrainProviderRef]
  );
  const withTerrainProvider = useCallback<
    WithCallback<TerrainProviderCallback>
  >(
    (cb, label = "withTerrainProvider") =>
      withTerrainProviderRef(
        terrainProviderRef,
        (provider, viewer) => cb(provider, viewer),
        label
      ),
    [terrainProviderRef, withTerrainProviderRef]
  );

  const withTerrainProviderAsync = useCallback<
    WithAsyncCallback<TerrainProviderAsyncCallback>
  >(
    async (cb, label = "withTerrainProviderAsync") =>
      await withTerrainProviderRefAsync(
        terrainProviderRef,
        async (provider, viewer) => await cb(provider, viewer),
        label
      ),
    [terrainProviderRef, withTerrainProviderRefAsync]
  );

  const withSurfaceProvider = useCallback<
    WithCallback<TerrainProviderCallback>
  >(
    (cb, label = "withSurfaceProvider") =>
      withTerrainProviderRef(
        surfaceProviderRef,
        (provider, viewer) => cb(provider, viewer),
        label
      ),
    [surfaceProviderRef, withTerrainProviderRef]
  );

  const withSurfaceProviderAsync = useCallback<
    WithAsyncCallback<TerrainProviderAsyncCallback>
  >(
    async (cb, label = "withSurfaceProviderAsync") =>
      await withTerrainProviderRefAsync(
        surfaceProviderRef,
        async (provider, viewer) => await cb(provider, viewer),
        label
      ),
    [surfaceProviderRef, withTerrainProviderRefAsync]
  );

  const withElevationProvidersAsync: WithElevationProvidersAsyncCallback =
    useCallback(
      async (cb, label = "withElevationProvidersAsync") => {
        const terrainProvider = terrainProviderRef.current;
        const surfaceProvider = surfaceProviderRef.current;
        const viewer = viewerRef.current;
        if (
          isValidViewerNoCtx(viewer) &&
          isValidCesiumTerrainProvider(terrainProvider) &&
          isValidCesiumTerrainProvider(surfaceProvider)
        ) {
          try {
            await cb(terrainProvider, surfaceProvider, viewer);
          } catch (error) {
            console.error(`withElevationProviderAsyncFailed ${label}`, error);
          }
        }
      },
      [terrainProviderRef, surfaceProviderRef, viewerRef]
    );

  return {
    withViewer,
    isValidViewer,
    withScene,
    withCamera,
    withCanvas,
    withEntities,
    withImageryLayer,
    withPrimaryTileset,
    withSecondaryTileset,
    withEllipsoidTerrainProvider,
    withTerrainProvider,
    withTerrainProviderAsync,
    withSurfaceProvider,
    withSurfaceProviderAsync,
    withElevationProvidersAsync,
  };
};
