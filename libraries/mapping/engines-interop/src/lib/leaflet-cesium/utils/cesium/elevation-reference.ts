export enum ElevationReference {
  SURFACE = "surface",
  TERRAIN = "terrain",
}

export type TransitionOptions = {
  epsilon?: number;
  limit?: number;
  cause?: string;
  onComplete?: Function;
  fallbackHeight?: number;
  preferredElevationReference?: ElevationReference;
};

const noop = () => {};

export const defaultTransitionOptions: Required<TransitionOptions> = {
  epsilon: 0.1,
  limit: 20,
  cause: "not specified",
  onComplete: noop,
  fallbackHeight: 350,
  preferredElevationReference: ElevationReference.SURFACE,
};
