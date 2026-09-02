import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  type Scene,
} from "three";

import {
  createThreePart,
  disposeThreePartResources,
  removeThreePartObjects,
} from "../../../../common/create-part";
import type { ViewStateVisualizerVolumeBox } from "../../view-state-visualizer-types";

const BOX_EDGES = [
  [0, 1],
  [1, 3],
  [3, 2],
  [2, 0],
  [4, 5],
  [5, 7],
  [7, 6],
  [6, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
] as const;

export const buildVolumeBoxLinePositions = (
  boxes: readonly ViewStateVisualizerVolumeBox[]
): Float32Array => {
  const positions = new Float32Array(boxes.length * BOX_EDGES.length * 2 * 3);
  let offset = 0;
  for (const { minimum, maximum } of boxes) {
    const corners = [
      [minimum[0], minimum[1], minimum[2]],
      [maximum[0], minimum[1], minimum[2]],
      [minimum[0], maximum[1], minimum[2]],
      [maximum[0], maximum[1], minimum[2]],
      [minimum[0], minimum[1], maximum[2]],
      [maximum[0], minimum[1], maximum[2]],
      [minimum[0], maximum[1], maximum[2]],
      [maximum[0], maximum[1], maximum[2]],
    ] as const;
    for (const [startIndex, endIndex] of BOX_EDGES) {
      positions.set(corners[startIndex], offset);
      offset += 3;
      positions.set(corners[endIndex], offset);
      offset += 3;
    }
  }
  return positions;
};

export const buildVolumeBoxLineColors = (
  boxes: readonly ViewStateVisualizerVolumeBox[],
  fallbackColor: string
): Float32Array => {
  const colors = new Float32Array(boxes.length * BOX_EDGES.length * 2 * 3);
  const color = new Color();
  let offset = 0;
  for (const box of boxes) {
    color.set(box.color ?? fallbackColor);
    for (let vertex = 0; vertex < BOX_EDGES.length * 2; vertex += 1) {
      colors[offset++] = color.r;
      colors[offset++] = color.g;
      colors[offset++] = color.b;
    }
  }
  return colors;
};

export type VolumeBoxesDisplay = Readonly<{
  visible: boolean;
  color: string;
  opacity: number;
}>;

export const createVolumeBoxes = (scene: Scene) => {
  const geometry = new BufferGeometry();
  const material = new LineBasicMaterial({
    color: "#ffffff",
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    toneMapped: false,
  });
  const lines = new LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.renderOrder = 3;
  scene.add(lines);

  let boxes: readonly ViewStateVisualizerVolumeBox[] = [];
  let fallbackColor = "#0f766e";
  const updateGeometry = () => {
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(buildVolumeBoxLinePositions(boxes), 3)
    );
    geometry.setAttribute(
      "color",
      new Float32BufferAttribute(
        buildVolumeBoxLineColors(boxes, fallbackColor),
        3
      )
    );
    geometry.computeBoundingSphere();
  };

  return createThreePart<
    readonly ViewStateVisualizerVolumeBox[],
    VolumeBoxesDisplay
  >({
    update: (nextBoxes) => {
      boxes = nextBoxes;
      updateGeometry();
    },
    setDisplay: ({ visible, color, opacity }) => {
      lines.visible = visible;
      if (fallbackColor !== color) {
        fallbackColor = color;
        updateGeometry();
      }
      material.opacity = opacity;
    },
    dispose: () => {
      removeThreePartObjects([lines]);
      disposeThreePartResources([geometry, material]);
    },
  });
};
