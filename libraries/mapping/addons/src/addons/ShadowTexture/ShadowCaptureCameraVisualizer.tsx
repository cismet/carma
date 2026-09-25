import { useMemo } from "react";

import { CAMERA_TYPE } from "@carma-commons/camera/model";
import { ViewStateVisualizer } from "@carma-mapping/components";
import { buildViewState } from "@carma-mapping/engines-interop/view-state";
import { radToDegNumeric, type Meters, type Radians } from "@carma-units";

import {
  getPrintedProjectorVerticalFov,
  PRINTED_BOARD_LONG_EDGE_METERS,
  PROJECTOR_ASPECT_RATIO,
} from "./shadow-texture-camera";

export const ShadowCaptureCameraVisualizer = ({
  heightMeters,
}: {
  heightMeters: number;
}) => {
  const verticalFov = getPrintedProjectorVerticalFov(heightMeters);
  const worldScaleMeters = Math.max(2.3, heightMeters);
  const viewState = useMemo(
    () =>
      buildViewState({
        longitude: 0,
        latitude: 0,
        altitude: heightMeters,
        bearing: 0,
        pitch: 0,
        roll: 0,
        range: heightMeters,
        intrinsics: {
          type: CAMERA_TYPE.PERSPECTIVE,
          fov: verticalFov as Radians,
          fovHorizontal:
            (2 *
              Math.atan(
                Math.tan(verticalFov / 2) * PROJECTOR_ASPECT_RATIO
              )) as Radians,
          frustum: {
            near: 0.01 as Meters,
            far: (heightMeters + 0.2) as Meters,
          },
        },
        metadata: {
          frameId: 0,
          timestampMs: 0,
          sourceId: "dz-b-prm-shadow-capture",
          source: "user-interaction",
        },
      }),
    [heightMeters, verticalFov]
  );
  const boardHalfWidth = PRINTED_BOARD_LONG_EDGE_METERS / 2 / worldScaleMeters;
  const boardHalfDepth =
    PRINTED_BOARD_LONG_EDGE_METERS /
    (2 * PROJECTOR_ASPECT_RATIO * worldScaleMeters);

  return (
    <div className="w-[260px] text-xs">
      <div className="h-[140px] overflow-hidden">
        <ViewStateVisualizer
          viewState={viewState}
          width={260}
          height={220}
          visualizedOptions={{
            useCameraPosition: true,
            worldScaleMeters,
          }}
          displayOptions={{
            surface: { show: false },
            worldAxes: { show: false },
            angleCues: { show: false },
            altitude: { show: false, showScaleBreak: false },
            cameraView: {
              imagePlane: { show: true },
              frustum: { show: true },
              projectionPlane: { show: true },
              marker: { show: true },
            },
            labels: { showAxes: false, showAngles: false },
          }}
          volumeBoxes={{
            boxes: [
              {
                minimum: [-boardHalfWidth, 0, -boardHalfDepth],
                maximum: [boardHalfWidth, 0.11 / worldScaleMeters, boardHalfDepth],
                color: "#38bdf8",
              },
            ],
          }}
        />
      </div>
      <div className="text-center">
        16:9 · {heightMeters.toFixed(1)} m · vertikaler Bildwinkel{" "}
        {radToDegNumeric(verticalFov).toFixed(1)}°
      </div>
    </div>
  );
};
