import { useEffect, useRef } from "react";
import { Cesium3DTileset, Viewer } from "cesium";
import { WUPP_MESH_2024 } from "@carma-commons/resources";
import { getTileset } from "../cesium.utils";
import { cesiumConstructorOptions } from "../config";

const MinimalMesh: React.FC = () => {
  const viewerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let viewer: Viewer | null = null;
    let tileset: Cesium3DTileset | null = null;

    const initialize = async () => {
      try {
        if (viewerRef.current) {
          viewer = new Viewer(viewerRef.current, cesiumConstructorOptions);

          tileset = await getTileset(WUPP_MESH_2024.url);
          if (tileset) {
            viewer.scene.primitives.add(tileset);
            viewer.zoomTo(tileset);
          }
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

export default MinimalMesh;
