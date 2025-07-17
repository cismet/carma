import { useEffect, useRef } from "react";
import type { Viewer, Entity } from "cesium";
import {
  Cartesian2,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
  defined,
} from "cesium";
import {
  MeasurementCollection,
  MeasurementMode,
  isPointMeasurementEntry,
  isTraverseMeasurementEntry,
} from "../types/MeasurementTypes";

// WeakMap to store entity-to-measurement mappings
const entityToMeasurementMap = new WeakMap<Entity, { 
  measurementId: string; 
  pointIndex?: number; 
  type: MeasurementMode 
}>();

export const registerEntityForSelection = (
  entity: Entity,
  measurementId: string,
  type: MeasurementMode,
  pointIndex?: number
) => {
  console.debug("[PointSelection] Registering entity for selection:", {
    entity: entity.id,
    measurementId,
    type,
    pointIndex
  });
  entityToMeasurementMap.set(entity, { measurementId, pointIndex, type });
};

export const useCesiumPointSelection = (
  viewer: Viewer | null,
  enabled: boolean = true,
  measurements: MeasurementCollection,
  toggleMeasurementSelection: (id: string, pointIndex?: number) => void
) => {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed() || !enabled) {
      // Clean up if disabled
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      return;
    }

    console.debug("[PointSelection] Enabling point selection handler");
    
    // Create click handler for entity selection
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handlerRef.current = handler;

    handler.setInputAction((event: { position: Cartesian2 }) => {
      console.debug("[PointSelection] Click detected at:", event.position);
      
      // Try to pick an entity first
      const pickedObject = viewer.scene.pick(event.position);
      console.debug("[PointSelection] Picked object:", pickedObject);
      
      if (defined(pickedObject) && defined(pickedObject.id)) {
        const entity = pickedObject.id;
        console.debug("[PointSelection] Entity found:", entity);
        
        const selectionInfo = entityToMeasurementMap.get(entity);
        console.debug("[PointSelection] Selection info:", selectionInfo);
        
        if (selectionInfo) {
          console.debug("[PointSelection] Selected entity:", selectionInfo);
          
          // Toggle measurement selection
          toggleMeasurementSelection(selectionInfo.measurementId, selectionInfo.pointIndex);
          
          // Find the measurement in the collection and log details
          const measurement = measurements.find(m => m.id === selectionInfo.measurementId);
          if (measurement) {
            if (isPointMeasurementEntry(measurement)) {
              console.debug(`[PointSelection] Toggled point measurement: ${measurement.name}`);
            } else if (isTraverseMeasurementEntry(measurement) && selectionInfo.pointIndex !== undefined) {
              console.debug(`[PointSelection] Toggled traverse point ${selectionInfo.pointIndex + 1} in ${measurement.name || measurement.id}`);
            }
          }
          
          // Prevent further event propagation
          return;
        } else {
          console.debug("[PointSelection] Entity not registered for selection");
        }
      } else {
        console.debug("[PointSelection] No entity picked");
      }
      
      // If no entity was selected, do nothing (don't clear selection)
      console.debug("[PointSelection] No selectable entity clicked");
    }, ScreenSpaceEventType.LEFT_CLICK);

    console.debug("[PointSelection] Point selection handler enabled");

    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      console.debug("[PointSelection] Point selection handler cleaned up");
    };
  }, [viewer, enabled, measurements, toggleMeasurementSelection]);

  return {};
};

export default useCesiumPointSelection;
