import type { Scene } from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { ViewStateVisualizerImagePlaneGeometry } from "../../derived/camera-view-geometry";
import type { ViewStateVisualizerSize } from "../../view-state-visualizer-types";
import { createThreePart } from "../../../../common/create-part";
import {
  disposeWideLine,
  setWideLineGeometry,
  setWideLineResolution,
  setWideLineWidth,
} from "../../../../common/wide-lines";

export type FrustumDisplay = {
  show: boolean;
  lineWidthPx: number;
};

export const createFrustum = (
  scene: Scene,
  size: ViewStateVisualizerSize,
  options: {
    color: number;
    opacity: number;
  }
) => {
  const edgeLines = Array.from({ length: 4 }, () => {
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
    return line;
  });

  let currentDisplay: FrustumDisplay = {
    show: true,
    lineWidthPx: 1,
  };
  let currentVisual: ViewStateVisualizerImagePlaneGeometry | null = null;

  const applyVisibility = () => {
    edgeLines.forEach((line, index) => {
      const edge = currentVisual?.frustumEdges[index];
      line.visible = currentDisplay.show && Boolean(edge);
    });
  };

  return createThreePart<ViewStateVisualizerImagePlaneGeometry, FrustumDisplay>(
    {
      update: (visual) => {
        currentVisual = visual;
        edgeLines.forEach((line, index) => {
          const edge = visual.frustumEdges[index];
          setWideLineGeometry(
            line,
            edge
              ? edge
              : [visual.cameraPosition.clone(), visual.cameraPosition.clone()]
          );
        });
        applyVisibility();
      },
      setDisplay: (display) => {
        currentDisplay = display;
        edgeLines.forEach((line) => {
          setWideLineWidth(line, display.lineWidthPx);
        });
        applyVisibility();
      },
      resize: (nextSize) => {
        edgeLines.forEach((line) => setWideLineResolution(line, nextSize));
      },
      dispose: () => {
        edgeLines.forEach(disposeWideLine);
      },
    }
  );
};
