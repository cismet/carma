import type { Scene } from "three";

import type { ViewStateVisualizerImagePlaneGeometry } from "../../derived/camera-view-geometry";
import type { ViewStateVisualizerSize } from "../../view-state-visualizer-types";
import { createThreePart } from "../../../../common/create-part";
import { createWideLineSet } from "../../../../common/wide-lines";
export const IMAGE_PLANE_AXIS_KEYS = {
  FORWARD: "forward",
  RIGHT: "right",
  UP: "up",
  ORIGIN_X: "originX",
  ORIGIN_Y: "originY",
  CAMERA_FORWARD: "cameraForward",
  CAMERA_RIGHT: "cameraRight",
  CAMERA_UP: "cameraUp",
} as const;

type ImagePlaneAxisKey =
  (typeof IMAGE_PLANE_AXIS_KEYS)[keyof typeof IMAGE_PLANE_AXIS_KEYS];

export type ImagePlaneAxisColors = {
  edge: string | number;
  imageX: string;
  imageY: string;
};

export type ImagePlaneAxisDisplay = {
  showAxes: boolean;
  axisLineWidthPx: number;
  cueColors: {
    imageX: string;
    imageY: string;
  };
  edgeColor: string | number;
};

export const createImagePlaneAxes = (
  scene: Scene,
  size: ViewStateVisualizerSize,
  options: {
    initialColors: ImagePlaneAxisColors;
    cameraBoxSize: number;
    forwardOpacity: number;
    rightOpacity: number;
    upOpacity: number;
    originOpacity: number;
  }
) => {
  const wideLines = createWideLineSet<ImagePlaneAxisKey>(scene, size, [
    {
      key: IMAGE_PLANE_AXIS_KEYS.FORWARD,
      color: options.initialColors.edge,
      opacity: options.forwardOpacity,
    },
    {
      key: IMAGE_PLANE_AXIS_KEYS.RIGHT,
      color: options.initialColors.imageX,
      opacity: options.rightOpacity,
    },
    {
      key: IMAGE_PLANE_AXIS_KEYS.UP,
      color: options.initialColors.imageY,
      opacity: options.upOpacity,
    },
    {
      key: IMAGE_PLANE_AXIS_KEYS.ORIGIN_X,
      color: options.initialColors.edge,
      opacity: options.originOpacity,
    },
    {
      key: IMAGE_PLANE_AXIS_KEYS.ORIGIN_Y,
      color: options.initialColors.edge,
      opacity: options.originOpacity,
    },
    {
      key: IMAGE_PLANE_AXIS_KEYS.CAMERA_FORWARD,
      color: options.initialColors.edge,
      opacity: options.forwardOpacity,
    },
    {
      key: IMAGE_PLANE_AXIS_KEYS.CAMERA_RIGHT,
      color: options.initialColors.imageX,
      opacity: options.rightOpacity,
    },
    {
      key: IMAGE_PLANE_AXIS_KEYS.CAMERA_UP,
      color: options.initialColors.imageY,
      opacity: options.upOpacity,
    },
  ]);

  return createThreePart<
    ViewStateVisualizerImagePlaneGeometry,
    ImagePlaneAxisDisplay
  >({
    update: (geometry) => {
      const cameraBasisOrigin = geometry.cameraPosition.clone();
      const cameraBasisLineLength = options.cameraBoxSize * 1.1;

      wideLines.setLine(IMAGE_PLANE_AXIS_KEYS.FORWARD, [
        geometry.cameraPosition.clone(),
        geometry.cameraPosition
          .clone()
          .add(
            geometry.forward
              .clone()
              .multiplyScalar(geometry.cameraPosition.length())
          ),
      ]);
      wideLines.setLine(IMAGE_PLANE_AXIS_KEYS.RIGHT, [
        geometry.imagePlaneAxisOrigin.clone(),
        geometry.imagePlaneXAxisEnd.clone(),
      ]);
      wideLines.setLine(IMAGE_PLANE_AXIS_KEYS.UP, [
        geometry.imagePlaneAxisOrigin.clone(),
        geometry.imagePlaneYAxisEnd.clone(),
      ]);
      wideLines.setLine(
        IMAGE_PLANE_AXIS_KEYS.ORIGIN_X,
        geometry.imagePlaneOriginX
      );
      wideLines.setLine(
        IMAGE_PLANE_AXIS_KEYS.ORIGIN_Y,
        geometry.imagePlaneOriginY
      );
      wideLines.setLine(IMAGE_PLANE_AXIS_KEYS.CAMERA_FORWARD, [
        cameraBasisOrigin.clone(),
        cameraBasisOrigin
          .clone()
          .add(
            geometry.forward
              .clone()
              .negate()
              .multiplyScalar(cameraBasisLineLength)
          ),
      ]);
      wideLines.setLine(IMAGE_PLANE_AXIS_KEYS.CAMERA_RIGHT, [
        cameraBasisOrigin.clone(),
        cameraBasisOrigin
          .clone()
          .add(geometry.right.clone().multiplyScalar(cameraBasisLineLength)),
      ]);
      wideLines.setLine(IMAGE_PLANE_AXIS_KEYS.CAMERA_UP, [
        cameraBasisOrigin.clone(),
        cameraBasisOrigin
          .clone()
          .add(geometry.up.clone().multiplyScalar(cameraBasisLineLength)),
      ]);
    },
    setDisplay: (display) => {
      wideLines.setVisible(IMAGE_PLANE_AXIS_KEYS.FORWARD, display.showAxes);
      wideLines.setVisible(IMAGE_PLANE_AXIS_KEYS.RIGHT, display.showAxes);
      wideLines.setVisible(IMAGE_PLANE_AXIS_KEYS.UP, display.showAxes);
      wideLines.setVisible(IMAGE_PLANE_AXIS_KEYS.ORIGIN_X, display.showAxes);
      wideLines.setVisible(IMAGE_PLANE_AXIS_KEYS.ORIGIN_Y, display.showAxes);
      wideLines.setVisible(
        IMAGE_PLANE_AXIS_KEYS.CAMERA_FORWARD,
        display.showAxes
      );
      wideLines.setVisible(
        IMAGE_PLANE_AXIS_KEYS.CAMERA_RIGHT,
        display.showAxes
      );
      wideLines.setVisible(IMAGE_PLANE_AXIS_KEYS.CAMERA_UP, display.showAxes);

      wideLines.setWidth(
        IMAGE_PLANE_AXIS_KEYS.FORWARD,
        display.axisLineWidthPx
      );
      wideLines.setWidth(IMAGE_PLANE_AXIS_KEYS.RIGHT, display.axisLineWidthPx);
      wideLines.setWidth(IMAGE_PLANE_AXIS_KEYS.UP, display.axisLineWidthPx);
      wideLines.setWidth(
        IMAGE_PLANE_AXIS_KEYS.ORIGIN_X,
        display.axisLineWidthPx
      );
      wideLines.setWidth(
        IMAGE_PLANE_AXIS_KEYS.ORIGIN_Y,
        display.axisLineWidthPx
      );
      wideLines.setWidth(
        IMAGE_PLANE_AXIS_KEYS.CAMERA_FORWARD,
        display.axisLineWidthPx
      );
      wideLines.setWidth(
        IMAGE_PLANE_AXIS_KEYS.CAMERA_RIGHT,
        display.axisLineWidthPx
      );
      wideLines.setWidth(
        IMAGE_PLANE_AXIS_KEYS.CAMERA_UP,
        display.axisLineWidthPx
      );

      wideLines.setColor(IMAGE_PLANE_AXIS_KEYS.FORWARD, display.edgeColor);
      wideLines.setColor(IMAGE_PLANE_AXIS_KEYS.RIGHT, display.cueColors.imageX);
      wideLines.setColor(IMAGE_PLANE_AXIS_KEYS.UP, display.cueColors.imageY);
      wideLines.setColor(IMAGE_PLANE_AXIS_KEYS.ORIGIN_X, display.edgeColor);
      wideLines.setColor(IMAGE_PLANE_AXIS_KEYS.ORIGIN_Y, display.edgeColor);
      wideLines.setColor(
        IMAGE_PLANE_AXIS_KEYS.CAMERA_FORWARD,
        display.edgeColor
      );
      wideLines.setColor(
        IMAGE_PLANE_AXIS_KEYS.CAMERA_RIGHT,
        display.cueColors.imageX
      );
      wideLines.setColor(
        IMAGE_PLANE_AXIS_KEYS.CAMERA_UP,
        display.cueColors.imageY
      );
    },
    resize: wideLines.resize,
    dispose: wideLines.dispose,
  });
};
