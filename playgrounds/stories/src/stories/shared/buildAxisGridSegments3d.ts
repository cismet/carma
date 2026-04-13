export type GridSegment3 = {
  a: { x: number; y: number; z: number };
  b: { x: number; y: number; z: number };
  stroke: string;
  strokeOpacity: number;
  strokeWidth: number;
};

export const buildAxisGridSegments3d = (
  extent: number,
  step: number
): GridSegment3[] => {
  const safeExtent = Math.max(1, Math.floor(extent));
  const safeStep = Math.max(0.5, step);
  const segments: GridSegment3[] = [];

  for (let t = -safeExtent; t <= safeExtent + 1e-6; t += safeStep) {
    segments.push({
      a: { x: -safeExtent, y: t, z: 0 },
      b: { x: safeExtent, y: t, z: 0 },
      stroke: "rgba(56,189,248,0.55)",
      strokeOpacity: 0.55,
      strokeWidth: 1,
    });
    segments.push({
      a: { x: t, y: -safeExtent, z: 0 },
      b: { x: t, y: safeExtent, z: 0 },
      stroke: "rgba(56,189,248,0.55)",
      strokeOpacity: 0.55,
      strokeWidth: 1,
    });

    segments.push({
      a: { x: -safeExtent, y: 0, z: t },
      b: { x: safeExtent, y: 0, z: t },
      stroke: "rgba(34,197,94,0.48)",
      strokeOpacity: 0.48,
      strokeWidth: 1,
    });
    segments.push({
      a: { x: t, y: 0, z: -safeExtent },
      b: { x: t, y: 0, z: safeExtent },
      stroke: "rgba(34,197,94,0.48)",
      strokeOpacity: 0.48,
      strokeWidth: 1,
    });

    segments.push({
      a: { x: 0, y: -safeExtent, z: t },
      b: { x: 0, y: safeExtent, z: t },
      stroke: "rgba(59,130,246,0.48)",
      strokeOpacity: 0.48,
      strokeWidth: 1,
    });
    segments.push({
      a: { x: 0, y: t, z: -safeExtent },
      b: { x: 0, y: t, z: safeExtent },
      stroke: "rgba(59,130,246,0.48)",
      strokeOpacity: 0.48,
      strokeWidth: 1,
    });
  }

  segments.push({
    a: { x: -safeExtent, y: 0, z: 0 },
    b: { x: safeExtent, y: 0, z: 0 },
    stroke: "rgba(239,68,68,0.98)",
    strokeOpacity: 1,
    strokeWidth: 1.4,
  });
  segments.push({
    a: { x: 0, y: -safeExtent, z: 0 },
    b: { x: 0, y: safeExtent, z: 0 },
    stroke: "rgba(34,197,94,0.98)",
    strokeOpacity: 1,
    strokeWidth: 1.4,
  });
  segments.push({
    a: { x: 0, y: 0, z: -safeExtent },
    b: { x: 0, y: 0, z: safeExtent },
    stroke: "rgba(59,130,246,0.98)",
    strokeOpacity: 1,
    strokeWidth: 1.4,
  });

  return segments;
};
