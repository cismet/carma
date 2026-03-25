import type { Scene } from "three";
import type { Vector3 } from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { ThreePartSize } from "./create-part";

type WideLineDefinition<Key extends string> = {
  key: Key;
  color: string | number;
  opacity?: number;
};

export const setWideLineGeometry = (line: Line2, points: Vector3[]) => {
  // `LineGeometry` expects at least one segment (two points). For hidden lines
  // we keep a degenerate zero-length segment and rely on `.visible = false`.
  const safePoints =
    points.length >= 2
      ? points
      : [{ x: 0, y: 0, z: 0 } as Vector3, { x: 0, y: 0, z: 0 } as Vector3];
  const positions = safePoints.flatMap((point) => [point.x, point.y, point.z]);
  (line.geometry as LineGeometry).setPositions(positions);
  line.computeLineDistances();
};

export const setWideLineLoopGeometry = (line: Line2, points: Vector3[]) => {
  if (points.length === 0) {
    setWideLineGeometry(line, []);
    return;
  }

  setWideLineGeometry(line, [...points, points[0].clone()]);
};

export const setWideLineWidth = (line: Line2, width: number) => {
  (line.material as LineMaterial).linewidth = width;
};

export const setWideLineColor = (line: Line2, color: string | number) => {
  (line.material as LineMaterial).color.set(color);
};

export const setWideLineResolution = (line: Line2, size: ThreePartSize) => {
  (line.material as LineMaterial).resolution.set(size.widthPx, size.heightPx);
};

export const disposeWideLine = (line: Line2) => {
  (line.geometry as LineGeometry).dispose();
  (line.material as LineMaterial).dispose();
};

export const createWideLineSet = <Key extends string>(
  scene: Scene,
  size: ThreePartSize,
  definitions: readonly WideLineDefinition<Key>[]
) => {
  const lines = {} as Record<Key, Line2>;

  definitions.forEach((definition) => {
    const line = new Line2(
      new LineGeometry(),
      new LineMaterial({
        color: definition.color,
        transparent: true,
        opacity: definition.opacity ?? 1,
      })
    );
    setWideLineResolution(line, size);
    scene.add(line);
    lines[definition.key] = line;
  });

  return {
    lines,
    setLine: (key: Key, points: Vector3[]) => {
      setWideLineGeometry(lines[key], points);
    },
    setLoop: (key: Key, points: Vector3[]) => {
      setWideLineLoopGeometry(lines[key], points);
    },
    setVisible: (key: Key, visible: boolean) => {
      lines[key].visible = visible;
    },
    setWidth: (key: Key, width: number) => {
      setWideLineWidth(lines[key], width);
    },
    setColor: (key: Key, color: string | number) => {
      setWideLineColor(lines[key], color);
    },
    resize: (nextSize: ThreePartSize) => {
      (Object.values(lines) as Line2[]).forEach((line) =>
        setWideLineResolution(line, nextSize)
      );
    },
    dispose: () => {
      (Object.values(lines) as Line2[]).forEach(disposeWideLine);
    },
  };
};
