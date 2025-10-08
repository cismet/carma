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
  isValidScene as isValidSceneNoCtx,
  isValidTileset,
  isValidCesiumTerrainProvider,
} from "../utils/instanceGates";

export type KnownProviders =
  | CesiumTerrainProvider
  | ImageryProvider
  | EllipsoidTerrainProvider;

// All callbacks can be sync or async - wrapper handles both
export type ViewerCallback = (viewer: Viewer) => void | Promise<void>;
export type CameraCallback = (
  camera: Camera,
  viewer: Viewer
) => void | Promise<void>;
export type CanvasCallback = (
  canvas: HTMLCanvasElement,
  viewer: Viewer
) => void | Promise<void>;
export type SceneCallback = (
  scene: Scene,
  viewer: Viewer
) => void | Promise<void>;
export type EntitiesCallback = (
  entities: EntityCollection,
  viewer: Viewer
) => void | Promise<void>;
export type ImageryLayerCallback = (
  imageryLayer: ImageryLayer,
  viewer: Viewer
) => void | Promise<void>;
export type TilesetCallback = (
  tileset: Cesium3DTileset,
  viewer: Viewer
) => void | Promise<void>;

export type EllipsoidTerrainProviderCallback = (
  provider: EllipsoidTerrainProvider,
  viewer: Viewer
) => void | Promise<void>;

export type WithCallback<TCallback> = (
  cb: TCallback,
  label?: string
) => Promise<void>;

export type TerrainProviderCallback = (
  provider: CesiumTerrainProvider,
  viewer: Viewer
) => void | Promise<void>;

export type ElevationProvidersCallback = (
  terrainProvider: CesiumTerrainProvider,
  surfaceProvider: CesiumTerrainProvider,
  scene: Scene
) => Promise<void>;

export type WithElevationProvidersCallback = (
  cb: ElevationProvidersCallback,
  label?: string
) => Promise<void>;

type WithRefCallback<TInstance, TCallback> = (
  ref: MutableRefObject<TInstance | null>,
  cb: TCallback,
  label?: string
) => Promise<void>;

export const useValidInstances = (
  viewerRef: MutableRefObject<Viewer | null>,
  sceneRef: MutableRefObject<Scene | null>,
  imageryLayerRef: MutableRefObject<ImageryLayer | null>,
  primaryTilesetRef: MutableRefObject<Cesium3DTileset | null>,
  secondaryTilesetRef: MutableRefObject<Cesium3DTileset | null>,
  terrainProviderRef: MutableRefObject<CesiumTerrainProvider | null>,
  ellipsoidTerrainProviderRef: MutableRefObject<EllipsoidTerrainProvider | null>,
  surfaceProviderRef: MutableRefObject<CesiumTerrainProvider | null>
) => {
  const withViewer = useCallback<WithCallback<ViewerCallback>>(
    async (cb, label = "withViewer") => {
      try {
        if (isValidViewerNoCtx(viewerRef.current)) {
          await cb(viewerRef.current);
        }
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

  const withTerrainProviderRef = useCallback<
    WithRefCallback<CesiumTerrainProvider, TerrainProviderCallback>
  >(
    async (terrainProviderRef, cb, label = "withTerrainProviderRef") => {
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

  const withTilesetRef = useCallback<
    WithRefCallback<Cesium3DTileset, TilesetCallback>
  >(
    async (tilesetRef, cb, label = "withTilesetRef") => {
      if (
        isValidViewerNoCtx(viewerRef.current) &&
        isValidTileset(tilesetRef.current)
      ) {
        try {
          await cb(tilesetRef.current, viewerRef.current);
        } catch (error) {
          console.error(`[TILESET|CALLBACK] ${label} failed`, error);
        }
      }
    },
    [viewerRef]
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
  const withTerrainProvider = useCallback<
    WithCallback<TerrainProviderCallback>
  >(
    async (cb, label = "withTerrainProvider") =>
      await withTerrainProviderRef(
        terrainProviderRef,
        async (provider, viewer) => await cb(provider, viewer),
        label
      ),
    [terrainProviderRef, withTerrainProviderRef]
  );

  const withSurfaceProvider = useCallback<
    WithCallback<TerrainProviderCallback>
  >(
    async (cb, label = "withSurfaceProvider") =>
      await withTerrainProviderRef(
        surfaceProviderRef,
        async (provider, viewer) => await cb(provider, viewer),
        label
      ),
    [surfaceProviderRef, withTerrainProviderRef]
  );

  const withElevationProviders: WithElevationProvidersCallback = useCallback(
    async (cb, label = "withElevationProviders") => {
      const terrainProvider = terrainProviderRef.current;
      const surfaceProvider = surfaceProviderRef.current;
      const scene = sceneRef.current;
      if (
        isValidSceneNoCtx(scene) &&
        isValidCesiumTerrainProvider(terrainProvider) &&
        isValidCesiumTerrainProvider(surfaceProvider)
      ) {
        try {
          await cb(terrainProvider, surfaceProvider, scene);
        } catch (error) {
          console.error(`withElevationProvidersFailed ${label}`, error);
        }
      }
    },
    [terrainProviderRef, surfaceProviderRef, sceneRef]
  );

  return {
    isValidViewer,
    withViewer,
    withScene,
    withCamera,
    withEntities,
    withPrimaryTileset,
    withSecondaryTileset,
    withTerrainProvider,
    withSurfaceProvider,
    withElevationProviders,
  };
};
