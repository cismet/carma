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
  const viewerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let viewer: Viewer | null = null;
    let tileset: Cesium3DTileset | null = null;

    const initialize = async () => {
      try {
        if (viewerRef.current) {
          viewer = new Viewer(viewerRef.current, cesiumConstructorOptions);

          tileset = await getTileset(WUPP_LOD2_TILESET.url);
          if (tileset) {
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
      if (tileset) {
        tileset.destroy();
      }
      if (viewer) {
        viewer.destroy();
      }
    };
  }, []);

  return <div ref={viewerRef} style={{ width: "100%", height: "100vh" }} />;
};

export default MinimalLod2;
