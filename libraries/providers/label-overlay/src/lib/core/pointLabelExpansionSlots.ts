import { MINUS_PI_OVER_FOUR, TWO_PI } from "@carma/math";
import { negativePiToPi, zeroToTwoPi } from "@carma/units/helpers";
import type { CssPixelPosition, Radians } from "@carma/units/types";
import type { PointLabelAttach } from "./pointLabelAttach";

export type PointLabelExpansionSlotDescriptor = {
  id: string;
  offset: CssPixelPosition;
  attach: PointLabelAttach;
  angleRad: Radians;
  distancePx: number;
  ringIndex: number;
  orderIndex: number;
  isCenter: boolean;
};

export type PointLabelExpansionSlotStrategy =
  | "equal-angle"
  | "equal-height-sides";

export type PointLabelExpansionSlotPreset =
  | "qgis-9"
  | "diagonal-4"
  | "ring-12";

export type CreatePointLabelExpansionSlotsOptions = {
  slotCount: number;
  radiusPx: number;
  startAngleRad?: Radians;
  includeCenter?: boolean;
  strategy?: PointLabelExpansionSlotStrategy;
};

export type CreatePresetPointLabelExpansionSlotsOptions = {
  radiusPx: number;
  startAngleRad?: Radians;
};

const clampSlotCount = (slotCount: number): number => {
  if (!Number.isFinite(slotCount)) {
    return 0;
  }

  return Math.max(0, Math.min(24, Math.round(slotCount)));
};

const resolvePointLabelAttachForOffset = (
  offset: CssPixelPosition
): PointLabelAttach => {
  if (offset.x < 0) {
    return "right";
  }
  if (offset.x > 0) {
    return "left";
  }
  return "center";
};

const createDescriptor = (
  ringIndex: number,
  x: number,
  y: number
): PointLabelExpansionSlotDescriptor => {
  const offset = {
    x,
    y,
  } as CssPixelPosition;
  const angleRad = Math.atan2(y, x) as Radians;

  return {
    id: `slot-${ringIndex}`,
    offset,
    attach: resolvePointLabelAttachForOffset(offset),
    angleRad,
    distancePx: Math.hypot(x, y),
    ringIndex,
    orderIndex: ringIndex,
    isCenter: false,
  };
};

const normalizeAngleRad = (angleRad: number): Radians =>
  zeroToTwoPi(angleRad as Radians);

const sortClockwiseFromNearestStartAngle = (
  slots: readonly PointLabelExpansionSlotDescriptor[],
  startAngleRad: Radians
): PointLabelExpansionSlotDescriptor[] => {
  if (slots.length <= 1) {
    return [...slots];
  }

  const sortedByAngle = [...slots].sort(
    (left, right) =>
      normalizeAngleRad(left.angleRad) - normalizeAngleRad(right.angleRad)
  );

  const startIndex = sortedByAngle.reduce(
    (bestIndex, candidate, candidateIndex) => {
      const bestCandidate = sortedByAngle[bestIndex];
      const candidateDelta = Math.abs(
        negativePiToPi((candidate.angleRad - startAngleRad) as Radians)
      );
      const bestDelta = Math.abs(
        negativePiToPi((bestCandidate.angleRad - startAngleRad) as Radians)
      );
      return candidateDelta < bestDelta ? candidateIndex : bestIndex;
    },
    0
  );

  return sortedByAngle
    .slice(startIndex)
    .concat(sortedByAngle.slice(0, startIndex))
    .map((slot, orderIndex) => ({
      ...slot,
      orderIndex,
    }));
};

const createEqualAngleRingSlots = (
  slotCount: number,
  radiusPx: number
): PointLabelExpansionSlotDescriptor[] => {
  if (slotCount <= 0 || radiusPx <= 0) {
    return [];
  }

  const stepRad = TWO_PI / slotCount;

  return Array.from({ length: slotCount }, (_, ringIndex) =>
    createDescriptor(
      ringIndex,
      Math.cos(stepRad * ringIndex) * radiusPx,
      Math.sin(stepRad * ringIndex) * radiusPx
    )
  );
};

const createEqualHeightSideRingSlots = (
  slotCount: number,
  radiusPx: number,
  startAngleRad: Radians
): PointLabelExpansionSlotDescriptor[] => {
  if (slotCount <= 0 || radiusPx <= 0) {
    return [];
  }

  if (slotCount === 1) {
    return [
      createDescriptor(
        0,
        Math.cos(startAngleRad) * radiusPx,
        Math.sin(startAngleRad) * radiusPx
      ),
    ];
  }

  const rightCount = Math.ceil(slotCount / 2);
  const leftCount = Math.floor(slotCount / 2);
  const levelCount = Math.max(rightCount, leftCount);
  const yLevels = Array.from({ length: levelCount }, (_, levelIndex) => {
    if (levelCount === 1) {
      return Math.sin(startAngleRad) * radiusPx;
    }

    return -radiusPx + (((levelIndex + 1) * 2 * radiusPx) / (levelCount + 1));
  });

  const slots: PointLabelExpansionSlotDescriptor[] = [];
  let rightPlaced = 0;
  let leftPlaced = 0;

  yLevels.forEach((y) => {
    const xMagnitude = Math.sqrt(Math.max(0, radiusPx * radiusPx - y * y));

    if (rightPlaced < rightCount) {
      slots.push(createDescriptor(slots.length, xMagnitude, y));
      rightPlaced += 1;
    }

    if (leftPlaced < leftCount) {
      slots.push(createDescriptor(slots.length, -xMagnitude, y));
      leftPlaced += 1;
    }
  });

  return slots;
};

export const createPointLabelExpansionSlots = ({
  slotCount,
  radiusPx,
  startAngleRad = MINUS_PI_OVER_FOUR as Radians,
  includeCenter = false,
  strategy = "equal-angle",
}: CreatePointLabelExpansionSlotsOptions): PointLabelExpansionSlotDescriptor[] => {
  const resolvedSlotCount = clampSlotCount(slotCount);
  const resolvedRadiusPx = Number.isFinite(radiusPx) ? Math.max(0, radiusPx) : 0;

  const ringSlots =
    strategy === "equal-height-sides"
      ? createEqualHeightSideRingSlots(
          resolvedSlotCount,
          resolvedRadiusPx,
          startAngleRad
        )
      : createEqualAngleRingSlots(resolvedSlotCount, resolvedRadiusPx);

  const orderedRingSlots = sortClockwiseFromNearestStartAngle(
    ringSlots,
    startAngleRad
  );

  if (!includeCenter) {
    return orderedRingSlots;
  }

  return [
    ...orderedRingSlots,
    {
      id: "slot-center",
      offset: {
        x: 0,
        y: 0,
      } as CssPixelPosition,
      attach: "center",
      angleRad: 0 as Radians,
      distancePx: 0,
      ringIndex: orderedRingSlots.length,
      orderIndex: orderedRingSlots.length,
      isCenter: true,
    },
  ];
};

export const createPresetPointLabelExpansionSlots = (
  preset: PointLabelExpansionSlotPreset,
  {
    radiusPx,
    startAngleRad = MINUS_PI_OVER_FOUR as Radians,
  }: CreatePresetPointLabelExpansionSlotsOptions
): PointLabelExpansionSlotDescriptor[] => {
  if (preset === "diagonal-4") {
    return createPointLabelExpansionSlots({
      slotCount: 4,
      radiusPx,
      startAngleRad,
      strategy: "equal-angle",
      includeCenter: false,
    });
  }

  if (preset === "ring-12") {
    return createPointLabelExpansionSlots({
      slotCount: 12,
      radiusPx,
      startAngleRad,
      strategy: "equal-angle",
      includeCenter: false,
    });
  }

  return createPointLabelExpansionSlots({
    slotCount: 8,
    radiusPx,
    startAngleRad,
    strategy: "equal-angle",
    includeCenter: true,
  });
};
