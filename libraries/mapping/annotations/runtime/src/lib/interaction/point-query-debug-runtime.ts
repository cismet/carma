import { Cartesian3, type Scene } from "@carma-cesium";
import { getDiscWorldRadius } from "@carma-mapping/engines/cesium/core";
import type { Radians } from "@carma-units";

import {
  isPointQueryDiscPlaneOffsetPlacementMode,
  type PointQueryDiscPlacementMode,
} from "./point-query-disc-placement-mode";
import {
  POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS,
  type PointQueryControllerTelemetrySnapshot,
  type PointQueryDiscOriginJump,
  type PointQueryDiscScaleChange,
  type PointQueryTangentPlaneFailure,
  type PointQueryTangentPlaneFailureReason,
  type PointQueryTelemetryEntry,
} from "./point-query-controller.types";

type ScreenVector = {
  x: number;
  y: number;
};

type ObservedClientPosition = {
  x: number;
  y: number;
  timestampMs: number;
};

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

type PointQueryDebugLagMetrics = {
  latestMeasuredLagSource: "none" | "live" | "offset";
  latestMeasuredLagPx: number;
  latestLiveLagPx: number;
  latestSampleOffsetPx: number;
  latestRequestToDiscLatencyMs: number;
};

type PointQueryDebugRatesHz = {
  mouse: number;
  render: number;
  sample: number;
  disc: number;
  skip: number;
};

type PointQueryTelemetrySnapshotArgs = {
  maxRenderRequestRateHz: number;
  latestInputVersion: number;
  lastProcessedInputVersion: number;
  latestRequestedAtMs: number;
  latestRenderedAtMs: number;
  latestRequestToDiscLatencyMs: number;
  latestClientPosition: ScreenVector | null;
  latestRenderedClientPosition: ScreenVector | null;
  latestDiscClientPosition: ScreenVector | null;
  latestSampleClientPosition: ScreenVector | null;
  latestRequestedClientPosition: ScreenVector | null;
  latestRequestedSampleClientPosition: ScreenVector | null;
};

type PointQueryRecordTelemetryEntryArgs = {
  latestInputVersion: number;
  lastProcessedInputVersion: number;
  latestRequestedAtMs: number;
  latestRenderedAtMs: number;
  latestClientPosition: ObservedClientPosition | null;
  latestRenderedClientPosition: ScreenVector | null;
  latestDiscClientPosition: ScreenVector | null;
  latestSampleClientPosition: ScreenVector | null;
  latestRequestedClientPosition: ScreenVector | null;
  latestRequestedSampleClientPosition: ScreenVector | null;
};

type PointQueryRecordTangentPlaneFailureArgs = {
  inputVersion: number;
  reason: PointQueryTangentPlaneFailureReason;
  requestedAtMs: number;
  placementMode: PointQueryDiscPlacementMode;
  clientPosition: ScreenVector | null;
  screenPosition: ScreenVector | null;
  hasLatestTrueDiscWorldPosition: boolean;
  hasLatestDiscNormal: boolean;
  hasSampledPoint: boolean;
  hasSampledSurfaceNormal: boolean;
};

type PointQueryRecordDiscOriginJumpArgs = {
  inputVersion: number;
  requestedAtMs: number;
  placementMode: PointQueryDiscPlacementMode;
  previousDiscWorldPosition: Cartesian3 | null;
  nextDiscWorldPosition: Cartesian3;
  nextDiscNormal: Cartesian3;
  previousClientPosition: ScreenVector | null;
  nextClientPosition: ScreenVector | null;
  source: "true-sample" | "fast-reproject";
};

type PointQueryRecordDiscScaleChangeArgs = {
  inputVersion: number;
  requestedAtMs: number;
  placementMode: PointQueryDiscPlacementMode;
  nextScaleFactor: number;
  source: "true-sample" | "fast-reproject";
};

const pointQueryDebugDefaults = Object.freeze({
  formatting: Object.freeze({
    figureSpace: "\u2007",
  }),
  performance: Object.freeze({
    idleResetMs: 300,
    reportIntervalMs: 250,
  }),
  history: Object.freeze({
    maxTelemetryEntryCount: 600,
    maxTangentPlaneFailureCount: 200,
    maxDiscOriginJumpCount: 200,
    maxDiscScaleChangeCount: 200,
  }),
  discOriginJump: Object.freeze({
    pixelResolutionMultiplier: 100,
  }),
  discScaleChange: Object.freeze({
    relativeThreshold: 0.2,
  }),
  failedPickLog: Object.freeze({
    throttleMs: 250,
    screenBucketPx: 8,
  }),
});

const createInitialTangentPlaneFailureCounts = (): Record<
  PointQueryTangentPlaneFailureReason,
  number
> => ({
  [POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.MISSING_SCREEN_POSITION]: 0,
  [POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.MISSING_TRUE_DISC_POINT]: 0,
  [POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.MISSING_TRUE_DISC_NORMAL]: 0,
  [POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.TRUE_SAMPLE_MISS]: 0,
  [POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.TRUE_NORMAL_MISS]: 0,
  [POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.REPROJECTION_MISS]: 0,
});

export const formatPointQueryReadout = (
  screenPosition: { x: number; y: number } | null,
  pickedPositionECEF: Cartesian3 | null
) => {
  if (!screenPosition) {
    return "pointer idle";
  }

  const x = Math.round(screenPosition.x);
  const y = Math.round(screenPosition.y);

  if (!pickedPositionECEF) {
    return `x ${x} y ${y} no hit`;
  }

  return `x ${x} y ${y} hit`;
};

const formatPointQueryStatusRate = (label: string, valueHz: number) => {
  const clampedValueHz = Number.isFinite(valueHz) ? Math.max(valueHz, 0) : 0;
  const paddedValue = clampedValueHz
    .toFixed(1)
    .replace(/ /g, pointQueryDebugDefaults.formatting.figureSpace)
    .padStart(7, pointQueryDebugDefaults.formatting.figureSpace);

  return `${label} ${paddedValue} Hz`;
};

const formatTangentPlaneFailureReadout = ({
  failure,
  failureCount,
}: {
  failure: PointQueryTangentPlaneFailure | null;
  failureCount: number;
}) => {
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

const formatDiscOriginJumpReadout = ({
  jump,
  jumpCount,
}: {
  jump: PointQueryDiscOriginJump | null;
  jumpCount: number;
}) => {
  if (!jump) {
    return "jump ok";
  }

  return `jump ${jump.distanceMeters.toFixed(
    2
  )}m > ${jump.thresholdMeters.toFixed(2)}m #${jumpCount}`;
};

const formatDiscScaleChangeReadout = ({
  scaleChange,
  scaleChangeCount,
}: {
  scaleChange: PointQueryDiscScaleChange | null;
  scaleChangeCount: number;
}) => {
  if (!scaleChange) {
    return "scale ok";
  }

  return `scale ${scaleChange.previousScaleFactor.toFixed(
    2
  )} -> ${scaleChange.nextScaleFactor.toFixed(2)} #${scaleChangeCount}`;
};

const resetPointQueryDebugStatusElements = ({
  readoutElement,
  mousePositionRateElement,
  renderRequestRateElement,
  sampleRateElement,
  discUpdateRateElement,
  skippedInputRateElement,
  lagReadoutElement,
  syncReadoutElement,
  requestTimingReadoutElement,
  tangentPlaneFailureReadoutElement,
  discOriginJumpReadoutElement,
  discScaleChangeReadoutElement,
}: PointQueryDebugStatusElements) => {
  if (readoutElement) {
    readoutElement.textContent = "pointer idle";
  }
  if (mousePositionRateElement) {
    mousePositionRateElement.textContent = formatPointQueryStatusRate(
      "mouse",
      0
    );
  }
  if (renderRequestRateElement) {
    renderRequestRateElement.textContent = formatPointQueryStatusRate(
      "render",
      0
    );
  }
  if (sampleRateElement) {
    sampleRateElement.textContent = formatPointQueryStatusRate("sample", 0);
  }
  if (discUpdateRateElement) {
    discUpdateRateElement.textContent = formatPointQueryStatusRate("disc", 0);
  }
  if (skippedInputRateElement) {
    skippedInputRateElement.textContent = formatPointQueryStatusRate("skip", 0);
  }
  if (lagReadoutElement) {
    lagReadoutElement.textContent = "lag 0.0 px";
  }
  if (syncReadoutElement) {
    syncReadoutElement.textContent = "sync 0.0 ms";
  }
  if (requestTimingReadoutElement) {
    requestTimingReadoutElement.textContent = "live 0.0 | off 0.0 px";
  }
  if (tangentPlaneFailureReadoutElement) {
    tangentPlaneFailureReadoutElement.textContent = "trace ok";
  }
  if (discOriginJumpReadoutElement) {
    discOriginJumpReadoutElement.textContent = "jump ok";
  }
  if (discScaleChangeReadoutElement) {
    discScaleChangeReadoutElement.textContent = "scale ok";
  }
};

const renderDebugVectorLine = ({
  element,
  start,
  end,
  headElement,
}: {
  element: HTMLDivElement;
  start: ScreenVector;
  end: ScreenVector;
  headElement?: HTMLDivElement;
}) => {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthPx = Math.hypot(deltaX, deltaY);
  if (lengthPx < 0.5) {
    element.style.display = "none";
    if (headElement) {
      headElement.style.display = "none";
    }
    return;
  }

  const angleRad = Math.atan2(deltaY, deltaX) as Radians;
  element.style.display = "block";
  element.style.left = `${start.x}px`;
  element.style.top = `${start.y}px`;
  element.style.width = `${lengthPx}px`;
  element.style.transform = `translateY(-50%) rotate(${angleRad}rad)`;
  if (headElement) {
    headElement.style.display = "block";
    headElement.style.left = `${end.x}px`;
    headElement.style.top = `${end.y}px`;
    headElement.style.transform = `translate(-50%, -50%) rotate(${angleRad}rad)`;
  }
};

const createPointQueryLagDebugOverlay = () => {
  const overlayElement = document.createElement("div");
  const lineElement = document.createElement("div");
  const headElement = document.createElement("div");
  const labelElement = document.createElement("div");

  Object.assign(overlayElement.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: "2300",
    display: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  Object.assign(lineElement.style, {
    position: "fixed",
    height: "3px",
    background: "rgba(255, 92, 92, 0.95)",
    transformOrigin: "0 50%",
    pointerEvents: "none",
    display: "none",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
  } satisfies Partial<CSSStyleDeclaration>);
  Object.assign(headElement.style, {
    position: "fixed",
    width: "0",
    height: "0",
    borderTop: "5px solid transparent",
    borderBottom: "5px solid transparent",
    borderLeft: "9px solid rgba(255, 92, 92, 0.95)",
    transformOrigin: "50% 50%",
    pointerEvents: "none",
    display: "none",
    filter: "drop-shadow(0 0 1px rgba(0,0,0,0.45))",
  } satisfies Partial<CSSStyleDeclaration>);
  Object.assign(labelElement.style, {
    position: "fixed",
    padding: "2px 6px",
    borderRadius: "4px",
    background: "rgba(0,0,0,0.72)",
    color: "#ffffff",
    font: "12px/1.35 monospace",
    whiteSpace: "pre",
    pointerEvents: "none",
    display: "none",
  } satisfies Partial<CSSStyleDeclaration>);

  overlayElement.appendChild(lineElement);
  overlayElement.appendChild(headElement);
  overlayElement.appendChild(labelElement);
  document.body.appendChild(overlayElement);

  const hide = () => {
    overlayElement.style.display = "none";
    lineElement.style.display = "none";
    headElement.style.display = "none";
    labelElement.style.display = "none";
  };

  const update = (
    metrics: PointQueryDebugLagMetrics,
    {
      rawClientPosition,
      renderedClientPosition,
      discClientPosition,
      sampleClientPosition,
    }: {
      rawClientPosition: ScreenVector | null;
      renderedClientPosition: ScreenVector | null;
      discClientPosition: ScreenVector | null;
      sampleClientPosition: ScreenVector | null;
    }
  ) => {
    if (!discClientPosition || (!rawClientPosition && !sampleClientPosition)) {
      hide();
      return;
    }

    let primaryStart: ScreenVector | null = null;
    let primaryEnd: ScreenVector | null = null;
    if (metrics.latestMeasuredLagSource === "offset" && sampleClientPosition) {
      primaryStart = discClientPosition;
      primaryEnd = sampleClientPosition;
    } else if (renderedClientPosition && rawClientPosition) {
      primaryStart = renderedClientPosition;
      primaryEnd = rawClientPosition;
    } else if (rawClientPosition) {
      primaryStart = discClientPosition;
      primaryEnd = rawClientPosition;
    }

    if (!primaryStart || !primaryEnd) {
      hide();
      return;
    }

    overlayElement.style.display = "block";
    renderDebugVectorLine({
      element: lineElement,
      start: primaryStart,
      end: primaryEnd,
      headElement,
    });

    const primaryLabelX = (primaryStart.x + primaryEnd.x) * 0.5;
    const primaryLabelY = (primaryStart.y + primaryEnd.y) * 0.5;
    labelElement.style.display = "block";
    labelElement.style.left = `${primaryLabelX + 10}px`;
    labelElement.style.top = `${primaryLabelY + 10}px`;
    const lagSourceLabel =
      metrics.latestMeasuredLagSource === "none"
        ? ""
        : ` ${metrics.latestMeasuredLagSource}`;
    labelElement.textContent = [
      `lag ${metrics.latestMeasuredLagPx.toFixed(1)} px${lagSourceLabel}`,
      `live ${metrics.latestLiveLagPx.toFixed(1)}`,
      `off ${metrics.latestSampleOffsetPx.toFixed(1)}`,
      `sync ${metrics.latestRequestToDiscLatencyMs.toFixed(1)} ms`,
    ].join(" | ");
  };

  const destroy = () => {
    overlayElement.remove();
  };

  return {
    update,
    hide,
    destroy,
  };
};

const cloneScreenVector = (value: ScreenVector | null): ScreenVector | null =>
  value ? { ...value } : null;

const cloneTangentPlaneFailure = (
  failure: PointQueryTangentPlaneFailure | null
) =>
  failure
    ? {
        ...failure,
        clientPosition: cloneScreenVector(failure.clientPosition),
        screenPosition: cloneScreenVector(failure.screenPosition),
      }
    : null;

const cloneDiscOriginJump = (
  jump: PointQueryDiscOriginJump | null
): PointQueryDiscOriginJump | null =>
  jump
    ? {
        ...jump,
        previousClientPosition: cloneScreenVector(jump.previousClientPosition),
        nextClientPosition: cloneScreenVector(jump.nextClientPosition),
      }
    : null;

const buildFailedPickLogSignature = (failure: PointQueryTangentPlaneFailure) =>
  [
    failure.reason,
    failure.placementMode,
    failure.screenPosition
      ? Math.round(
          failure.screenPosition.x /
            pointQueryDebugDefaults.failedPickLog.screenBucketPx
        )
      : "none",
    failure.screenPosition
      ? Math.round(
          failure.screenPosition.y /
            pointQueryDebugDefaults.failedPickLog.screenBucketPx
        )
      : "none",
  ].join(":");

const readHasDebugSinks = ({
  statusElements,
  onTangentPlaneFailure,
}: {
  statusElements: PointQueryDebugStatusElements;
  onTangentPlaneFailure?: (failure: PointQueryTangentPlaneFailure) => void;
}) =>
  Boolean(
    statusElements.mousePositionRateElement ||
      statusElements.renderRequestRateElement ||
      statusElements.sampleRateElement ||
      statusElements.discUpdateRateElement ||
      statusElements.skippedInputRateElement ||
      statusElements.lagReadoutElement ||
      statusElements.syncReadoutElement ||
      statusElements.requestTimingReadoutElement ||
      statusElements.tangentPlaneFailureReadoutElement ||
      statusElements.discOriginJumpReadoutElement ||
      statusElements.discScaleChangeReadoutElement ||
      onTangentPlaneFailure
  );

export const createPointQueryDebugRuntime = ({
  scene,
  statusElements,
  onTangentPlaneFailure,
  enabled = false,
}: {
  scene: Scene;
  statusElements: PointQueryDebugStatusElements;
  onTangentPlaneFailure?: (failure: PointQueryTangentPlaneFailure) => void;
  enabled?: boolean;
}) => {
  const lagDebugOverlay = createPointQueryLagDebugOverlay();
  const hasDebugSinks = readHasDebugSinks({
    statusElements,
    onTangentPlaneFailure,
  });
  let debugEnabled = enabled;
  let mousePositionEventCount = 0;
  let renderRequestEventCount = 0;
  let sampleEventCount = 0;
  let discUpdateEventCount = 0;
  let skippedInputEventCount = 0;
  let lastMousePositionEventTimeMs = 0;
  let lastRenderRequestEventTimeMs = 0;
  let lastSampleEventTimeMs = 0;
  let lastDiscUpdateEventTimeMs = 0;
  let lastSkippedInputEventTimeMs = 0;
  let lastPerformanceReportTimeMs = performance.now();
  let latestRatesHz: PointQueryDebugRatesHz = {
    mouse: 0,
    render: 0,
    sample: 0,
    disc: 0,
    skip: 0,
  };
  let latestMeasuredLagSource: "none" | "live" | "offset" = "none";
  let latestMeasuredLagPx = 0;
  let latestLiveLagPx = 0;
  let latestSampleOffsetPx = 0;
  const telemetryEntries: PointQueryTelemetryEntry[] = [];
  const tangentPlaneFailures: PointQueryTangentPlaneFailure[] = [];
  const tangentPlaneFailureCounts = createInitialTangentPlaneFailureCounts();
  const recordedTangentPlaneFailureKeys = new Set<string>();
  let tangentPlaneFailureCount = 0;
  let latestTangentPlaneFailure: PointQueryTangentPlaneFailure | null = null;
  const discOriginJumps: PointQueryDiscOriginJump[] = [];
  let discOriginJumpCount = 0;
  let latestDiscOriginJump: PointQueryDiscOriginJump | null = null;
  const discScaleChanges: PointQueryDiscScaleChange[] = [];
  let discScaleChangeCount = 0;
  let latestDiscScaleChange: PointQueryDiscScaleChange | null = null;
  let latestDiscScaleFactor: number | null = null;
  let lastFailedPickLogSignature: string | null = null;
  let lastFailedPickLogTimeMs = 0;

  const updateTangentPlaneFailureReadout = () => {
    if (!statusElements.tangentPlaneFailureReadoutElement) {
      return;
    }

    statusElements.tangentPlaneFailureReadoutElement.textContent =
      formatTangentPlaneFailureReadout({
        failure: latestTangentPlaneFailure,
        failureCount: tangentPlaneFailureCount,
      });
  };

  const updateDiscOriginJumpReadout = () => {
    if (!statusElements.discOriginJumpReadoutElement) {
      return;
    }

    statusElements.discOriginJumpReadoutElement.textContent =
      formatDiscOriginJumpReadout({
        jump: latestDiscOriginJump,
        jumpCount: discOriginJumpCount,
      });
  };

  const updateDiscScaleChangeReadout = () => {
    if (!statusElements.discScaleChangeReadoutElement) {
      return;
    }

    statusElements.discScaleChangeReadoutElement.textContent =
      formatDiscScaleChangeReadout({
        scaleChange: latestDiscScaleChange,
        scaleChangeCount: discScaleChangeCount,
      });
  };

  const updateLagReadouts = () => {
    if (statusElements.lagReadoutElement) {
      const sourceLabel =
        latestMeasuredLagSource === "none" ? "" : ` ${latestMeasuredLagSource}`;
      statusElements.lagReadoutElement.textContent = `lag ${latestMeasuredLagPx.toFixed(
        1
      )} px${sourceLabel}`;
    }
    if (statusElements.syncReadoutElement) {
      statusElements.syncReadoutElement.textContent = `sync ${latestRequestToDiscLatencyMs.toFixed(
        1
      )} ms`;
    }
    if (statusElements.requestTimingReadoutElement) {
      statusElements.requestTimingReadoutElement.textContent = `live ${latestLiveLagPx.toFixed(
        1
      )} | off ${latestSampleOffsetPx.toFixed(1)} px`;
    }
  };

  const maybeLogFailedPick = (failure: PointQueryTangentPlaneFailure) => {
    if (
      failure.reason !==
      POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.TRUE_SAMPLE_MISS
    ) {
      return;
    }

    const signature = buildFailedPickLogSignature(failure);
    if (
      lastFailedPickLogSignature === signature &&
      failure.t - lastFailedPickLogTimeMs <
        pointQueryDebugDefaults.failedPickLog.throttleMs
    ) {
      return;
    }

    lastFailedPickLogSignature = signature;
    lastFailedPickLogTimeMs = failure.t;

    console.warn("[PointQuery] preferred pick miss", {
      inputVersion: failure.inputVersion,
      requestedAtMs: failure.requestedAtMs,
      placementMode: failure.placementMode,
      clientPosition: failure.clientPosition,
      screenPosition: failure.screenPosition,
      hasLatestTrueDiscWorldPosition: failure.hasLatestTrueDiscWorldPosition,
      hasLatestDiscNormal: failure.hasLatestDiscNormal,
      hasSampledPoint: failure.hasSampledPoint,
      hasSampledSurfaceNormal: failure.hasSampledSurfaceNormal,
    });
  };

  let latestRequestToDiscLatencyMs = 0;

  const hideLagDebugOverlay = () => {
    lagDebugOverlay.hide();
  };

  const updateLagDebugOverlay = ({
    latestObservedClientPosition,
    latestRenderedClientPosition,
    latestDiscClientPosition,
    latestSampleClientPosition,
  }: {
    latestObservedClientPosition: ObservedClientPosition | null;
    latestRenderedClientPosition: ScreenVector | null;
    latestDiscClientPosition: ScreenVector | null;
    latestSampleClientPosition: ScreenVector | null;
  }) => {
    if (!debugEnabled) {
      hideLagDebugOverlay();
      return;
    }

    lagDebugOverlay.update(
      {
        latestMeasuredLagPx,
        latestMeasuredLagSource,
        latestLiveLagPx,
        latestSampleOffsetPx,
        latestRequestToDiscLatencyMs,
      },
      {
        rawClientPosition: latestObservedClientPosition
          ? {
              x: latestObservedClientPosition.x,
              y: latestObservedClientPosition.y,
            }
          : null,
        renderedClientPosition: latestRenderedClientPosition,
        discClientPosition: latestDiscClientPosition,
        sampleClientPosition: latestSampleClientPosition,
      }
    );
  };

  const updatePerformanceStats = (force = false) => {
    const nowMs = performance.now();
    const elapsedMs = nowMs - lastPerformanceReportTimeMs;
    const mouseIdle =
      lastMousePositionEventTimeMs <= 0 ||
      nowMs - lastMousePositionEventTimeMs >=
        pointQueryDebugDefaults.performance.idleResetMs;
    const renderIdle =
      lastRenderRequestEventTimeMs <= 0 ||
      nowMs - lastRenderRequestEventTimeMs >=
        pointQueryDebugDefaults.performance.idleResetMs;
    const sampleIdle =
      lastSampleEventTimeMs <= 0 ||
      nowMs - lastSampleEventTimeMs >=
        pointQueryDebugDefaults.performance.idleResetMs;
    const discIdle =
      lastDiscUpdateEventTimeMs <= 0 ||
      nowMs - lastDiscUpdateEventTimeMs >=
        pointQueryDebugDefaults.performance.idleResetMs;
    const skippedIdle =
      lastSkippedInputEventTimeMs <= 0 ||
      nowMs - lastSkippedInputEventTimeMs >=
        pointQueryDebugDefaults.performance.idleResetMs;

    if (
      !force &&
      elapsedMs < pointQueryDebugDefaults.performance.reportIntervalMs
    ) {
      return;
    }

    if (elapsedMs > 0) {
      if (mousePositionEventCount > 0) {
        latestRatesHz.mouse = (mousePositionEventCount * 1000) / elapsedMs;
      } else if (mouseIdle) {
        latestRatesHz.mouse = 0;
      }

      if (renderRequestEventCount > 0) {
        latestRatesHz.render = (renderRequestEventCount * 1000) / elapsedMs;
      } else if (renderIdle) {
        latestRatesHz.render = 0;
      }

      if (sampleEventCount > 0) {
        latestRatesHz.sample = (sampleEventCount * 1000) / elapsedMs;
      } else if (sampleIdle) {
        latestRatesHz.sample = 0;
      }

      if (discUpdateEventCount > 0) {
        latestRatesHz.disc = (discUpdateEventCount * 1000) / elapsedMs;
      } else if (discIdle) {
        latestRatesHz.disc = 0;
      }

      if (skippedInputEventCount > 0) {
        latestRatesHz.skip = (skippedInputEventCount * 1000) / elapsedMs;
      } else if (skippedIdle) {
        latestRatesHz.skip = 0;
      }
    }

    if (statusElements.mousePositionRateElement) {
      statusElements.mousePositionRateElement.textContent =
        formatPointQueryStatusRate("mouse", latestRatesHz.mouse);
    }
    if (statusElements.renderRequestRateElement) {
      statusElements.renderRequestRateElement.textContent =
        formatPointQueryStatusRate("render", latestRatesHz.render);
    }
    if (statusElements.sampleRateElement) {
      statusElements.sampleRateElement.textContent = formatPointQueryStatusRate(
        "sample",
        latestRatesHz.sample
      );
    }
    if (statusElements.discUpdateRateElement) {
      statusElements.discUpdateRateElement.textContent =
        formatPointQueryStatusRate("disc", latestRatesHz.disc);
    }
    if (statusElements.skippedInputRateElement) {
      statusElements.skippedInputRateElement.textContent =
        formatPointQueryStatusRate("skip", latestRatesHz.skip);
    }

    mousePositionEventCount = 0;
    renderRequestEventCount = 0;
    sampleEventCount = 0;
    discUpdateEventCount = 0;
    skippedInputEventCount = 0;
    lastPerformanceReportTimeMs = nowMs;
  };

  const resetDebugState = () => {
    mousePositionEventCount = 0;
    renderRequestEventCount = 0;
    sampleEventCount = 0;
    discUpdateEventCount = 0;
    skippedInputEventCount = 0;
    lastMousePositionEventTimeMs = 0;
    lastRenderRequestEventTimeMs = 0;
    lastSampleEventTimeMs = 0;
    lastDiscUpdateEventTimeMs = 0;
    lastSkippedInputEventTimeMs = 0;
    lastPerformanceReportTimeMs = performance.now();
    latestRatesHz = {
      mouse: 0,
      render: 0,
      sample: 0,
      disc: 0,
      skip: 0,
    };
    latestMeasuredLagSource = "none";
    latestMeasuredLagPx = 0;
    latestLiveLagPx = 0;
    latestSampleOffsetPx = 0;
    latestRequestToDiscLatencyMs = 0;
    telemetryEntries.length = 0;
    tangentPlaneFailures.length = 0;
    discOriginJumps.length = 0;
    discScaleChanges.length = 0;
    Object.assign(
      tangentPlaneFailureCounts,
      createInitialTangentPlaneFailureCounts()
    );
    recordedTangentPlaneFailureKeys.clear();
    tangentPlaneFailureCount = 0;
    latestTangentPlaneFailure = null;
    discOriginJumpCount = 0;
    latestDiscOriginJump = null;
    discScaleChangeCount = 0;
    latestDiscScaleChange = null;
    latestDiscScaleFactor = null;
    lastFailedPickLogSignature = null;
    lastFailedPickLogTimeMs = 0;
    resetPointQueryDebugStatusElements(statusElements);
    hideLagDebugOverlay();
  };

  return {
    hasDebugSinks: () => hasDebugSinks,
    setEnabled: (enabled: boolean) => {
      debugEnabled = enabled;
      if (!debugEnabled) {
        resetDebugState();
      }
    },
    resetStatusElements: () => {
      resetPointQueryDebugStatusElements(statusElements);
      updateTangentPlaneFailureReadout();
      updateDiscOriginJumpReadout();
      updateDiscScaleChangeReadout();
      updatePerformanceStats(true);
    },
    markMousePositionEvent: () => {
      if (!debugEnabled) {
        return;
      }

      mousePositionEventCount += 1;
      lastMousePositionEventTimeMs = performance.now();
      updatePerformanceStats();
    },
    markRenderRequestEvent: () => {
      if (!debugEnabled) {
        return;
      }

      renderRequestEventCount += 1;
      lastRenderRequestEventTimeMs = performance.now();
      updatePerformanceStats();
    },
    markSampleEvent: () => {
      if (!debugEnabled) {
        return;
      }

      sampleEventCount += 1;
      lastSampleEventTimeMs = performance.now();
      updatePerformanceStats();
    },
    markDiscUpdateEvent: () => {
      if (!debugEnabled) {
        return;
      }

      discUpdateEventCount += 1;
      lastDiscUpdateEventTimeMs = performance.now();
      updatePerformanceStats();
    },
    markSkippedInputEvents: (count: number) => {
      if (!debugEnabled || count <= 0) {
        return;
      }

      skippedInputEventCount += count;
      lastSkippedInputEventTimeMs = performance.now();
      updatePerformanceStats();
    },
    updateRequestToDiscLatencyMs: (value: number) => {
      latestRequestToDiscLatencyMs = value;
      if (!debugEnabled) {
        return;
      }
      updateLagReadouts();
    },
    syncLagState: ({
      placementMode,
      latestObservedClientPosition,
      latestRenderedClientPosition,
      latestDiscClientPosition,
      latestSampleClientPosition,
    }: {
      placementMode: PointQueryDiscPlacementMode;
      latestObservedClientPosition: ObservedClientPosition | null;
      latestRenderedClientPosition: ScreenVector | null;
      latestDiscClientPosition: ScreenVector | null;
      latestSampleClientPosition: ScreenVector | null;
    }) => {
      if (
        latestObservedClientPosition &&
        (latestDiscClientPosition ?? latestRenderedClientPosition)
      ) {
        const liveLagReference =
          latestDiscClientPosition ?? latestRenderedClientPosition;
        latestLiveLagPx = Math.hypot(
          latestObservedClientPosition.x - liveLagReference!.x,
          latestObservedClientPosition.y - liveLagReference!.y
        );
      } else {
        latestLiveLagPx = 0;
      }

      if (latestSampleClientPosition && latestDiscClientPosition) {
        latestSampleOffsetPx = Math.hypot(
          latestSampleClientPosition.x - latestDiscClientPosition.x,
          latestSampleClientPosition.y - latestDiscClientPosition.y
        );
      } else {
        latestSampleOffsetPx = 0;
      }

      if (
        isPointQueryDiscPlaneOffsetPlacementMode(placementMode) &&
        latestSampleOffsetPx >= latestLiveLagPx &&
        latestSampleOffsetPx > 0
      ) {
        latestMeasuredLagPx = latestSampleOffsetPx;
        latestMeasuredLagSource = "offset";
      } else if (latestLiveLagPx > 0) {
        latestMeasuredLagPx = latestLiveLagPx;
        latestMeasuredLagSource = "live";
      } else if (latestSampleOffsetPx > 0) {
        latestMeasuredLagPx = latestSampleOffsetPx;
        latestMeasuredLagSource = "offset";
      } else {
        latestMeasuredLagPx = 0;
        latestMeasuredLagSource = "none";
      }

      if (!debugEnabled) {
        hideLagDebugOverlay();
        return;
      }

      updateLagReadouts();
      updateLagDebugOverlay({
        latestObservedClientPosition,
        latestRenderedClientPosition,
        latestDiscClientPosition,
        latestSampleClientPosition,
      });
    },
    clearPointerState: () => {
      latestMeasuredLagSource = "none";
      latestMeasuredLagPx = 0;
      latestLiveLagPx = 0;
      latestSampleOffsetPx = 0;
      latestRequestToDiscLatencyMs = 0;
      hideLagDebugOverlay();
      if (!debugEnabled) {
        return;
      }
      updateLagReadouts();
    },
    recordTelemetryEntry: ({
      latestInputVersion,
      lastProcessedInputVersion,
      latestRequestedAtMs,
      latestRenderedAtMs,
      latestClientPosition,
      latestRenderedClientPosition,
      latestDiscClientPosition,
      latestSampleClientPosition,
      latestRequestedClientPosition,
      latestRequestedSampleClientPosition,
    }: PointQueryRecordTelemetryEntryArgs) => {
      if (!debugEnabled) {
        return;
      }

      telemetryEntries.push({
        t: performance.now(),
        mouseHz: latestRatesHz.mouse,
        renderHz: latestRatesHz.render,
        sampleHz: latestRatesHz.sample,
        discHz: latestRatesHz.disc,
        skipHz: latestRatesHz.skip,
        inputVersion: latestInputVersion,
        processedVersion: lastProcessedInputVersion,
        requestedAtMs: latestRequestedAtMs,
        renderedAtMs: latestRenderedAtMs,
        requestToDiscLatencyMs: latestRequestToDiscLatencyMs,
        measuredLagSource: latestMeasuredLagSource,
        measuredLagPx: latestMeasuredLagPx,
        liveLagPx: latestLiveLagPx,
        sampleOffsetPx: latestSampleOffsetPx,
        clientX: latestClientPosition?.x ?? null,
        clientY: latestClientPosition?.y ?? null,
        renderedClientX: latestRenderedClientPosition?.x ?? null,
        renderedClientY: latestRenderedClientPosition?.y ?? null,
        discClientX: latestDiscClientPosition?.x ?? null,
        discClientY: latestDiscClientPosition?.y ?? null,
        sampleClientX: latestSampleClientPosition?.x ?? null,
        sampleClientY: latestSampleClientPosition?.y ?? null,
        requestClientX: latestRequestedClientPosition?.x ?? null,
        requestClientY: latestRequestedClientPosition?.y ?? null,
        requestSampleClientX: latestRequestedSampleClientPosition?.x ?? null,
        requestSampleClientY: latestRequestedSampleClientPosition?.y ?? null,
      });
      if (
        telemetryEntries.length >
        pointQueryDebugDefaults.history.maxTelemetryEntryCount
      ) {
        telemetryEntries.splice(
          0,
          telemetryEntries.length -
            pointQueryDebugDefaults.history.maxTelemetryEntryCount
        );
      }
    },
    recordTangentPlaneFailure: ({
      inputVersion,
      reason,
      requestedAtMs,
      placementMode,
      clientPosition,
      screenPosition,
      hasLatestTrueDiscWorldPosition,
      hasLatestDiscNormal,
      hasSampledPoint,
      hasSampledSurfaceNormal,
    }: PointQueryRecordTangentPlaneFailureArgs) => {
      if (!debugEnabled) {
        return;
      }

      const dedupeKey = [
        inputVersion,
        reason,
        screenPosition ? Math.round(screenPosition.x) : "none",
        screenPosition ? Math.round(screenPosition.y) : "none",
      ].join(":");
      if (recordedTangentPlaneFailureKeys.has(dedupeKey)) {
        return;
      }

      recordedTangentPlaneFailureKeys.add(dedupeKey);
      if (recordedTangentPlaneFailureKeys.size > 1024) {
        recordedTangentPlaneFailureKeys.clear();
        recordedTangentPlaneFailureKeys.add(dedupeKey);
      }

      const failure: PointQueryTangentPlaneFailure = {
        t: performance.now(),
        inputVersion,
        reason,
        requestedAtMs,
        placementMode,
        clientPosition: cloneScreenVector(clientPosition),
        screenPosition: cloneScreenVector(screenPosition),
        hasLatestTrueDiscWorldPosition,
        hasLatestDiscNormal,
        hasSampledPoint,
        hasSampledSurfaceNormal,
      };

      latestTangentPlaneFailure = failure;
      tangentPlaneFailureCount += 1;
      tangentPlaneFailureCounts[reason] += 1;
      tangentPlaneFailures.push(failure);
      if (
        tangentPlaneFailures.length >
        pointQueryDebugDefaults.history.maxTangentPlaneFailureCount
      ) {
        tangentPlaneFailures.splice(
          0,
          tangentPlaneFailures.length -
            pointQueryDebugDefaults.history.maxTangentPlaneFailureCount
        );
      }
      maybeLogFailedPick(failure);
      updateTangentPlaneFailureReadout();
      onTangentPlaneFailure?.(failure);
    },
    recordDiscOriginJump: ({
      inputVersion,
      requestedAtMs,
      placementMode,
      previousDiscWorldPosition,
      nextDiscWorldPosition,
      nextDiscNormal,
      previousClientPosition,
      nextClientPosition,
      source,
    }: PointQueryRecordDiscOriginJumpArgs) => {
      if (!debugEnabled || !previousDiscWorldPosition) {
        return;
      }

      const metersPerPixelAtPreviousDiscPosition = getDiscWorldRadius(
        scene,
        previousDiscWorldPosition,
        nextDiscNormal,
        1,
        1
      );
      if (
        !Number.isFinite(metersPerPixelAtPreviousDiscPosition) ||
        metersPerPixelAtPreviousDiscPosition <= 0
      ) {
        return;
      }

      const jumpDistanceMeters = Cartesian3.distance(
        previousDiscWorldPosition,
        nextDiscWorldPosition
      );
      const thresholdMeters =
        metersPerPixelAtPreviousDiscPosition *
        pointQueryDebugDefaults.discOriginJump.pixelResolutionMultiplier;
      if (jumpDistanceMeters <= thresholdMeters) {
        return;
      }

      latestDiscOriginJump = {
        t: performance.now(),
        inputVersion,
        requestedAtMs,
        placementMode,
        distanceMeters: jumpDistanceMeters,
        thresholdMeters,
        metersPerPixel: metersPerPixelAtPreviousDiscPosition,
        thresholdPixelResolutionMultiplier:
          pointQueryDebugDefaults.discOriginJump.pixelResolutionMultiplier,
        source,
        previousClientPosition: cloneScreenVector(previousClientPosition),
        nextClientPosition: nextClientPosition
          ? { ...nextClientPosition }
          : { x: 0, y: 0 },
      };
      discOriginJumpCount += 1;
      discOriginJumps.push(latestDiscOriginJump);
      if (
        discOriginJumps.length >
        pointQueryDebugDefaults.history.maxDiscOriginJumpCount
      ) {
        discOriginJumps.splice(
          0,
          discOriginJumps.length -
            pointQueryDebugDefaults.history.maxDiscOriginJumpCount
        );
      }
      updateDiscOriginJumpReadout();
    },
    recordDiscScaleChange: ({
      inputVersion,
      requestedAtMs,
      placementMode,
      nextScaleFactor,
      source,
    }: PointQueryRecordDiscScaleChangeArgs) => {
      if (
        !debugEnabled ||
        latestDiscScaleFactor === null ||
        !Number.isFinite(latestDiscScaleFactor) ||
        latestDiscScaleFactor <= 0 ||
        !Number.isFinite(nextScaleFactor) ||
        nextScaleFactor <= 0
      ) {
        latestDiscScaleFactor = nextScaleFactor;
        return;
      }

      const relativeChange =
        Math.abs(nextScaleFactor - latestDiscScaleFactor) /
        latestDiscScaleFactor;
      if (
        relativeChange <=
        pointQueryDebugDefaults.discScaleChange.relativeThreshold
      ) {
        latestDiscScaleFactor = nextScaleFactor;
        return;
      }

      latestDiscScaleChange = {
        t: performance.now(),
        inputVersion,
        requestedAtMs,
        placementMode,
        source,
        previousScaleFactor: latestDiscScaleFactor,
        nextScaleFactor,
        relativeChange,
        thresholdRelativeChange:
          pointQueryDebugDefaults.discScaleChange.relativeThreshold,
      };
      discScaleChangeCount += 1;
      discScaleChanges.push(latestDiscScaleChange);
      if (
        discScaleChanges.length >
        pointQueryDebugDefaults.history.maxDiscScaleChangeCount
      ) {
        discScaleChanges.splice(
          0,
          discScaleChanges.length -
            pointQueryDebugDefaults.history.maxDiscScaleChangeCount
        );
      }
      latestDiscScaleFactor = nextScaleFactor;
      updateDiscScaleChangeReadout();
    },
    setLatestDiscScaleFactor: (value: number | null) => {
      latestDiscScaleFactor = value;
    },
    readLatestSampleOffsetPx: () => latestSampleOffsetPx,
    updatePerformanceStats,
    getTelemetrySnapshot: ({
      maxRenderRequestRateHz,
      latestInputVersion,
      lastProcessedInputVersion,
      latestRequestedAtMs,
      latestRenderedAtMs,
      latestRequestToDiscLatencyMs,
      latestClientPosition,
      latestRenderedClientPosition,
      latestDiscClientPosition,
      latestSampleClientPosition,
      latestRequestedClientPosition,
      latestRequestedSampleClientPosition,
    }: PointQueryTelemetrySnapshotArgs): PointQueryControllerTelemetrySnapshot => ({
      capturedAt: new Date().toISOString(),
      maxRenderRequestRateHz,
      latestRatesHz: { ...latestRatesHz },
      latestInputVersion,
      lastProcessedInputVersion,
      latestRequestedAtMs,
      latestRenderedAtMs,
      latestRequestToDiscLatencyMs,
      latestMeasuredLagSource,
      latestMeasuredLagPx,
      latestLiveLagPx,
      latestSampleOffsetPx,
      latestClientPosition: cloneScreenVector(latestClientPosition),
      latestRenderedClientPosition: cloneScreenVector(
        latestRenderedClientPosition
      ),
      latestDiscClientPosition: cloneScreenVector(latestDiscClientPosition),
      latestSampleClientPosition: cloneScreenVector(latestSampleClientPosition),
      latestRequestedClientPosition: cloneScreenVector(
        latestRequestedClientPosition
      ),
      latestRequestedSampleClientPosition: cloneScreenVector(
        latestRequestedSampleClientPosition
      ),
      tangentPlaneFailureCount,
      tangentPlaneFailureCounts: { ...tangentPlaneFailureCounts },
      latestTangentPlaneFailure: cloneTangentPlaneFailure(
        latestTangentPlaneFailure
      ),
      discOriginJumpCount,
      latestDiscOriginJump: cloneDiscOriginJump(latestDiscOriginJump),
      discScaleChangeCount,
      latestDiscScaleChange: latestDiscScaleChange
        ? { ...latestDiscScaleChange }
        : null,
      entries: telemetryEntries.map((entry) => ({ ...entry })),
      tangentPlaneFailures: tangentPlaneFailures.map(
        (failure) => cloneTangentPlaneFailure(failure)!
      ),
      discOriginJumps: discOriginJumps.map(
        (jump) => cloneDiscOriginJump(jump)!
      ),
      discScaleChanges: discScaleChanges.map((scaleChange) => ({
        ...scaleChange,
      })),
    }),
    destroy: () => {
      hideLagDebugOverlay();
      lagDebugOverlay.destroy();
      resetPointQueryDebugStatusElements(statusElements);
    },
  };
};
