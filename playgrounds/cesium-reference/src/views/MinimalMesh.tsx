import { useEffect, useRef } from "react";
import { Viewer } from "cesium";
import { WUPP_MESH_2024 } from "@carma-commons/resources";
import { cesiumConstructorOptions } from "../config";
import useTileset from "../hooks/useTileset";
import { useZoomToTilesetOnReady } from "../hooks/useZoomToTilesetOnReady";

const MinimalMesh: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const { tilesetRef, tilesetReady } = useTileset(
    WUPP_MESH_2024.url,
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

export default MinimalMesh;
