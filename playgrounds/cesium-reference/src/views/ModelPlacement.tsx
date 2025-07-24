import { useEffect, useRef, useState } from "react";
import {
  Entity,
  Transforms,
  DebugModelMatrixPrimitive,
  Viewer,
  Cesium3DTileset,
} from "cesium";
import {
  BRUECKENENTWURF_GLB,
  WUPP_MESH_2024,
  createModelEntityConstructorOptions,
} from "@carma-commons/resources";
import { cesiumConstructorOptions } from "../config";
import { useCameraPersistence } from "../hooks/useCameraPersistence";

const modelConstructorOptions =
  createModelEntityConstructorOptions(BRUECKENENTWURF_GLB);

const tilesetOptions = {
  maximumScreenSpaceError: 1,
  dynamicScreenSpaceError: false,
  cacheBytes: 536870912 * 16,
  maximumCacheOverflowBytes: 536870912 * 8,
};

const ModelPlacement: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);

  useCameraPersistence(viewer);

  useEffect(() => {
    const initialize = async () => {
      try {
        if (containerRef.current) {
          const newViewer = new Viewer(
            containerRef.current,
            cesiumConstructorOptions
          );

          // Load tileset inline
          try {
            const tileset = await Cesium3DTileset.fromUrl(
              WUPP_MESH_2024.url,
              tilesetOptions
            );
            newViewer.scene.primitives.add(tileset);
            console.debug("Tileset loaded and added to scene");
          } catch (tilesetError) {
            console.error("Failed to load tileset:", tilesetError);
          }

          // Load model inline
          const modelEntity = new Entity(modelConstructorOptions);
          newViewer.entities.add(modelEntity);

          const modelMatrix = Transforms.eastNorthUpToFixedFrame(
            modelConstructorOptions.position
          );
          const localDebugPrimitive = new DebugModelMatrixPrimitive({
            modelMatrix: modelMatrix,
            length: 10.0,
            width: 3.0,
          });
          newViewer.scene.primitives.add(localDebugPrimitive);

          // Position camera relative to model
          newViewer.flyTo(modelEntity, {
            offset: {
              heading: (Math.PI / 180) * 78,
              pitch: 0.05,
              range: 1200,
            },
            duration: 0,
          });

          setViewer(newViewer);
        }
      } catch (error) {
        console.error("Initialization error:", error);
      }
    };

    initialize();

    return () => {
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
      }
      setViewer(null);
    };
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height: "100vh" }} />;
};

export default ModelPlacement;
