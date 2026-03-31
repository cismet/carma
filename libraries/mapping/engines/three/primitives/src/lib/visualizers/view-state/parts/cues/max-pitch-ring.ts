import {
  BufferGeometry,
  Line,
  LineDashedMaterial,
  type Scene,
  type Vector3,
} from "three";

import { createThreePart } from "../../../../common/create-part";
import {
  disposeBasicLineObject,
  setLineColor,
  setLineGeometry,
  setLineWidth,
} from "../../../../common/line-helpers";
const ORIGIN_POINTS = [] as Vector3[];

export type MaxPitchRingDisplay = {
  visible: boolean;
  lineWidthPx: number;
  color: string | number;
};

export const createMaxPitchRing = (
  scene: Scene,
  options: {
    color: string | number;
    opacity: number;
    dashSize: number;
    gapSize: number;
    renderOrder?: number;
  }
) => {
  const line = new Line(
    new BufferGeometry(),
    new LineDashedMaterial({
      color: options.color,
      transparent: true,
      opacity: options.opacity,
      dashSize: options.dashSize,
      gapSize: options.gapSize,
      depthTest: false,
      depthWrite: false,
    })
  );
  line.renderOrder = options.renderOrder ?? 4;
  scene.add(line);

  let currentDisplay: MaxPitchRingDisplay = {
    visible: true,
    lineWidthPx: 1,
    color: options.color,
  };

  return createThreePart<Vector3[] | null, MaxPitchRingDisplay>({
    update: (points) => {
      if (points && points.length > 0) {
        setLineGeometry(line, points);
        line.visible = currentDisplay.visible;
        return;
      }

      setLineGeometry(line, ORIGIN_POINTS);
      line.visible = false;
    },
    setDisplay: (display) => {
      currentDisplay = display;
      setLineWidth(line, display.lineWidthPx);
      setLineColor(line, display.color);
      line.visible =
        display.visible &&
        (line.geometry.getAttribute("position")?.count ?? 0) > 0;
    },
    dispose: () => disposeBasicLineObject(line),
  });
};
