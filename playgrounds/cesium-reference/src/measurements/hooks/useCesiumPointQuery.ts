import { Dispatch, SetStateAction, useEffect, useRef } from "react";
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
import {
  isPointMeasurementEntry,
  MeasurementCollection,
  MeasurementMode,
  PointMeasurementEntry,
} from "../types/MeasurementTypes";
import { s } from "node_modules/vite/dist/node/types.d-aGj9QkWt";

const updateLast =
  (measurement: PointMeasurementEntry) => (prev: MeasurementCollection) => {
    // only add if not pointMeasurement already exists, otherwise replace the last one
    const existingIndex = prev
      .reverse()
      .findIndex(
        (m) =>
          isPointMeasurementEntry(m) && m.type === MeasurementMode.PointQuery
      );
    if (existingIndex !== -1) {
      // Replace the last point measurement
      const newCollection = [...prev];
      const forwardIndex = prev.length - 1 - existingIndex;
      newCollection[forwardIndex] = measurement;
      return newCollection;
    }
    // Otherwise, add the new measurement
    return [...prev, measurement];
  };

const updateCollection = (
  setCollection: Dispatch<SetStateAction<MeasurementCollection>>,
  measurement: PointMeasurementEntry,
  singleMode: boolean
) => {
  if (singleMode) {
    // If in single point mode, clear previous points
    setCollection(updateLast(measurement));
  } else {
    setCollection((prevCollection: MeasurementCollection) => [
      ...prevCollection,
      measurement,
    ]);
  }
};

const useCesiumPointQuery = (
  viewer: Viewer | null,
  enabled: boolean = true,
  setCollection: Dispatch<SetStateAction<MeasurementCollection>>,
  // custom measurement type settings
  searchRadius: number = 10, // Default search radius to 10m, same as cross3D visual
  nivPEntities?: Entity[],
  singleMode: boolean = false
) => {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const pointOnMeshEntityRef = useRef<Entity | null>(null);
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
      if (pointOnMeshEntityRef.current && viewer) {
        viewer.entities.remove(pointOnMeshEntityRef.current);
        pointOnMeshEntityRef.current = null;
      }
      if (cross3DRef.current && viewer) {
        cross3DRef.current.cleanup(viewer);
        cross3DRef.current = null;
      }
      return;
    }

    console.debug("[SceneClick] Enabling terrain click handler");
    // Create click handler
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handlerRef.current = handler;

    handler.setInputAction((event: { position: Cartesian2 }) => {
      // Hide existing cross and terrain entity before picking to avoid interference
      const previousTerrainEntity = pointOnMeshEntityRef.current;
      const previousCross3D = cross3DRef.current;

      if (previousTerrainEntity) {
        viewer.entities.remove(previousTerrainEntity);
        pointOnMeshEntityRef.current = null;
      }

      if (previousCross3D) {
        previousCross3D.cleanup(viewer);
        cross3DRef.current = null;
      }

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

      // Create new entity at clicked position (for the label only - no description for InfoBox)
      const pointOnMeshEntity = new Entity({
        id: "mesh-click-point",
        name: "Mesh Elevation Point",
        position: pickedPosition,
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

      const measurement: PointMeasurementEntry = {
        type: MeasurementMode.PointQuery, // Assuming PointQuery is the mode for this
        id: `point-${Date.now()}`,
        name: `Point at ${height.toFixed(2)}m`,
        geometryECEF: pickedPosition,
        geometryWGS84: {
          longitude,
          latitude,
          height,
        },
        timestamp: new Date().getTime(),
        metadata: null, // No additional metadata for point query
      };

      updateCollection(setCollection, measurement, singleMode);

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
      viewer.entities.add(pointOnMeshEntity);
      pointOnMeshEntityRef.current = pointOnMeshEntity;

      // Add 3D cross to viewer
      cross3D.addToViewer(viewer);
      cross3DRef.current = cross3D;

      // Check for nearby NivP entities within search radius (simplified approach)
      if (nivPEntities && nivPEntities.length > 0) {
        console.debug(
          `[SceneClick] Checking ${nivPEntities.length} NivP entities for proximity within ${searchRadius}m`
        );

        // Find the first NivP entity within the search radius
        let foundEntity = false;
        const startTime = performance.now();
        for (const entity of nivPEntities) {
          if (entity.position) {
            const entityPosition = entity.position.getValue(
              viewer.clock.currentTime
            );
            if (entityPosition) {
              const distance = Cartesian3.distance(
                pickedPosition,
                entityPosition
              );
              //console.debug(`[SceneClick] Entity "${entity.name}" distance: ${distance.toFixed(2)}m`);

              // Use the first entity within range (typically there won't be multiple very close)
              if (distance <= searchRadius) {
                // Show custom info panel for NivP entity if callback provided
                if (entity.properties) {
                  // Extract position from entity
                  const position = entity.position?.getValue(
                    viewer.clock.currentTime
                  );

                  if (position) {
                    const cartographic =
                      viewer.scene.globe.ellipsoid.cartesianToCartographic(
                        position
                      );
                    const longitude = cartographic.longitude * (180 / Math.PI);
                    const latitude = cartographic.latitude * (180 / Math.PI);
                    const elevation = cartographic.height;

                    // Get the stored NivP data from entity properties
                    const nivp = entity.properties.nivpData?.getValue(
                      viewer.clock.currentTime
                    );

                    // Calculate height difference between terrain click point and NivP point
                    const heightDifference = height - elevation;

                    const timestamp = new Date().getTime();

                    const measurement: PointMeasurementEntry = {
                      type: MeasurementMode.PointQuery, // Assuming PointQuery is the mode for this
                      id: `nivp-${nivp.id}-${timestamp}`,
                      timestamp,
                      name: `NivP Point ${nivp.lagebezeichnung || nivp.id}`,

                      geometryECEF: position,
                      geometryWGS84: {
                        longitude,
                        latitude,
                        height: elevation,
                      },
                      metadata: { nivp, heightDifference },
                    };

                    updateCollection(setCollection, measurement, singleMode);
                  }
                } else {
                  // Fallback to setting selected entity for InfoBox (if no custom callback)
                  viewer.selectedEntity = entity;
                }

                foundEntity = true;
                const searchTime = performance.now() - startTime;
                console.debug(
                  `[SceneClick] Found NivP entity "${
                    entity.name
                  }" within ${searchRadius}m radius (${distance.toFixed(
                    2
                  )}m away) in ${searchTime.toFixed(2)}ms`
                );
                break; // Stop after finding the first entity within range
              }
            } else {
              console.debug(
                `[SceneClick] Entity "${entity.name}" has no position value`
              );
            }
          } else {
            console.debug(
              `[SceneClick] Entity "${entity.name}" has no position property`
            );
          }
        }

        if (!foundEntity) {
          console.debug(
            `[SceneClick] No NivP entities found within ${searchRadius}m radius`
          );
        }
      } else {
        console.debug(
          `[SceneClick] No NivP entities provided (${
            nivPEntities?.length || 0
          } entities)`
        );
      }

      console.debug(
        `[SceneClick] Created terrain point at elevation: ${height.toFixed(3)}m`
      );

      setTimeout(() => {
        viewer.scene.requestRender(); // Request render after adding entities
      }, 200); // Use setTimeout to ensure render happens after all entities are added
      // Add the postRender event listener
    }, ScreenSpaceEventType.LEFT_CLICK);

    console.debug("[SceneClick] Terrain click handler enabled");

    // Cleanup function
    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      if (pointOnMeshEntityRef.current && viewer) {
        viewer.entities.remove(pointOnMeshEntityRef.current);
        pointOnMeshEntityRef.current = null;
      }
      if (cross3DRef.current && viewer) {
        cross3DRef.current.cleanup(viewer);
        cross3DRef.current = null;
      }
      console.debug("[SceneClick] Terrain click handler cleaned up");
    };
  }, [viewer, enabled, nivPEntities, searchRadius, singleMode]);

  return {
    showPoints: (ids?: string[]) => {
      // This function could be used to toggle visibility of specific point types
      // For now, we just log the points to show
      console.debug("[CesiumPointQuery] Showing points:", ids);
    },
    hidePoints: (ids?: string[]) => {
      // This function could be used to toggle visibility of specific point types
      // For now, we just log the points to hide
      console.debug("[CesiumPointQuery] Hiding points:", ids);
    },
    clearPoints: (ids?: string[]) => {
      // Could expose additional functionality here if needed
      setCollection((prevCollection: MeasurementCollection) => {
        const clearAll = ids === undefined || ids.length === 0;
        // Filter out points based on ids or type
        return prevCollection.filter((measurement) =>
          clearAll
            ? !ids.includes(measurement.id)
            : !isPointMeasurementEntry(measurement)
        );
      });
      console.debug("[CesiumPointQuery] Clearing points:", ids);
    },
  };
};

export default useCesiumPointQuery;
