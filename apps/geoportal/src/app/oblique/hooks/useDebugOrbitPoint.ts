import { useCallback, useEffect, useRef } from "react";
import {
  Cartesian3,
  Color,
  ConstantPositionProperty,
  defined,
  Entity,
} from "cesium";
import { useCesiumContext } from "@carma-mapping/engines/cesium";

export const useDebugOrbitPoint = (
  isEnabled: boolean,
  orbitPoint: Cartesian3,
  isDebugMode = false
) => {
  const { viewerRef, isValidViewer } = useCesiumContext();
  const orbitPointEntityRef = useRef<Entity | null>(null);

  // Create or update the orbit point entity
  const updateOrbitPointEntity = useCallback(() => {
    const viewer = viewerRef.current;
    if (!isValidViewer()) return;
    if (!orbitPoint || !isDebugMode || !isEnabled) {
      if (orbitPointEntityRef.current && defined(orbitPointEntityRef.current)) {
        viewer.entities.remove(orbitPointEntityRef.current);
        orbitPointEntityRef.current = null;
      }
      return;
    }
    if (!orbitPointEntityRef.current) {
      orbitPointEntityRef.current = viewer.entities.add({
        position: new ConstantPositionProperty(orbitPoint),
        point: {
          pixelSize: 10,
          color: Color.YELLOW,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    } else if (defined(orbitPoint) && defined(orbitPointEntityRef.current)) {
      orbitPointEntityRef.current.position = new ConstantPositionProperty(
        orbitPoint
      );
    }
  }, [viewerRef, isDebugMode, isEnabled, orbitPoint, isValidViewer]);

  // Remove orbit point entity when component unmounts
  useEffect(() => {
    const currentOrbitPointEntity = orbitPointEntityRef.current;
    const viewer = viewerRef.current;

    return () => {
      if (viewer && !viewer.isDestroyed() && defined(currentOrbitPointEntity)) {
        viewer.entities.remove(currentOrbitPointEntity);
      }
    };
  }, [viewerRef]);

  return updateOrbitPointEntity;
};
