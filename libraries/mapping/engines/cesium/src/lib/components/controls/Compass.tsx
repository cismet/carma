import { MouseEvent, ReactNode, forwardRef } from "react";
import { useSelector } from "react-redux";

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

import { useCesiumViewer } from "../../hooks/useCesiumViewer";
import { selectScreenSpaceCameraControllerMinimumZoomDistance } from "../../slices/cesium";
import { pickViewerCanvasCenter } from "../../utils/cesiumHelpers";
import { Tooltip } from "antd";

type CompassProps = {
  children?: ReactNode;
  disabled?: boolean;
};

type Ref = HTMLButtonElement;

export const Compass = forwardRef<Ref, CompassProps>(
  ({ children, disabled }, ref) => {
    const viewer = useCesiumViewer();
    const minZoomDistance = useSelector(
      selectScreenSpaceCameraControllerMinimumZoomDistance
    );

    const handleFlyToCenter = (e: MouseEvent) => {
      e.preventDefault();

      if (viewer) {
        const windowPosition = new Cartesian2(
          viewer.canvas.clientWidth / 2,
          viewer.canvas.clientHeight / 2
        );
        const horizonTest = viewer.camera.pickEllipsoid(windowPosition);
        let destination = viewer.camera.position;
        if (defined(horizonTest)) {
          console.info("scene center below horizon");
          //const pos = getCanvasCenter(viewer);
          const { scenePosition, coordinates } = pickViewerCanvasCenter(
            viewer,
            {
              getCoordinates: true,
            }
          );
          console.debug("pick compass", coordinates, scenePosition);
          if (scenePosition && coordinates) {
            const distance = Cartesian3.distance(
              scenePosition,
              viewer.camera.position
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
            viewer.camera.position
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
        viewer.camera.flyTo({
          destination,
          orientation: {
            heading: CesiumMath.toRadians(0), // facing north
            pitch: CesiumMath.toRadians(-90), // looking straight down
            roll: 0.0,
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
