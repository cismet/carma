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

// dimensionless ratio (e.g., meters/meters -> number)
export const brandedRatio = <T extends number>(a: T, b: T): number =>
  (a as number) / (b as number);

export const unbrandNumber = <T extends number>(x: T): number => x as number;
