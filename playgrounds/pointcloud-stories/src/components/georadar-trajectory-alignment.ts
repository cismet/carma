export const TRAJECTORY_ALIGNMENT_MODES = [
  "straight",
  "surface",
  "surface-curve",
] as const;

export type TrajectoryAlignmentMode =
  (typeof TRAJECTORY_ALIGNMENT_MODES)[number];

export type TrajectorySliceFrame = {
  centerUtm: [number, number];
  alongEastNorth: [number, number];
  acrossEastNorth: [number, number];
  surfaceOffsetMeters: number;
};

export type TrajectoryLocalOffset = {
  forward: number;
  down: number;
  right: number;
};

const normalized = (east: number, north: number): [number, number] => {
  const length = Math.hypot(east, north);
  return length > 0 ? [east / length, north / length] : [0, 0];
};

const interpolateDirection = (
  first: [number, number],
  second: [number, number],
  unit: number
) =>
  normalized(
    first[0] + (second[0] - first[0]) * unit,
    first[1] + (second[1] - first[1]) * unit
  );

export const sampleTrajectoryFrameAtStation = (
  frames: TrajectorySliceFrame[],
  stations: number[],
  station: number
): TrajectorySliceFrame => {
  const first = frames[0];
  const last = frames.at(-1)!;
  const firstStation = stations[0] ?? 0;
  const lastStation = stations.at(-1) ?? firstStation;
  if (station <= firstStation) {
    const distance = station - firstStation;
    return {
      ...first,
      centerUtm: [
        first.centerUtm[0] + first.alongEastNorth[0] * distance,
        first.centerUtm[1] + first.alongEastNorth[1] * distance,
      ],
    };
  }
  if (station >= lastStation) {
    const distance = station - lastStation;
    return {
      ...last,
      centerUtm: [
        last.centerUtm[0] + last.alongEastNorth[0] * distance,
        last.centerUtm[1] + last.alongEastNorth[1] * distance,
      ],
    };
  }

  let lower = 0;
  let upper = stations.length - 1;
  while (upper - lower > 1) {
    const middle = Math.floor((lower + upper) / 2);
    if ((stations[middle] ?? firstStation) <= station) lower = middle;
    else upper = middle;
  }
  const startStation = stations[lower] ?? firstStation;
  const endStation = stations[upper] ?? startStation;
  const unit =
    endStation === startStation
      ? 0
      : (station - startStation) / (endStation - startStation);
  const start = frames[lower];
  const end = frames[upper];
  return {
    centerUtm: [
      start.centerUtm[0] + (end.centerUtm[0] - start.centerUtm[0]) * unit,
      start.centerUtm[1] + (end.centerUtm[1] - start.centerUtm[1]) * unit,
    ],
    alongEastNorth: interpolateDirection(
      start.alongEastNorth,
      end.alongEastNorth,
      unit
    ),
    acrossEastNorth: interpolateDirection(
      start.acrossEastNorth,
      end.acrossEastNorth,
      unit
    ),
    surfaceOffsetMeters:
      start.surfaceOffsetMeters +
      (end.surfaceOffsetMeters - start.surfaceOffsetMeters) * unit,
  };
};

export const applyTrajectoryLocalOffsets = (
  frames: TrajectorySliceFrame[],
  stations: number[],
  offset: TrajectoryLocalOffset
): TrajectorySliceFrame[] =>
  frames.map((_, index) => {
    const frame = sampleTrajectoryFrameAtStation(
      frames,
      stations,
      (stations[index] ?? 0) + offset.forward
    );
    return {
      ...frame,
      centerUtm: [
        frame.centerUtm[0] + frame.acrossEastNorth[0] * offset.right,
        frame.centerUtm[1] + frame.acrossEastNorth[1] * offset.right,
      ],
      surfaceOffsetMeters: frame.surfaceOffsetMeters - offset.down,
    };
  });

export const smoothTrajectoryCenterline = (centerline: [number, number][]) =>
  centerline.map((_, index) => {
    let east = 0;
    let north = 0;
    let weightSum = 0;
    for (let offset = -3; offset <= 3; offset += 1) {
      const sample =
        centerline[
          Math.max(0, Math.min(centerline.length - 1, index + offset))
        ];
      const weight = 4 - Math.abs(offset);
      east += sample[0] * weight;
      north += sample[1] * weight;
      weightSum += weight;
    }
    return [east / weightSum, north / weightSum] as [number, number];
  });

export const calculateTrajectorySliceFrames = ({
  mode,
  centerline,
  origin,
  alongEastNorth,
  acrossEastNorth,
  sliceMeters,
  surfaceOffsetsMeters,
}: {
  mode: TrajectoryAlignmentMode;
  centerline: [number, number][];
  origin: [number, number];
  alongEastNorth: [number, number];
  acrossEastNorth: [number, number];
  sliceMeters: number[];
  surfaceOffsetsMeters: number[];
}): TrajectorySliceFrame[] => {
  const smoothed = smoothTrajectoryCenterline(centerline);
  const halfLength = (sliceMeters.at(-1) ?? 0) / 2;
  return centerline.map((actualCenter, index) => {
    if (mode !== "surface-curve") {
      const along = (sliceMeters[index] ?? 0) - halfLength;
      return {
        centerUtm: [
          origin[0] + alongEastNorth[0] * along,
          origin[1] + alongEastNorth[1] * along,
        ],
        alongEastNorth,
        acrossEastNorth,
        surfaceOffsetMeters:
          mode === "straight" ? 0 : surfaceOffsetsMeters[index] ?? 0,
      };
    }

    const previous = smoothed[Math.max(0, index - 1)];
    const next = smoothed[Math.min(smoothed.length - 1, index + 1)];
    const tangent = normalized(next[0] - previous[0], next[1] - previous[1]);
    const usableTangent =
      tangent[0] === 0 && tangent[1] === 0 ? alongEastNorth : tangent;
    let localAcross: [number, number] = [-usableTangent[1], usableTangent[0]];
    if (
      localAcross[0] * acrossEastNorth[0] +
        localAcross[1] * acrossEastNorth[1] <
      0
    ) {
      localAcross = [-localAcross[0], -localAcross[1]];
    }
    return {
      centerUtm: actualCenter,
      alongEastNorth: usableTangent,
      acrossEastNorth: localAcross,
      surfaceOffsetMeters: surfaceOffsetsMeters[index] ?? 0,
    };
  });
};

export const calculateTrajectoryCurveOffsets = ({
  centerline,
  origin,
  alongEastNorth,
  acrossEastNorth,
  sliceMeters,
}: {
  centerline: [number, number][];
  origin: [number, number];
  alongEastNorth: [number, number];
  acrossEastNorth: [number, number];
  sliceMeters: number[];
}) => {
  const halfLength = (sliceMeters.at(-1) ?? 0) / 2;
  return centerline.map((actual, index) => {
    const along = (sliceMeters[index] ?? 0) - halfLength;
    const expectedEast = origin[0] + alongEastNorth[0] * along;
    const expectedNorth = origin[1] + alongEastNorth[1] * along;
    return (
      (actual[0] - expectedEast) * acrossEastNorth[0] +
      (actual[1] - expectedNorth) * acrossEastNorth[1]
    );
  });
};
