import type { Vector3 } from "three";

import type { AnnotationScreenPosition } from "../engine";
import type {
  PointQueryDiscOriginJump,
  PointQueryDiscScaleChange,
  PointQueryTangentPlaneFailure,
} from "./point-query-controller.types";
import { pointQueryDebugDefaults } from "./point-query-debug-defaults";

export type PointQueryDebugStatusElements = {
  readoutElement: HTMLElement | null;
  mousePositionRateElement?: HTMLElement | null;
  renderRequestRateElement?: HTMLElement | null;
  sampleRateElement?: HTMLElement | null;
  discUpdateRateElement?: HTMLElement | null;
  skippedInputRateElement?: HTMLElement | null;
  lagReadoutElement?: HTMLElement | null;
  syncReadoutElement?: HTMLElement | null;
  requestTimingReadoutElement?: HTMLElement | null;
  tangentPlaneFailureReadoutElement?: HTMLElement | null;
  discOriginJumpReadoutElement?: HTMLElement | null;
  discScaleChangeReadoutElement?: HTMLElement | null;
};

export type PointQueryDebugLagMetrics = {
  latestMeasuredLagSource: "none" | "live" | "offset";
  latestMeasuredLagPx: number;
  latestLiveLagPx: number;
  latestSampleOffsetPx: number;
  latestRequestToDiscLatencyMs: number;
};

export const setStatusText = (
  element: HTMLElement | null | undefined,
  text: string
) => {
  if (element) {
    element.textContent = text;
  }
};

export const formatPointQueryReadout = (
  screenPosition: AnnotationScreenPosition | null,
  pickedPositionECEF: Vector3 | null
) => {
  if (!screenPosition) {
    return "pointer idle";
  }

  const x = Math.round(screenPosition.x);
  const y = Math.round(screenPosition.y);

  return pickedPositionECEF ? `x ${x} y ${y} hit` : `x ${x} y ${y} no hit`;
};

export const formatPointQueryStatusRate = (label: string, valueHz: number) => {
  const clampedValueHz = Number.isFinite(valueHz) ? Math.max(valueHz, 0) : 0;
  const { figureSpace } = pointQueryDebugDefaults.formatting;
  const paddedValue = clampedValueHz
    .toFixed(1)
    .replace(/ /g, figureSpace)
    .padStart(7, figureSpace);

  return `${label} ${paddedValue} Hz`;
};

export const formatTangentPlaneFailureReadout = (
  failure: PointQueryTangentPlaneFailure | null,
  failureCount: number
) => {
  if (!failure) {
    return "trace ok";
  }

  const screenPositionLabel = failure.screenPosition
    ? ` @ ${Math.round(failure.screenPosition.x)},${Math.round(
        failure.screenPosition.y
      )}`
    : "";

  return `trace ${failure.reason} #${failureCount}${screenPositionLabel}`;
};

export const formatDiscOriginJumpReadout = (
  jump: PointQueryDiscOriginJump | null,
  jumpCount: number
) =>
  jump
    ? `jump ${jump.distanceMeters.toFixed(2)}m > ${jump.thresholdMeters.toFixed(
        2
      )}m #${jumpCount}`
    : "jump ok";

export const formatDiscScaleChangeReadout = (
  scaleChange: PointQueryDiscScaleChange | null,
  scaleChangeCount: number
) =>
  scaleChange
    ? `scale ${scaleChange.previousScaleFactor.toFixed(
        2
      )} -> ${scaleChange.nextScaleFactor.toFixed(2)} #${scaleChangeCount}`
    : "scale ok";

export const formatLagReadouts = (lag: PointQueryDebugLagMetrics) => ({
  lag: `lag ${lag.latestMeasuredLagPx.toFixed(1)} px${
    lag.latestMeasuredLagSource === "none"
      ? ""
      : ` ${lag.latestMeasuredLagSource}`
  }`,
  sync: `sync ${lag.latestRequestToDiscLatencyMs.toFixed(1)} ms`,
  requestTiming: `live ${lag.latestLiveLagPx.toFixed(
    1
  )} | off ${lag.latestSampleOffsetPx.toFixed(1)} px`,
});

export const resetPointQueryDebugStatusElements = (
  statusElements: PointQueryDebugStatusElements
) => {
  setStatusText(statusElements.readoutElement, "pointer idle");
  setStatusText(
    statusElements.mousePositionRateElement,
    formatPointQueryStatusRate("mouse", 0)
  );
  setStatusText(
    statusElements.renderRequestRateElement,
    formatPointQueryStatusRate("render", 0)
  );
  setStatusText(
    statusElements.sampleRateElement,
    formatPointQueryStatusRate("sample", 0)
  );
  setStatusText(
    statusElements.discUpdateRateElement,
    formatPointQueryStatusRate("disc", 0)
  );
  setStatusText(
    statusElements.skippedInputRateElement,
    formatPointQueryStatusRate("skip", 0)
  );
  setStatusText(statusElements.lagReadoutElement, "lag 0.0 px");
  setStatusText(statusElements.syncReadoutElement, "sync 0.0 ms");
  setStatusText(
    statusElements.requestTimingReadoutElement,
    "live 0.0 | off 0.0 px"
  );
  setStatusText(statusElements.tangentPlaneFailureReadoutElement, "trace ok");
  setStatusText(statusElements.discOriginJumpReadoutElement, "jump ok");
  setStatusText(statusElements.discScaleChangeReadoutElement, "scale ok");
};

export const readHasDebugSinks = (
  statusElements: PointQueryDebugStatusElements,
  onTangentPlaneFailure?: (failure: PointQueryTangentPlaneFailure) => void
) =>
  Boolean(
    onTangentPlaneFailure ||
      Object.entries(statusElements).some(
        ([key, element]) => key !== "readoutElement" && element
      )
  );
