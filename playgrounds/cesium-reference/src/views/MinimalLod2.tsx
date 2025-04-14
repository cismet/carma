import { FC, useEffect, useRef, useState } from "react";
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
  const [viewer, setViewer] = useState<Viewer | undefined>(undefined);
  const { tilesetRef, tilesetReady } = useTileset(
    WUPP_LOD2_TILESET.url,
    viewer
  );

  useEffect(() => {
    const initialize = async () => {
      try {
        if (containerRef.current) {
          const newViewer = new Viewer(
            containerRef.current,
            cesiumConstructorOptions
          );
          setViewer(newViewer);

          newViewer.terrainProvider = await CesiumTerrainProvider.fromUrl(
            WUPP_TERRAIN_PROVIDER.url
          );

          const imageryProvider = new WebMapServiceImageryProvider(
            BASEMAP_METROPOLRUHR_WMS_GRAUBLAU
          );
          const newImageryLayer = new ImageryLayer(imageryProvider);
          newViewer.imageryLayers.add(newImageryLayer);
        }
      } catch (error) {
        console.error("Initialization error:", error);
      }
    };

    initialize();
  }, []);

  useZoomToTilesetOnReady(viewer, tilesetRef, tilesetReady);
  return <div ref={containerRef} style={{ width: "100%", height: "100vh" }} />;
};

export default MinimalLod2;
