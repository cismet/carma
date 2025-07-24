import { useEffect, useRef, useState } from "react";
import {
  Entity,
  Transforms,
  DebugModelMatrixPrimitive,
  Cartesian3,
  Viewer,
} from "cesium";
import {
  BRUECKENENTWURF_GLB,
  WUPP_MESH_2024,
  createModelEntityConstructorOptions,
} from "@carma-commons/resources";
import { cesiumConstructorOptions } from "../config";
import useTileset from "../hooks/useTileset";
import { useCameraPersistence } from "../hooks/useCameraPersistence";

const modelConstructorOptions =
  createModelEntityConstructorOptions(BRUECKENENTWURF_GLB);

const tilesetOptions = {
  maximumScreenSpaceError: 1.0,
  cacheBytes: 536870912 * 8,
  maximumCacheOverflowBytes: 536870912 * 4,
};

const ModelPlacement: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);

  const { tilesetRef, tilesetReady } = useTileset(
    WUPP_MESH_2024.url,
    viewer,
    tilesetOptions
  );

  useCameraPersistence(viewer);

  useEffect(() => {
    const initialize = async () => {
      try {
        if (containerRef.current) {
          const newViewer = new Viewer(
            containerRef.current,
            cesiumConstructorOptions
          );
          viewerRef.current = newViewer;
          setViewer(newViewer);
        }
      } catch (error) {
        console.error("Initialization error:", error);
      }
    };

    initialize();

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
        setViewer(null);
      }
    };
  }, []);

  useEffect(() => {
    if (!viewer) return;

    const modelEntity = new Entity(modelConstructorOptions);
    viewer.entities.add(modelEntity);

    const modelMatrix = Transforms.eastNorthUpToFixedFrame(
      modelConstructorOptions.position
    );
    const localDebugPrimitive = new DebugModelMatrixPrimitive({
      modelMatrix: modelMatrix,
      length: 10.0,
      width: 3.0,
    });
    viewer.scene.primitives.add(localDebugPrimitive);

    const distance = Cartesian3.distance(
      viewer.camera.position,
      modelConstructorOptions.position
    );
    if (distance > 10000)
      viewer.flyTo(modelEntity, {
        offset: {
          heading: (Math.PI / 180) * 70,
          pitch: -0.1,
          range: 100,
        },
        duration: 0,
      });

    return () => {
      if (!viewer.isDestroyed()) {
        viewer.entities.remove(modelEntity);
        viewer.scene.primitives.remove(localDebugPrimitive);
      }
    };
  }, [viewer]);

  return <div ref={containerRef} style={{ width: "100%", height: "100vh" }} />;
};

export default ModelPlacement;
