import { useEffect, useRef, useState } from "react";
import { Viewer } from "cesium";
import { WUPP_MESH_2024 } from "@carma-commons/resources";
import { cesiumConstructorOptions } from "../config";
import useTileset from "../hooks/useTileset";
import { useZoomToTilesetOnReady } from "../hooks/useZoomToTilesetOnReady";

const MinimalMesh: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewer, setViewer] = useState<Viewer | undefined>(undefined);
  const { tilesetRef, tilesetReady } = useTileset(
    WUPP_MESH_2024.url,
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

export default MinimalMesh;
