import React, { useEffect, useRef, useState } from "react";
import {
  Entity,
  Transforms,
  DebugModelMatrixPrimitive,
  Viewer,
  Cesium3DTileset,
  Cartesian3,
} from "cesium";
import {
  BRUECKENENTWURF_GLB,
  WUPP_MESH_2024,
  createModelEntityConstructorOptions,
} from "@carma-commons/resources";
import { cesiumConstructorOptions } from "../config";
import { useCameraPersistence } from "../hooks/useCameraPersistence";
import { ModelPlacementUI } from "./ModelPlacement.UI";

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
  const viewerRef = useRef<Viewer | null>(null);
  const modelEntityRef = useRef<Entity | null>(null);
  const debugPrimitiveRef = useRef<DebugModelMatrixPrimitive | null>(null);
  const tilesetRef = useRef<Cesium3DTileset | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);

  const { wasRestored } = useCameraPersistence(viewer);

  // Check camera distance after persistence is complete
  useEffect(() => {
    if (viewer && modelEntityRef.current && wasRestored !== undefined) {
      const distance = Cartesian3.distance(
        viewer.camera.positionWC,
        modelConstructorOptions.position
      );

      if (distance > 5000) {
        console.debug(
          "restoring default position on load - distant camera detected"
        );
        viewer.flyTo(modelEntityRef.current, {
          offset: {
            heading: (Math.PI / 180) * 78,
            pitch: 0.05,
            range: 1200,
          },
          duration: 0,
        });
      }
    }
  }, [viewer, wasRestored]);

  useEffect(() => {
    const initialize = async () => {
      try {
        if (containerRef.current) {
          const newViewer = new Viewer(
            containerRef.current,
            cesiumConstructorOptions
          );

          viewerRef.current = newViewer;

          // Load tileset inline
          try {
            const tileset = await Cesium3DTileset.fromUrl(
              WUPP_MESH_2024.url,
              tilesetOptions
            );
            newViewer.scene.primitives.add(tileset);
            tilesetRef.current = tileset;
            console.debug("Tileset loaded and added to scene");
          } catch (tilesetError) {
            console.error("Failed to load tileset:", tilesetError);
          }

          // Load model inline
          const modelEntity = new Entity(modelConstructorOptions);
          newViewer.entities.add(modelEntity);
          modelEntityRef.current = modelEntity;

          const modelMatrix = Transforms.eastNorthUpToFixedFrame(
            modelConstructorOptions.position
          );
          const localDebugPrimitive = new DebugModelMatrixPrimitive({
            modelMatrix: modelMatrix,
            length: 10.0,
            width: 3.0,
          });
          localDebugPrimitive.show = false; // Hidden by default
          newViewer.scene.primitives.add(localDebugPrimitive);
          debugPrimitiveRef.current = localDebugPrimitive;

          setViewer(newViewer);
        }
      } catch (error) {
        console.error("Initialization error:", error);
      }
    };

    initialize();

    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
      }
      viewerRef.current = null;
      setViewer(null);
    };
  }, []); // Empty dependency array - only run once on mount

  return (
    <>
      <div ref={containerRef} style={{ width: "100%", height: "100vh" }} />
      {viewer && (
        <ModelPlacementUI
          viewerRef={viewerRef}
          modelEntityRef={modelEntityRef}
          debugPrimitiveRef={debugPrimitiveRef}
          modelConfig={BRUECKENENTWURF_GLB}
          tilesetRef={tilesetRef}
        />
      )}
    </>
  );
};

export default ModelPlacement;
