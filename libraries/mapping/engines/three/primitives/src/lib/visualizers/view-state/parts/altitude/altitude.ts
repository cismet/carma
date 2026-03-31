import {
  BufferGeometry,
  CircleGeometry,
  DoubleSide,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  type Scene,
  type Vector3,
} from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

import type { ViewStateVisualizerAltitudeStemGeometry } from "../../derived/altitude-stem-geometry";
import type { ViewStateVisualizerSize } from "../../view-state-visualizer-types";
import { createThreePart } from "../../../../common/create-part";
import {
  disposeBasicLineObject,
  setLineColor,
  setLineGeometry,
  setLineWidth,
} from "../../../../common/line-helpers";
import { disposeMeshObject } from "../../../../common/mesh-helpers";
import {
  disposeWideLine,
  setWideLineColor,
  setWideLineGeometry,
  setWideLineResolution,
  setWideLineWidth,
} from "../../../../common/wide-lines";
export type AltitudeDisplay = {
  visible: boolean;
  showScaleBreak: boolean;
  lineWidthPx: number;
  cueColor: string | number;
};

export type AltitudeGeometry = {
  planeDiscY: number;
  planeDiscPoints: Vector3[];
  stemGeometry: ViewStateVisualizerAltitudeStemGeometry;
};

export const createAltitude = (
  scene: Scene,
  size: ViewStateVisualizerSize,
  options: {
    zeroElevationDiscRadius: number;
    discSegments: number;
    discColor: number;
    discOpacity: number;
    outlineColor: number;
    outlineOpacity: number;
    lineColor: number;
    lineOpacity: number;
    breakOpacity: number;
  }
) => {
  const planeDisc = new Mesh(
    new CircleGeometry(options.zeroElevationDiscRadius, options.discSegments),
    new MeshBasicMaterial({
      color: options.discColor,
      transparent: true,
      opacity: options.discOpacity,
      depthWrite: false,
      side: DoubleSide,
    })
  );
  planeDisc.rotation.x = -Math.PI / 2;
  scene.add(planeDisc);

  const planeDiscOutline = new LineLoop(
    new BufferGeometry(),
    new LineBasicMaterial({
      color: options.outlineColor,
      transparent: true,
      opacity: options.outlineOpacity,
    })
  );
  scene.add(planeDiscOutline);

  const altitudeLineLower = new Line2(
    new LineGeometry(),
    new LineMaterial({
      color: options.lineColor,
      transparent: true,
      opacity: options.lineOpacity,
    })
  );
  setWideLineResolution(altitudeLineLower, size);
  scene.add(altitudeLineLower);

  const altitudeLineUpper = new Line2(
    new LineGeometry(),
    new LineMaterial({
      color: options.lineColor,
      transparent: true,
      opacity: options.lineOpacity,
    })
  );
  setWideLineResolution(altitudeLineUpper, size);
  scene.add(altitudeLineUpper);

  const altitudeScaleBreakUpper = new Line2(
    new LineGeometry(),
    new LineMaterial({
      color: options.lineColor,
      transparent: true,
      opacity: options.breakOpacity,
    })
  );
  setWideLineResolution(altitudeScaleBreakUpper, size);
  scene.add(altitudeScaleBreakUpper);

  const altitudeScaleBreakLower = new Line2(
    new LineGeometry(),
    new LineMaterial({
      color: options.lineColor,
      transparent: true,
      opacity: options.breakOpacity,
    })
  );
  setWideLineResolution(altitudeScaleBreakLower, size);
  scene.add(altitudeScaleBreakLower);

  let currentDisplay: AltitudeDisplay = {
    visible: true,
    showScaleBreak: true,
    lineWidthPx: 1,
    cueColor: options.lineColor,
  };

  const hideUpperStem = () => {
    setWideLineGeometry(altitudeLineUpper, []);
    altitudeLineUpper.visible = false;
  };

  const hideScaleBreak = () => {
    setWideLineGeometry(altitudeScaleBreakUpper, []);
    setWideLineGeometry(altitudeScaleBreakLower, []);
    altitudeScaleBreakUpper.visible = false;
    altitudeScaleBreakLower.visible = false;
  };

  return createThreePart<AltitudeGeometry, AltitudeDisplay>({
    update: ({ planeDiscY, planeDiscPoints, stemGeometry }) => {
      planeDisc.position.set(0, planeDiscY, 0);
      setLineGeometry(planeDiscOutline, planeDiscPoints);

      const [lowerSegment, upperSegment] = stemGeometry.stemSegments;
      setWideLineGeometry(altitudeLineLower, lowerSegment ?? []);
      altitudeLineLower.visible =
        currentDisplay.visible && Boolean(lowerSegment);

      if (upperSegment) {
        setWideLineGeometry(altitudeLineUpper, upperSegment);
        altitudeLineUpper.visible = currentDisplay.visible;
      } else {
        hideUpperStem();
      }

      if (stemGeometry.overflowScaleBreakMarkers) {
        setWideLineGeometry(
          altitudeScaleBreakUpper,
          stemGeometry.overflowScaleBreakMarkers[0]
        );
        setWideLineGeometry(
          altitudeScaleBreakLower,
          stemGeometry.overflowScaleBreakMarkers[1]
        );
        const showBreak =
          currentDisplay.visible && currentDisplay.showScaleBreak;
        altitudeScaleBreakUpper.visible = showBreak;
        altitudeScaleBreakLower.visible = showBreak;
      } else {
        hideScaleBreak();
      }
    },
    setDisplay: (display) => {
      currentDisplay = display;
      planeDisc.visible = display.visible;
      planeDiscOutline.visible = display.visible;
      altitudeLineLower.visible = display.visible && altitudeLineLower.visible;
      altitudeLineUpper.visible = display.visible && altitudeLineUpper.visible;
      altitudeScaleBreakUpper.visible =
        display.visible &&
        display.showScaleBreak &&
        altitudeScaleBreakUpper.visible;
      altitudeScaleBreakLower.visible =
        display.visible &&
        display.showScaleBreak &&
        altitudeScaleBreakLower.visible;

      setLineWidth(planeDiscOutline, display.lineWidthPx);
      setWideLineWidth(altitudeLineLower, display.lineWidthPx);
      setWideLineWidth(altitudeLineUpper, display.lineWidthPx);
      setWideLineWidth(altitudeScaleBreakUpper, display.lineWidthPx);
      setWideLineWidth(altitudeScaleBreakLower, display.lineWidthPx);

      setLineColor(planeDiscOutline, display.cueColor);
      setWideLineColor(altitudeLineLower, display.cueColor);
      setWideLineColor(altitudeLineUpper, display.cueColor);
      setWideLineColor(altitudeScaleBreakUpper, display.cueColor);
      setWideLineColor(altitudeScaleBreakLower, display.cueColor);
    },
    resize: (nextSize) => {
      setWideLineResolution(altitudeLineLower, nextSize);
      setWideLineResolution(altitudeLineUpper, nextSize);
      setWideLineResolution(altitudeScaleBreakUpper, nextSize);
      setWideLineResolution(altitudeScaleBreakLower, nextSize);
    },
    dispose: () => {
      disposeMeshObject(planeDisc);
      disposeBasicLineObject(planeDiscOutline);
      disposeWideLine(altitudeLineLower);
      disposeWideLine(altitudeLineUpper);
      disposeWideLine(altitudeScaleBreakUpper);
      disposeWideLine(altitudeScaleBreakLower);
    },
  });
};
