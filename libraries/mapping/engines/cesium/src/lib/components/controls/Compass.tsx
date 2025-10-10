import { MouseEvent, ReactNode, forwardRef, useCallback } from "react";

import { faCompass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  defined,
  Cartesian2,
} from "cesium";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";

import { useCesiumContext } from "../../hooks/useCesiumContext";
import { Tooltip } from "antd";
import { pickSceneCenter } from "../../utils/pickers";

type CompassProps = {
  children?: ReactNode;
  disabled?: boolean;
};

type Ref = HTMLButtonElement;

export const Compass = forwardRef<Ref, CompassProps>(({ disabled }, ref) => {
  const { withScene, minZoomDistanceRef } = useCesiumContext();
  const minZoomDistance = minZoomDistanceRef.current;

  const handleFlyToCenter = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();

      withScene((scene) => {
        const windowPosition = new Cartesian2(
          scene.canvas.clientWidth / 2,
          scene.canvas.clientHeight / 2
        );
        const horizonTest = scene.camera.pickEllipsoid(windowPosition);
        let destination = scene.camera.position;
        if (defined(horizonTest)) {
          console.info("scene center below horizon");
          //const pos = getCanvasCenter(viewer);
          const { scenePosition, coordinates } = pickSceneCenter(scene, {
            getCoordinates: true,
          });
          console.debug("pick compass", coordinates, scenePosition);
          if (scenePosition && coordinates) {
            const distance = Cartesian3.distance(
              scenePosition,
              scene.camera.position
            );
            const cartographic = coordinates;
            const longitude = CesiumMath.toDegrees(cartographic.longitude);
            const latitude = CesiumMath.toDegrees(cartographic.latitude);
            destination = Cartesian3.fromDegrees(
              longitude,
              latitude,
              cartographic.height + Math.max(distance, minZoomDistance)
            );
          }
        } else {
          console.info(
            "scene above horizon, using camera position as reference"
          );
          // use camera position if horizon is not visible
          // bump up the camera a bit if too close too ground
          const cartographic = Cartographic.fromCartesian(
            scene.camera.position
          );
          const longitude = CesiumMath.toDegrees(cartographic.longitude);
          const latitude = CesiumMath.toDegrees(cartographic.latitude);
          destination = Cartesian3.fromDegrees(
            longitude,
            latitude,
            cartographic.height + minZoomDistance
          );
        }

        console.debug("HOOK: [2D3D|CESIUM|CAMERA] Compass FlyTo");
        scene.camera.flyTo({
          destination,
          orientation: {
            heading: CesiumMath.toRadians(0), // facing north
            pitch: CesiumMath.toRadians(-90), // looking straight down
            roll: 0.0,
          },
        });
      }, "handleFlyToCenter");
    },
    [withScene, minZoomDistance]
  );

  return (
    <Tooltip title="Nach Norden ausrichten" placement="right">
      <ControlButtonStyler
        onClick={handleFlyToCenter}
        disabled={disabled}
        ref={ref}
        dataTestId="compass-control"
      >
        <FontAwesomeIcon icon={faCompass}></FontAwesomeIcon>
      </ControlButtonStyler>
    </Tooltip>
  );
});

export default Compass;
