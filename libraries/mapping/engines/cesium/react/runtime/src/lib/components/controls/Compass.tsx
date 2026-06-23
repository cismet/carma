import { MouseEvent, ReactNode, forwardRef } from "react";

import { faCompass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";
import { Cartesian3, Cartographic, defined, Cartesian2 } from "cesium";

import {
  CESIUM_LOCAL_NORTH_HEADING_RAD,
  CESIUM_NADIR_PITCH_RAD,
  CESIUM_UP_ROLL_RAD,
} from "@carma-commons/camera/model";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { radToDegNumeric } from "@carma-units";

import { useCesiumContext } from "../../hooks/useCesiumContext";
import { useCesiumRuntime } from "../../hooks/useCesiumRuntime";
import { pickScenePositions } from "../../utils/pick-position/pick-scene-positions";

type CompassProps = {
  children?: ReactNode;
  disabled?: boolean;
};

type Ref = HTMLButtonElement;

const ORBIT_CENTER_POSITION: [number, number] = [0.5, 0.7]; // A bit lower than center to adjust for typical pitch

export const Compass = forwardRef<Ref, CompassProps>(
  ({ children, disabled }, ref) => {
    // todo remove cesium runtime dep for direct scene use
    const runtime = useCesiumRuntime();
    const { withScene, ssccMinimumZoomDistance: minZoomDistance } = useCesiumContext();

    const handleFlyToCenter = (e: MouseEvent) => {
      e.preventDefault();

      let scene;
      withScene((s) => {
        scene = s;
      });

      if (!scene) {
        console.warn("Compass: no cesium scene available for flyTo operation");
        return;
      }

      if (runtime) {
        const windowPosition = new Cartesian2(
          runtime.canvas.clientWidth / 2,
          runtime.canvas.clientHeight / 2
        );
        const horizonTest = runtime.camera.pickEllipsoid(windowPosition);
        let destination = runtime.camera.position;
        if (defined(horizonTest)) {
          console.info("scene center below horizon");
          //const pos = getCanvasCenter(runtime);
          const { scenePosition, coordinates } = pickScenePositions(
            scene,
            [ORBIT_CENTER_POSITION],
            "compass"
          )[0];
          console.debug("pick compass", coordinates, scenePosition);
          if (scenePosition && coordinates) {
            const distance = Cartesian3.distance(
              scenePosition,
              runtime.camera.position
            );
            const cartographic = coordinates;
            const longitude = radToDegNumeric(cartographic.longitude)!;
            const latitude = radToDegNumeric(cartographic.latitude)!;
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
            runtime.camera.position
          );
          const longitude = radToDegNumeric(cartographic.longitude)!;
          const latitude = radToDegNumeric(cartographic.latitude)!;
          destination = Cartesian3.fromDegrees(
            longitude,
            latitude,
            cartographic.height + minZoomDistance
          );
        }

        console.debug("HOOK: [2D3D|CESIUM|CAMERA] Compass FlyTo");
        runtime.camera.flyTo({
          destination,
          orientation: {
            heading: CESIUM_LOCAL_NORTH_HEADING_RAD, // facing north
            pitch: CESIUM_NADIR_PITCH_RAD, // looking straight down
            roll: CESIUM_UP_ROLL_RAD,
          },
        });
      }
    };

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
  }
);

export default Compass;
