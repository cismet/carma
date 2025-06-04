import { useEffect, useRef } from "react";
import type { Viewer } from "cesium";
import {
  Cartesian2,
  Cartesian3,
  Color,
  Entity,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
} from "cesium";

import { create3DCrossGroup } from "../utils/cesium3DCross";
import { LABEL_FONT, SCALE_BY_DISTANCE } from "./useNivPPoints";

const useSceneClick = (
  viewer: Viewer | null,
  enabled: boolean = true,
  nivPEntities?: Entity[],
  searchRadius: number = 10 // Default search radius to 10m, same as cross3D visual
) => {
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
    if (!viewer || viewer.isDestroyed() || !enabled) {
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

        // Create 3D cross visualization (link size to search radius)
        const cross3D = create3DCrossGroup({
          position: pickedPosition,
          radius: searchRadius, // Link marker size to search radius
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

        // Check for nearby NivP entities within search radius (simplified approach)
        if (nivPEntities && nivPEntities.length > 0) {
          console.debug(`[SceneClick] Checking ${nivPEntities.length} NivP entities for proximity within ${searchRadius}m`);
          
          // Find the first NivP entity within the search radius
          let foundEntity = false;
          for (const entity of nivPEntities) {
            if (entity.position) {
              const entityPosition = entity.position.getValue(viewer.clock.currentTime);
              if (entityPosition) {
                const distance = Cartesian3.distance(pickedPosition, entityPosition);
                console.debug(`[SceneClick] Entity "${entity.name}" distance: ${distance.toFixed(2)}m`);
                
                // Use the first entity within range (typically there won't be multiple very close)
                if (distance <= searchRadius) {
                  viewer.selectedEntity = entity;
                  foundEntity = true;
                  console.debug(
                    `[SceneClick] Found NivP entity "${entity.name}" within ${searchRadius}m radius (${distance.toFixed(2)}m away)`
                  );
                  break; // Stop after finding the first entity within range
                }
              } else {
                console.debug(`[SceneClick] Entity "${entity.name}" has no position value`);
              }
            } else {
              console.debug(`[SceneClick] Entity "${entity.name}" has no position property`);
            }
          }
          
          if (!foundEntity) {
            console.debug(`[SceneClick] No NivP entities found within ${searchRadius}m radius`);
          }
        } else {
          console.debug(`[SceneClick] No NivP entities provided (${nivPEntities?.length || 0} entities)`);
        }

        // Schedule a render update after entities are processed
        const onEntitiesAdded = () => {
          viewer.scene.postRender.removeEventListener(onEntitiesAdded);
          viewer.scene.requestRender();
        };
        viewer.scene.postRender.addEventListener(onEntitiesAdded);

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
  }, [viewer, enabled, nivPEntities, searchRadius]);

  return {
    // Could expose additional functionality here if needed
    terrainEntity: terrainEntityRef.current,
  };
};

export default useSceneClick;
