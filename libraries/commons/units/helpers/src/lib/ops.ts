// brand-preserving arithmetic on number-branded types
export const brandedNegate = <T extends number>(x: T): T => -(x as number) as T;

export const brandedAdd = <T extends number>(a: T, b: T): T =>
  ((a as number) + (b as number)) as T;

export const brandedSub = <T extends number>(a: T, b: T): T =>
  ((a as number) - (b as number)) as T;

export const brandedMul = <T extends number>(x: T, scalar: number): T =>
  ((x as number) * scalar) as T;

export const brandedDiv = <T extends number>(x: T, scalar: number): T =>
  ((x as number) / scalar) as T;

export const brandedAbs = <T extends number>(x: T): T =>
  Math.abs(x as number) as T;

export const brandedMin = <T extends number>(a: T, b: T): T =>
  Math.min(a as number, b as number) as T;

export const brandedMax = <T extends number>(a: T, b: T): T =>
  Math.max(a as number, b as number) as T;

export const brandedClamp = <T extends number>(x: T, min: T, max: T): T =>
  Math.min(Math.max(x as number, min as number), max as number) as T;

export const clampToToleranceRange = <T extends number>(
  value: T,
  referenceValue: T,
  tolerance: number
): [T, boolean] => {
  const min = ((referenceValue as number) - tolerance) as T;
  const max = ((referenceValue as number) + tolerance) as T;
  if ((value as number) < (min as number)) {
    return [min, true];
  }
  if ((value as number) > (max as number)) {
    return [max, true];
  }
  return [value, false];
};

export const clamp = <T extends number>(value: T, min?: T, max?: T): T => {
  let result = value as number;
  if (typeof min === "number") {
    result = Math.max(min as number, result);
  }
  if (typeof max === "number") {
    result = Math.min(max as number, result);
  }
  return result as T;
};

export const isClose = <T extends number>(
  a: T,
  b: T,
  epsilon: number = Number.EPSILON
): boolean => Math.abs((a as number) - (b as number)) <= epsilon;

// dimensionless ratio (e.g., meters/meters -> number)
export const brandedRatio = <T extends number>(a: T, b: T): number =>
  (a as number) / (b as number);

export const unbrandNumber = <T extends number>(x: T): number => x as number;
