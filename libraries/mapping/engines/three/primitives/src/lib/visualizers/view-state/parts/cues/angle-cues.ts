import type { Scene, Vector3 } from "three";

import type { ViewStateVisualizerSize } from "../../view-state-visualizer-types";
import { createThreePart } from "../../../../common/create-part";
import { createWideLineSet } from "../../../../common/wide-lines";
export const ANGLE_CUE_KEYS = {
  BEARING_ARC: "bearingArc",
  PITCH_ARC: "pitchArc",
  BEARING_INDICATOR_ARC: "bearingIndicatorArc",
  BEARING_RADIAL: "bearingRadial",
  PITCH_ORIGIN_LINE: "pitchOriginLine",
  ELEVATION_ARC: "elevationArc",
} as const;

type AngleCueKey = (typeof ANGLE_CUE_KEYS)[keyof typeof ANGLE_CUE_KEYS];

const ANGLE_CUE_KEY_LIST = Object.values(ANGLE_CUE_KEYS) as AngleCueKey[];

export type AngleCueColors = {
  bearing: string;
  pitch: string;
  range: string;
};

export type AngleCueGeometry = {
  bearingArcPoints: Vector3[];
  pitchArcPoints: Vector3[];
  bearingIndicatorArcPoints: Vector3[];
  bearingRadialPoints: Vector3[];
  pitchOriginPoints: Vector3[];
  elevationArcPoints: Vector3[];
};

export type AngleCueDisplay = {
  visible: boolean;
  lineWidthPx: number;
  cueColors: AngleCueColors;
};

export const createAngleCues = (
  scene: Scene,
  size: ViewStateVisualizerSize,
  options: {
    initialColors: AngleCueColors;
    bearingOpacity: number;
    pitchOpacity: number;
    rangeOpacity: number;
  }
) => {
  const wideLines = createWideLineSet<AngleCueKey>(scene, size, [
    {
      key: ANGLE_CUE_KEYS.BEARING_ARC,
      color: options.initialColors.bearing,
      opacity: options.bearingOpacity,
    },
    {
      key: ANGLE_CUE_KEYS.PITCH_ARC,
      color: options.initialColors.pitch,
      opacity: options.pitchOpacity,
    },
    {
      key: ANGLE_CUE_KEYS.BEARING_INDICATOR_ARC,
      color: options.initialColors.bearing,
      opacity: options.bearingOpacity,
    },
    {
      key: ANGLE_CUE_KEYS.BEARING_RADIAL,
      color: options.initialColors.bearing,
      opacity: options.bearingOpacity,
    },
    {
      key: ANGLE_CUE_KEYS.PITCH_ORIGIN_LINE,
      color: options.initialColors.range,
      opacity: options.rangeOpacity,
    },
    {
      key: ANGLE_CUE_KEYS.ELEVATION_ARC,
      color: options.initialColors.pitch,
      opacity: options.pitchOpacity,
    },
  ]);

  return createThreePart<AngleCueGeometry, AngleCueDisplay>({
    update: (geometry) => {
      wideLines.setLine(ANGLE_CUE_KEYS.BEARING_ARC, geometry.bearingArcPoints);
      wideLines.setLine(ANGLE_CUE_KEYS.PITCH_ARC, geometry.pitchArcPoints);
      wideLines.setLine(
        ANGLE_CUE_KEYS.BEARING_INDICATOR_ARC,
        geometry.bearingIndicatorArcPoints
      );
      wideLines.setLine(
        ANGLE_CUE_KEYS.BEARING_RADIAL,
        geometry.bearingRadialPoints
      );
      wideLines.setLine(
        ANGLE_CUE_KEYS.PITCH_ORIGIN_LINE,
        geometry.pitchOriginPoints
      );
      wideLines.setLine(
        ANGLE_CUE_KEYS.ELEVATION_ARC,
        geometry.elevationArcPoints
      );
    },
    setDisplay: (display) => {
      ANGLE_CUE_KEY_LIST.forEach((key) => {
        wideLines.setVisible(key, display.visible);
        wideLines.setWidth(key, display.lineWidthPx);
      });
      wideLines.setColor(ANGLE_CUE_KEYS.BEARING_ARC, display.cueColors.bearing);
      wideLines.setColor(
        ANGLE_CUE_KEYS.BEARING_INDICATOR_ARC,
        display.cueColors.bearing
      );
      wideLines.setColor(
        ANGLE_CUE_KEYS.BEARING_RADIAL,
        display.cueColors.bearing
      );
      wideLines.setColor(ANGLE_CUE_KEYS.PITCH_ARC, display.cueColors.pitch);
      wideLines.setColor(ANGLE_CUE_KEYS.ELEVATION_ARC, display.cueColors.pitch);
      wideLines.setColor(
        ANGLE_CUE_KEYS.PITCH_ORIGIN_LINE,
        display.cueColors.range
      );
    },
    resize: wideLines.resize,
    dispose: wideLines.dispose,
  });
};
