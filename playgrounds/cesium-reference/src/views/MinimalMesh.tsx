import { useEffect, useRef } from "react";
import { Cesium3DTileset, Viewer } from "cesium";
import { WUPP_MESH_2024 } from "@carma-commons/resources";
import { getTileset } from "../cesium.utils";
import { cesiumConstructorOptions } from "../config";

const MinimalMesh: React.FC = () => {
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

          const tileset = await getTileset(WUPP_MESH_2024.url);
          if (tileset) {
            tilesetRef.current = tileset;
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

export default MinimalMesh;
