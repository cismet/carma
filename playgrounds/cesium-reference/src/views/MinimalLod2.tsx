import { FC, useEffect, useRef } from "react";
import {
  CesiumTerrainProvider,
  ImageryLayer,
  Viewer,
  WebMapServiceImageryProvider,
} from "cesium";
import {
  BASEMAP_METROPOLRUHR_WMS_GRAUBLAU,
  WUPP_LOD2_TILESET,
  WUPP_TERRAIN_PROVIDER,
} from "@carma-commons/resources";
import { cesiumConstructorOptions } from "../config";
import useTileset from "../hooks/useTileset";
import { useZoomToTilesetOnReady } from "../hooks/useZoomToTilesetOnReady";

const MinimalLod2: FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const { tilesetRef, tilesetReady } = useTileset(
    WUPP_LOD2_TILESET.url,
    viewerRef.current
  );

  useEffect(() => {
    const initialize = async () => {
      try {
        if (containerRef.current) {
          const viewer = new Viewer(
            containerRef.current,
            cesiumConstructorOptions
          );
          viewerRef.current = viewer;

          viewer.terrainProvider = await CesiumTerrainProvider.fromUrl(
            WUPP_TERRAIN_PROVIDER.url
          );

          const imageryProvider = new WebMapServiceImageryProvider(
            BASEMAP_METROPOLRUHR_WMS_GRAUBLAU
          );
          const newImageryLayer = new ImageryLayer(imageryProvider);
          viewer.imageryLayers.add(newImageryLayer);
        }
      } catch (error) {
        console.error("Initialization error:", error);
      }
    };

    initialize();

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
      }
    };
  }, []);

  useZoomToTilesetOnReady(viewerRef.current, tilesetRef, tilesetReady);
  return <div ref={containerRef} style={{ width: "100%", height: "100vh" }} />;
};

export default MinimalLod2;
