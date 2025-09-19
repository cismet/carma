import { useMemo, type MutableRefObject } from "react";
import {
  CesiumTerrainProvider,
  CesiumWidget,
  ImageryProvider,
  EllipsoidTerrainProvider,
  ImageryLayer,
  Cesium3DTileset,
} from "cesium";

import {
  isValidWidget as isValidWidgetNoCtx,
  withValidWidget,
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
  widgetRef: MutableRefObject<CesiumWidget | null>
) =>
  useMemo(() => {
    const withWidget = (cb: (w: CesiumWidget) => void): boolean =>
      withValidWidget(widgetRef.current, cb);

    const isValidWidget = () => isValidWidgetNoCtx(widgetRef.current);

    const withImageryLayerRef = (
      imageryLayerRef: MutableRefObject<ImageryLayer | null>,
      cb: (imageryLayer: ImageryLayer, viewer: CesiumWidget) => void
    ): boolean => {
      if (
        isValidWidgetNoCtx(widgetRef.current) &&
        isValidImageryLayer(imageryLayerRef.current)
      ) {
        cb(imageryLayerRef.current, widgetRef.current);
        return true;
      }
      return false;
    };

    const withTerrainProviderRef = (
      terrainProviderRef: MutableRefObject<CesiumTerrainProvider | null>,
      cb: (terrainProvider: CesiumTerrainProvider, viewer: CesiumWidget) => void
    ): boolean => {
      if (
        isValidWidgetNoCtx(widgetRef.current) &&
        isValidCesiumTerrainProvider(terrainProviderRef.current)
      ) {
        cb(terrainProviderRef.current, widgetRef.current);
        return true;
      }
      return false;
    };

    const withEllipsoidTerrainProviderRef = (
      ellipsoidTerrainProviderRef: MutableRefObject<EllipsoidTerrainProvider | null>,
      cb: (
        ellipsoidTerrainProvider: EllipsoidTerrainProvider,
        viewer: CesiumWidget
      ) => void
    ): boolean => {
      if (
        isValidWidgetNoCtx(widgetRef.current) &&
        isValidEllipsoidTerrainProvider(ellipsoidTerrainProviderRef.current)
      ) {
        cb(ellipsoidTerrainProviderRef.current, widgetRef.current);
        return true;
      }
      return false;
    };

    const withTilesetRef = (
      tilesetRef: MutableRefObject<Cesium3DTileset | null>,
      cb: (tileset: Cesium3DTileset, viewer: CesiumWidget) => void
    ): boolean => {
      if (
        isValidWidgetNoCtx(widgetRef.current) &&
        isValidTileset(tilesetRef.current)
      ) {
        cb(tilesetRef.current, widgetRef.current);
        return true;
      }
      return false;
    };

    return {
      withViewer,
      isValidWidget,
      withImageryLayerRef,
      withTerrainProviderRef,
      withEllipsoidTerrainProviderRef,
      withTilesetRef,
    };
  }, [widgetRef]);
