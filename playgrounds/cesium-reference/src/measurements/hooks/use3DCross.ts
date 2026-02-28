import { useEffect, useRef, useCallback } from "react";
import { Cartesian3, type Entity } from "cesium";
import { create3DCross } from "../utils/cesium3DCross";
import { useCesiumViewer } from "../../contexts/CesiumViewerContext";

const use3DCross = () => {
  const { viewer } = useCesiumViewer();
  const crossEntitiesRef = useRef<Entity[]>([]);

  // Create the cross entities once
  useEffect(() => {
    if (
      !viewer ||
      viewer.isDestroyed() ||
      crossEntitiesRef.current.length > 0
    ) {
      return;
    }

    const crossEntities = create3DCross({
      position: new Cartesian3(), // Initial dummy position
      radius: 10,
    });

    crossEntities.forEach((entity) => {
      entity.show = false; // Initially hidden
      viewer.entities.add(entity);
    });

    crossEntitiesRef.current = crossEntities;

    // Cleanup on unmount
    return () => {
      if (!viewer.isDestroyed()) {
        crossEntitiesRef.current.forEach((entity) => {
          viewer.entities.remove(entity);
        });
        crossEntitiesRef.current = [];
      }
    };
  }, [viewer]);

  const show = useCallback(() => {
    crossEntitiesRef.current.forEach((entity) => (entity.show = true));
  }, []);

  const hide = useCallback(() => {
    crossEntitiesRef.current.forEach((entity) => (entity.show = false));
  }, []);

  const updatePosition = useCallback(
    (position: Cartesian3) => {
      if (!viewer || viewer.isDestroyed()) return;

      // For simplicity, we are recreating the cross here.
      // A more optimized version would update the positions of the existing polylines.
      hide();
      crossEntitiesRef.current.forEach((entity) =>
        viewer.entities.remove(entity)
      );

      const newCrossEntities = create3DCross({ position, radius: 10 });
      newCrossEntities.forEach((entity) => viewer.entities.add(entity));
      crossEntitiesRef.current = newCrossEntities;
      show();
    },
    [viewer, hide, show]
  );

  return { show, hide, updatePosition };
};

export default use3DCross;
