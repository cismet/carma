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
  const { isValidWidget: isValidWidget, withWidget } = useCesiumContext();
  const orbitPointEntityRef = useRef<Entity | null>(null);

  // Create or update the orbit point entity
  const updateOrbitPointEntity = useCallback(() => {
    if (!isValidWidget()) return;
    if (!orbitPoint || !isDebugMode || !isEnabled) {
      withWidget((w) => {
        if (
          orbitPointEntityRef.current &&
          defined(orbitPointEntityRef.current)
        ) {
          w.entities.remove(orbitPointEntityRef.current);
          orbitPointEntityRef.current = null;
        }
      });
      return;
    }
    if (!orbitPointEntityRef.current) {
      withWidget((w) => {
        orbitPointEntityRef.current = w.entities.add({
          position: new ConstantPositionProperty(orbitPoint),
          point: {
            pixelSize: 10,
            color: Color.YELLOW,
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      });
    } else if (defined(orbitPoint) && defined(orbitPointEntityRef.current)) {
      orbitPointEntityRef.current.position = new ConstantPositionProperty(
        orbitPoint
      );
    }
  }, [withWidget, isDebugMode, isEnabled, orbitPoint, isValidWidget]);

  // Remove orbit point entity when component unmounts
  useEffect(() => {
    const currentOrbitPointEntity = orbitPointEntityRef.current;
    return () => {
      withWidget((w) => {
        if (!w.isDestroyed() && defined(currentOrbitPointEntity)) {
          w.entities.remove(currentOrbitPointEntity);
        }
      });
    };
  }, [withWidget]);

  return updateOrbitPointEntity;
};
