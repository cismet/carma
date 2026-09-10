import type { Scene, Vector3 } from "three";

import { buildAxisLinePoints } from "../../derived/axis-line-points";
import type { ViewStateVisualizerSize } from "../../view-state-visualizer-types";
import { createThreePart } from "../../../../common/create-part";
import { createWideLineSet } from "../../../../common/wide-lines";
export const WORLD_AXIS_KEYS = {
  EAST: "east",
  NORTH: "north",
  UP: "up",
} as const;

type WorldAxisKey = (typeof WORLD_AXIS_KEYS)[keyof typeof WORLD_AXIS_KEYS];

const WORLD_AXIS_KEY_LIST = Object.values(WORLD_AXIS_KEYS) as WorldAxisKey[];

export type WorldAxisColors = {
  east: string;
  north: string;
  up: string;
};

export type WorldAxisGeometry = {
  origin: Vector3;
  eastDirection: Vector3;
  eastLength: number;
  northDirection: Vector3;
  northLength: number;
  upDirection: Vector3;
  upLength: number;
};

export type WorldAxisDisplay = {
  visible: boolean;
  showUp: boolean;
  lineWidthPx: number;
  cueColors: WorldAxisColors;
};

export const createWorldAxes = (
  scene: Scene,
  size: ViewStateVisualizerSize,
  options: {
    initialColors: WorldAxisColors;
    opacity: number;
  }
) => {
  const wideLines = createWideLineSet<WorldAxisKey>(scene, size, [
    {
      key: WORLD_AXIS_KEYS.EAST,
      color: options.initialColors.east,
      opacity: options.opacity,
    },
    {
      key: WORLD_AXIS_KEYS.NORTH,
      color: options.initialColors.north,
      opacity: options.opacity,
    },
    {
      key: WORLD_AXIS_KEYS.UP,
      color: options.initialColors.up,
      opacity: options.opacity,
    },
  ]);

  return createThreePart<WorldAxisGeometry, WorldAxisDisplay>({
    update: (geometry) => {
      wideLines.setLine(
        WORLD_AXIS_KEYS.EAST,
        buildAxisLinePoints({
          origin: geometry.origin,
          direction: geometry.eastDirection,
          length: geometry.eastLength,
        })
      );
      wideLines.setLine(
        WORLD_AXIS_KEYS.NORTH,
        buildAxisLinePoints({
          origin: geometry.origin,
          direction: geometry.northDirection,
          length: geometry.northLength,
        })
      );
      wideLines.setLine(
        WORLD_AXIS_KEYS.UP,
        buildAxisLinePoints({
          origin: geometry.origin,
          direction: geometry.upDirection,
          length: geometry.upLength,
        })
      );
    },
    setDisplay: (display) => {
      WORLD_AXIS_KEY_LIST.forEach((key) => {
        wideLines.setVisible(
          key,
          display.visible && (key !== WORLD_AXIS_KEYS.UP || display.showUp)
        );
        wideLines.setWidth(key, display.lineWidthPx);
      });
      wideLines.setColor(WORLD_AXIS_KEYS.EAST, display.cueColors.east);
      wideLines.setColor(WORLD_AXIS_KEYS.NORTH, display.cueColors.north);
      wideLines.setColor(WORLD_AXIS_KEYS.UP, display.cueColors.up);
    },
    resize: wideLines.resize,
    dispose: wideLines.dispose,
  });
};
