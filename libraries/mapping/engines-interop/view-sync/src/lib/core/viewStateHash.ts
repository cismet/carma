import { isFiniteNumber } from "@carma/math";
import { maplibreAdapter } from "../adapters/maplibreAdapter";
import type { ViewState } from "./types";

export const readViewStateHashNumber = (value: unknown): number | undefined => {
  if (isFiniteNumber(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return isFiniteNumber(parsed) ? parsed : undefined;
  }

  return undefined;
};

export const readHashParamsFromViewState = (
  viewState: ViewState | null | undefined,
  options: {
    defaultFovDeg?: number;
    maxPitchDeg?: number;
  } = {}
): Record<string, number> | null => {
  if (!viewState) {
    return null;
  }

  return maplibreAdapter.toHashParams(
    viewState,
    {
      ...(isFiniteNumber(options.defaultFovDeg)
        ? { defaultFovDeg: options.defaultFovDeg }
        : {}),
      ...(isFiniteNumber(options.maxPitchDeg)
        ? { maxPitchDeg: options.maxPitchDeg }
        : {}),
    }
  );
};

export const readViewStateFromHashValues = (
  hashValues: Record<string, unknown>,
  options: {
    defaultFovDeg?: number;
    maxPitchDeg?: number;
  } = {}
): ViewState | null => {
  return maplibreAdapter.fromHashValues(
    hashValues,
    {
      ...(isFiniteNumber(options.defaultFovDeg)
        ? { defaultFovDeg: options.defaultFovDeg }
        : {}),
      ...(isFiniteNumber(options.maxPitchDeg)
        ? { maxPitchDeg: options.maxPitchDeg }
        : {}),
    }
  );
};
