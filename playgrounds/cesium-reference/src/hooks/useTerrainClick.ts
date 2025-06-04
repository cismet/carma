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

const useTerrainClick = (
  viewer: Viewer | null,
  enabled: boolean = true,
  showLabel: boolean = true
) => {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const terrainEntityRef = useRef<Entity | null>(null);
  const cross3DRef = useRef<{ entities: Entity[]; cleanup: (viewer: { entities: { remove: (entity: Entity) => void } }) => void; addToViewer: (viewer: { entities: { add: (entity: Entity) => void } }) => void } | null>(null);

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
      // Try to pick terrain/mesh position
      let pickedPosition = viewer.scene.pickPosition(event.position);

      // If no 3D position picked, fall back to ellipsoid
      if (!pickedPosition) {
        pickedPosition = viewer.camera.pickEllipsoid(
          event.position,
          viewer.scene.globe.ellipsoid
        );
      }

      if (!pickedPosition) {
        console.debug("[TerrainClick] No position picked");
        return;
      }

      // Remove previous terrain entity if it exists
      if (terrainEntityRef.current) {
        viewer.entities.remove(terrainEntityRef.current);
      }
      
      // Remove previous 3D cross if it exists
      if (cross3DRef.current) {
        cross3DRef.current.cleanup(viewer);
        cross3DRef.current = null;
      }

      // Get cartographic coordinates
      const cartographic =
        viewer.scene.globe.ellipsoid.cartesianToCartographic(pickedPosition);
      if (!cartographic) {
        console.debug("[TerrainClick] Could not convert to cartographic");
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
        label: showLabel
          ? {
              text: height.toFixed(2),
              font: "bold 48px Arial, sans-serif",
              fillColor: Color.ORANGE,
              showBackground: true,
              backgroundColor: Color.BLACK.withAlpha(0.5),
              backgroundPadding: new Cartesian2(12, 6),
              style: 0, // FILL_AND_OUTLINE
              pixelOffset: new Cartesian2(0, 40),
              scale: 0.5,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }
          : undefined,
      });

      // Create 3D cross visualization
      const cross3D = create3DCrossGroup({
        position: pickedPosition,
        size: 10, // Size in meters for the cross
        color: Color.ORANGE,
        width: 2,
        id: "terrain-click-cross-3d",
      });

      // Add entity to viewer and store reference
      viewer.entities.add(terrainEntity);
      terrainEntityRef.current = terrainEntity;
      
      // Add 3D cross to viewer
      cross3D.addToViewer(viewer);
      cross3DRef.current = cross3D;
      viewer.scene.requestRender();

      console.debug(
        `[TerrainClick] Created terrain point at elevation: ${height.toFixed(
          3
        )}m`
      );
    }, ScreenSpaceEventType.LEFT_CLICK);

    console.debug("[TerrainClick] Terrain click handler enabled");

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
      console.debug("[TerrainClick] Terrain click handler cleaned up");
    };
  }, [viewer, enabled, showLabel]);

  return {
    // Could expose additional functionality here if needed
    terrainEntity: terrainEntityRef.current,
  };
};

export default useTerrainClick;
