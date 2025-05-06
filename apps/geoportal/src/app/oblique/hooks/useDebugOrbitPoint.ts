import { useCallback, useEffect, useRef } from "react";
import { Cartesian3, Color, ConstantPositionProperty, Entity } from "cesium";
import { useCesiumContext } from "@carma-mapping/cesium-engine";

export const useDebugOrbitPoint = (
  orbitPoint: Cartesian3,
  isDebugMode = false
) => {
  const { viewerRef } = useCesiumContext();
  const orbitPointEntityRef = useRef<Entity | null>(null);

  // Create or update the orbit point entity
  const updateOrbitPointEntity = useCallback(() => {
    if (viewerRef.current || !orbitPoint || !isDebugMode) {
      if (orbitPointEntityRef.current) {
        viewerRef.current.entities.remove(orbitPointEntityRef.current);
        orbitPointEntityRef.current = null;
      }
      return;
    }
    if (!orbitPointEntityRef.current) {
      orbitPointEntityRef.current = viewerRef.current.entities.add({
        position: new ConstantPositionProperty(orbitPoint),
        point: {
          pixelSize: 10,
          color: Color.YELLOW,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    } else {
      orbitPointEntityRef.current.position = new ConstantPositionProperty(
        orbitPoint
      );
    }
  }, [viewerRef, isDebugMode, orbitPoint]);

  // Remove orbit point entity when component unmounts
  useEffect(() => {
    const currentOrbitPointEntity = orbitPointEntityRef.current;
    const viewer = viewerRef.current;

    return () => {
      if (viewer && currentOrbitPointEntity) {
        viewer.entities.remove(currentOrbitPointEntity);
      }
    };
  }, [viewerRef]);

  return updateOrbitPointEntity;
};
