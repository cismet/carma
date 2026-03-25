import { Vector3, type Scene } from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { ViewStateVisualizerImagePlaneGeometry } from "../../derived/camera-view-geometry";
import type { ViewStateVisualizerSize } from "../../view-state-visualizer-types";
import { createThreePart } from "../../../../common/create-part";
import {
  disposeWideLine,
  setWideLineColor,
  setWideLineGeometry,
  setWideLineResolution,
  setWideLineWidth,
} from "../../../../common/wide-lines";

export type CameraLinkDisplay = {
  show: boolean;
  lineWidthPx: number;
  color: string | number;
};

export const createCameraLink = (
  scene: Scene,
  size: ViewStateVisualizerSize,
  options: {
    color: string | number;
    opacity: number;
  }
) => {
  const line = new Line2(
    new LineGeometry(),
    new LineMaterial({
      color: options.color,
      transparent: true,
      opacity: options.opacity,
    })
  );
  setWideLineResolution(line, size);
  scene.add(line);

  let currentDisplay: CameraLinkDisplay = {
    show: true,
    lineWidthPx: 1,
    color: options.color,
  };

  return createThreePart<
    ViewStateVisualizerImagePlaneGeometry,
    CameraLinkDisplay
  >({
    update: (visual) => {
      setWideLineGeometry(line, [
        new Vector3(0, 0, 0),
        visual.cameraPosition.clone(),
      ]);
      line.visible = currentDisplay.show;
    },
    setDisplay: (display) => {
      currentDisplay = display;
      setWideLineWidth(line, display.lineWidthPx);
      setWideLineColor(line, display.color);
      line.visible = display.show;
    },
    resize: (nextSize) => {
      setWideLineResolution(line, nextSize);
    },
    dispose: () => {
      disposeWideLine(line);
    },
  });
};
