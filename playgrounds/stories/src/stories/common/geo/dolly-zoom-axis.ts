import { degToRadNumeric } from "@carma/units/helpers";
import { format as d3Format } from "d3";

export const DOLLY_ZOOM_X_AXIS_MODES = {
  FOV_DEG: "fov-deg",
  LOG_FOV_DEG: "log-fov-deg",
  LOG_TAN_HALF_FOV: "log-tan-half-fov",
} as const;

export type DollyZoomXAxisMode =
  (typeof DOLLY_ZOOM_X_AXIS_MODES)[keyof typeof DOLLY_ZOOM_X_AXIS_MODES];

export const DOLLY_ZOOM_FOV_AXIS_TICK_VALUES_DEG = [
  1, 2, 5, 10, 20, 30, 45, 60, 90, 120,
] as const;

export const formatDollyZoomDegrees = (value: number, format = ".1f") =>
  Number.isFinite(value) ? `${d3Format(format)(value)}°` : "—";

export const readLogFovDeg = (fovDeg: number) => Math.log(fovDeg);

export const readLogTanHalfFovFromFovDeg = (fovDeg: number) => {
  const fovRad = degToRadNumeric(fovDeg);

  if (!Number.isFinite(fovRad)) {
    return Number.NaN;
  }

  return Math.log(Math.tan(fovRad * 0.5));
};

export const readDollyZoomXAxisValue = (
  fovDeg: number,
  xAxisMode: DollyZoomXAxisMode
) =>
  xAxisMode === DOLLY_ZOOM_X_AXIS_MODES.LOG_FOV_DEG
    ? readLogFovDeg(fovDeg)
    : xAxisMode === DOLLY_ZOOM_X_AXIS_MODES.LOG_TAN_HALF_FOV
    ? readLogTanHalfFovFromFovDeg(fovDeg)
    : fovDeg;

export const readDollyZoomXAxisLabel = (xAxisMode: DollyZoomXAxisMode) =>
  xAxisMode === DOLLY_ZOOM_X_AXIS_MODES.LOG_FOV_DEG
    ? "log(fov)"
    : xAxisMode === DOLLY_ZOOM_X_AXIS_MODES.LOG_TAN_HALF_FOV
    ? "log(tan(fov / 2))"
    : "field of view";

export const readDollyZoomXAxisStatusValue = (xAxisMode: DollyZoomXAxisMode) =>
  xAxisMode === DOLLY_ZOOM_X_AXIS_MODES.LOG_FOV_DEG
    ? "x log(fov)"
    : xAxisMode === DOLLY_ZOOM_X_AXIS_MODES.LOG_TAN_HALF_FOV
    ? "x log(tan(fov/2))"
    : "x fov";

export const formatDollyZoomXAxisReadoutValue = (fovDeg: number) =>
  formatDollyZoomDegrees(fovDeg, fovDeg >= 10 ? ".0f" : ".1f");

export const buildDollyZoomXAxisTickEntries = (
  xAxisMode: DollyZoomXAxisMode
) =>
  DOLLY_ZOOM_FOV_AXIS_TICK_VALUES_DEG.map((fovDeg) => ({
    value: readDollyZoomXAxisValue(fovDeg, xAxisMode),
    label: formatDollyZoomDegrees(fovDeg, fovDeg >= 10 ? ".0f" : ".1f"),
  })).sort((left, right) => left.value - right.value);
