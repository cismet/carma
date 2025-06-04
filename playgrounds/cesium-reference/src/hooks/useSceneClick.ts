import { useEffect, useRef } from "react";
import type { Viewer } from "cesium";
import {
  Cartesian2,
  Color,
  Entity,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
} from "cesium";

import { create3DCrossGroup } from "../utils/cesium3DCross";
import { LABEL_FONT, SCALE_BY_DISTANCE } from "./useNivPPoints";

const useSceneClick = (viewer: Viewer | null, enabled: boolean = true) => {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const terrainEntityRef = useRef<Entity | null>(null);
  const cross3DRef = useRef<{
    entities: Entity[];
    cleanup: (viewer: {
      entities: { remove: (entity: Entity) => void };
    }) => void;
    addToViewer: (viewer: {
      entities: { add: (entity: Entity) => void };
    }) => void;
  } | null>(null);

  useEffect(() => {
    if (!viewer || !enabled) {
      // Clean up if disabled
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      if (terrainEntityRef.current && viewer) {
        viewer.entities.remove(terrainEntityRef.current);
        terrainEntityRef.current = null;
      }
      if (cross3DRef.current && viewer) {
        cross3DRef.current.cleanup(viewer);
        cross3DRef.current = null;
      }
      return;
    }

    // Create click handler
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handlerRef.current = handler;

    handler.setInputAction((event: { position: Cartesian2 }) => {
      // Hide existing cross and terrain entity before picking to avoid interference
      const previousTerrainEntity = terrainEntityRef.current;
      const previousCross3D = cross3DRef.current;

      if (previousTerrainEntity) {
        viewer.entities.remove(previousTerrainEntity);
        terrainEntityRef.current = null;
      }

      if (previousCross3D) {
        previousCross3D.cleanup(viewer);
        cross3DRef.current = null;
      }

      // Request render and schedule pick operation after next render
      viewer.scene.requestRender();

      // Use postRender event to ensure the removal is processed before picking
      const onPostRender = () => {
        viewer.scene.postRender.removeEventListener(onPostRender);

        // Try to pick terrain/mesh position
        const pickedPosition = viewer.scene.pickPosition(event.position);

        if (!pickedPosition) {
          console.debug("[SceneClick] No position picked");
          return;
        }

        // Get cartographic coordinates
        const cartographic =
          viewer.scene.globe.ellipsoid.cartesianToCartographic(pickedPosition);
        if (!cartographic) {
          console.debug("[SceneClick] Could not convert to cartographic");
          return;
        }

        // Convert to degrees for display
        const longitude = cartographic.longitude * (180 / Math.PI);
        const latitude = cartographic.latitude * (180 / Math.PI);
        const height = cartographic.height;

        // Create new entity at clicked position (for the label and info)
        const terrainEntity = new Entity({
          id: "terrain-click-point",
          name: "Terrain Elevation Point",
          description: `
            <div style="font-family: Arial, sans-serif; line-height: 1.4;">
              <h3 style="margin: 0 0 10px 0;">Terrain Elevation</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td><strong>Elevation:</strong></td><td>${height.toFixed(
                  3
                )} m</td></tr>
                <tr><td><strong>Longitude:</strong></td><td>${longitude.toFixed(
                  6
                )}°</td></tr>
                <tr><td><strong>Latitude:</strong></td><td>${latitude.toFixed(
                  6
                )}°</td></tr>
              </table>
              <div style="margin-top: 10px; font-size: 12px; color: #666;">
                Click anywhere on the terrain to create a new elevation point.
              </div>
            </div>
          `,
          position: pickedPosition,
          // Remove the simple point - we'll use 3D cross instead
          label: {
            text: height.toFixed(2),
            font: LABEL_FONT,
            fillColor: Color.ORANGE,
            showBackground: true,
            backgroundColor: Color.BLACK.withAlpha(0.5),
            backgroundPadding: new Cartesian2(12, 6),
            style: 0, // FILL_AND_OUTLINE
            pixelOffset: new Cartesian2(0, 40),
            scaleByDistance: SCALE_BY_DISTANCE, // Scale down with distance
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });

        // Create 3D cross visualization
        const cross3D = create3DCrossGroup({
          position: pickedPosition,
          size: 10, // Size in meters for the cross
          color: Color.ORANGE,
          width: 2,
          id: "terrain-click-cross-3d",
          xyCirclePlane: true, // Enable the circular plane feature
          colorCircle: Color.WHITE.withAlpha(0.3), // Semi-transparent white circle
        });

        // Add entity to viewer and store reference
        viewer.entities.add(terrainEntity);
        terrainEntityRef.current = terrainEntity;

        // Add 3D cross to viewer
        cross3D.addToViewer(viewer);
        cross3DRef.current = cross3D;
        viewer.scene.requestRender();

        console.debug(
          `[SceneClick] Created terrain point at elevation: ${height.toFixed(
            3
          )}m`
        );
      };

      // Add the postRender event listener
      viewer.scene.postRender.addEventListener(onPostRender);
    }, ScreenSpaceEventType.LEFT_CLICK);

    console.debug("[SceneClick] Terrain click handler enabled");

    // Cleanup function
    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      if (terrainEntityRef.current && viewer) {
        viewer.entities.remove(terrainEntityRef.current);
        terrainEntityRef.current = null;
      }
      if (cross3DRef.current && viewer) {
        cross3DRef.current.cleanup(viewer);
        cross3DRef.current = null;
      }
      console.debug("[SceneClick] Terrain click handler cleaned up");
    };
  }, [viewer, enabled]);

  return {
    // Could expose additional functionality here if needed
    terrainEntity: terrainEntityRef.current,
  };
};

export default useSceneClick;
