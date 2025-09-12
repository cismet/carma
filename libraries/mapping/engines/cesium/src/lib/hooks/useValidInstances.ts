import { useMemo, type MutableRefObject } from "react";
import {
  CesiumTerrainProvider,
  ImageryProvider,
  EllipsoidTerrainProvider,
  Viewer,
  ImageryLayer,
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

export const useValidInstances = (viewerRef: MutableRefObject<Viewer | null>) =>
  useMemo(() => {
    const withViewer = (cb: (viewer: Viewer) => void): boolean =>
      withValidViewer(viewerRef.current, cb);

    const isValidViewer = () => isValidViewerNoCtx(viewerRef.current);

    const withImageryLayerRef = (
      imageryLayerRef: MutableRefObject<ImageryLayer | null>,
      cb: (imageryLayer: ImageryLayer, viewer: Viewer) => void
    ): boolean => {
      if (
        isValidViewerNoCtx(viewerRef.current) &&
        isValidImageryLayer(imageryLayerRef.current)
      ) {
        cb(imageryLayerRef.current, viewerRef.current);
        return true;
      }
      return false;
    };

    const withTerrainProviderRef = (
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
    };

    const withEllipsoidTerrainProviderRef = (
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
    };

    const withTilesetRef = (
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
    };

    return {
      withViewer,
      isValidViewer,
      withImageryLayerRef,
      withTerrainProviderRef,
      withEllipsoidTerrainProviderRef,
      withTilesetRef,
    };
  }, [viewerRef]);
