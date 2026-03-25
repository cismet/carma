import type { LineSegments } from "three";
import {
  Line,
  LineBasicMaterial,
  LineLoop,
  Material,
  type BufferGeometry,
  type Vector3,
} from "three";

export type BasicLineObject = Line | LineLoop | LineSegments;

export const setLineGeometry = (
  line: BasicLineObject,
  points: Vector3[]
): void => {
  line.geometry.setFromPoints(points);
  if (line instanceof Line && "computeLineDistances" in line) {
    line.computeLineDistances();
  }
};

export const setLineWidth = (line: BasicLineObject, width: number): void => {
  (line.material as LineBasicMaterial).linewidth = width;
};

export const setLineColor = (
  line: BasicLineObject,
  color: string | number
): void => {
  (line.material as LineBasicMaterial).color.set(color);
};

export const disposeBasicLineObject = (line: BasicLineObject): void => {
  line.removeFromParent();
  (line.geometry as BufferGeometry).dispose();
  (line.material as Material).dispose();
};
