import { FC, useEffect, useRef } from "react";
import {
  Cesium3DTileset,
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
import { getTileset } from "../cesium.utils";
import { cesiumConstructorOptions } from "../config";

const MinimalLod2: FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const tilesetRef = useRef<Cesium3DTileset | null>(null);

  useEffect(() => {
    const initialize = async () => {
      try {
        if (containerRef.current) {
          const viewer = new Viewer(
            containerRef.current,
            cesiumConstructorOptions
          );
          viewerRef.current = viewer;

          const tileset = await getTileset(WUPP_LOD2_TILESET.url);
          if (tileset) {
            tilesetRef.current = tileset;
            viewer.scene.primitives.add(tileset);
            viewer.zoomTo(tileset);
          }

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
      if (tilesetRef.current) {
        tilesetRef.current.destroy();
      }
      if (viewerRef.current) {
        viewerRef.current.destroy();
      }
    };
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height: "100vh" }} />;
};

export default MinimalLod2;
