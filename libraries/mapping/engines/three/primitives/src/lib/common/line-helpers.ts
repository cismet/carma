import {
  BufferAttribute,
  Line,
  LineBasicMaterial,
  LineLoop,
  Material,
  type BufferGeometry,
  type Vector3,
} from "three";
import type { LineSegments } from "three";
export type BasicLineObject = Line | LineLoop | LineSegments;

const setEmptyBasicLineGeometry = (geometry: BufferGeometry): void => {
  geometry.setIndex(null);
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(6), 3)
  );
  geometry.setAttribute(
    "lineDistance",
    new BufferAttribute(new Float32Array(2), 1)
  );
  geometry.setDrawRange(0, 0);
  geometry.computeBoundingSphere();
};

export const setLineGeometry = (
  line: BasicLineObject,
  points: Vector3[]
): void => {
  const geometry = line.geometry as BufferGeometry;

  if (points.length < 2) {
    setEmptyBasicLineGeometry(geometry);
    return;
  }

  geometry.setFromPoints(points);
  geometry.setDrawRange(0, points.length);
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
