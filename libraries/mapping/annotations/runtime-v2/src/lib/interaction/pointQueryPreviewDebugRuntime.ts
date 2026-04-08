import { Cartesian3, type Scene } from "@carma-cesium";
import { getDiscWorldRadius } from "@carma-mapping/engines/cesium/core";

import {
  isPointQueryPreviewDiscPlaneOffsetPlacementMode,
  type PointQueryPreviewDiscPlacementMode,
} from "./pointQueryPreviewDiscPlacementMode";
import {
  POINT_QUERY_PREVIEW_TANGENT_PLANE_FAILURE_REASONS,
  type PointQueryPreviewControllerTelemetrySnapshot,
  type PointQueryPreviewDiscOriginJump,
  type PointQueryPreviewDiscScaleChange,
  type PointQueryPreviewTangentPlaneFailure,
  type PointQueryPreviewTangentPlaneFailureReason,
  type PointQueryPreviewTelemetryEntry,
} from "./pointQueryPreviewController.types";

type ScreenVector = {
  x: number;
  y: number;
};

type ObservedClientPosition = {
  x: number;
  y: number;
  timestampMs: number;
};

export type PointQueryPreviewStatusElements = {
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

type PointQueryPreviewLagMetrics = {
  latestMeasuredLagSource: "none" | "live" | "offset";
  latestMeasuredLagPx: number;
  latestLiveLagPx: number;
  latestSampleOffsetPx: number;
  latestRequestToDiscLatencyMs: number;
};

type PointQueryPreviewRatesHz = {
  mouse: number;
  render: number;
  sample: number;
  disc: number;
  skip: number;
};

type PointQueryPreviewTelemetrySnapshotArgs = {
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

type PointQueryPreviewRecordTelemetryEntryArgs = {
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

type PointQueryPreviewRecordTangentPlaneFailureArgs = {
  inputVersion: number;
  reason: PointQueryPreviewTangentPlaneFailureReason;
  requestedAtMs: number;
  placementMode: PointQueryPreviewDiscPlacementMode;
  clientPosition: ScreenVector | null;
  screenPosition: ScreenVector | null;
  hasLatestTrueDiscWorldPosition: boolean;
  hasLatestDiscNormal: boolean;
  hasSampledPoint: boolean;
  hasSampledSurfaceNormal: boolean;
};

type PointQueryPreviewRecordDiscOriginJumpArgs = {
  inputVersion: number;
  requestedAtMs: number;
  placementMode: PointQueryPreviewDiscPlacementMode;
  previousDiscWorldPosition: Cartesian3 | null;
  nextDiscWorldPosition: Cartesian3;
  nextDiscNormal: Cartesian3;
  previousClientPosition: ScreenVector | null;
  nextClientPosition: ScreenVector | null;
  source: "true-sample" | "fast-reproject";
};

type PointQueryPreviewRecordDiscScaleChangeArgs = {
  inputVersion: number;
  requestedAtMs: number;
  placementMode: PointQueryPreviewDiscPlacementMode;
  nextScaleFactor: number;
  source: "true-sample" | "fast-reproject";
};

const FIGURE_SPACE = "\u2007";
const PERFORMANCE_IDLE_RESET_MS = 300;
const PERFORMANCE_REPORT_INTERVAL_MS = 250;
const MAX_TELEMETRY_ENTRY_COUNT = 600;
const MAX_TANGENT_PLANE_FAILURE_COUNT = 200;
const MAX_DISC_ORIGIN_JUMP_COUNT = 200;
const DISC_ORIGIN_JUMP_PIXEL_RESOLUTION_MULTIPLIER = 100;
const DISC_SCALE_CHANGE_RELATIVE_THRESHOLD = 0.2;
const FAILED_PICK_LOG_THROTTLE_MS = 250;
const FAILED_PICK_LOG_SCREEN_BUCKET_PX = 8;

const createInitialTangentPlaneFailureCounts = (): Record<
  PointQueryPreviewTangentPlaneFailureReason,
  number
> => ({
  [POINT_QUERY_PREVIEW_TANGENT_PLANE_FAILURE_REASONS.MISSING_SCREEN_POSITION]: 0,
  [POINT_QUERY_PREVIEW_TANGENT_PLANE_FAILURE_REASONS.MISSING_TRUE_DISC_POINT]:
    0,
  [POINT_QUERY_PREVIEW_TANGENT_PLANE_FAILURE_REASONS.MISSING_TRUE_DISC_NORMAL]:
    0,
  [POINT_QUERY_PREVIEW_TANGENT_PLANE_FAILURE_REASONS.TRUE_SAMPLE_MISS]: 0,
  [POINT_QUERY_PREVIEW_TANGENT_PLANE_FAILURE_REASONS.TRUE_NORMAL_MISS]: 0,
  [POINT_QUERY_PREVIEW_TANGENT_PLANE_FAILURE_REASONS.REPROJECTION_MISS]: 0,
});

export const formatPointQueryPreviewReadout = (
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

const formatPointQueryPreviewStatusRate = (label: string, valueHz: number) => {
  const clampedValueHz = Number.isFinite(valueHz) ? Math.max(valueHz, 0) : 0;
  const paddedValue = clampedValueHz
    .toFixed(1)
    .replace(/ /g, FIGURE_SPACE)
    .padStart(7, FIGURE_SPACE);

  return `${label} ${paddedValue} Hz`;
};

const formatTangentPlaneFailureReadout = ({
  failure,
  failureCount,
}: {
  failure: PointQueryPreviewTangentPlaneFailure | null;
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
  jump: PointQueryPreviewDiscOriginJump | null;
  jumpCount: number;
}) => {
  if (!jump) {
    return "jump ok";
  }

  return `jump ${jump.distanceMeters.toFixed(2)}m > ${jump.thresholdMeters.toFixed(
    2
  )}m #${jumpCount}`;
};

const formatDiscScaleChangeReadout = ({
  scaleChange,
  scaleChangeCount,
}: {
  scaleChange: PointQueryPreviewDiscScaleChange | null;
  scaleChangeCount: number;
}) => {
  if (!scaleChange) {
    return "scale ok";
  }

  return `scale ${scaleChange.previousScaleFactor.toFixed(
    2
  )} -> ${scaleChange.nextScaleFactor.toFixed(2)} #${scaleChangeCount}`;
};

const resetPointQueryPreviewStatusElements = ({
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
}: PointQueryPreviewStatusElements) => {
  if (readoutElement) {
    readoutElement.textContent = "pointer idle";
  }
  if (mousePositionRateElement) {
    mousePositionRateElement.textContent = formatPointQueryPreviewStatusRate(
      "mouse",
      0
    );
  }
  if (renderRequestRateElement) {
    renderRequestRateElement.textContent = formatPointQueryPreviewStatusRate(
      "render",
      0
    );
  }
  if (sampleRateElement) {
    sampleRateElement.textContent = formatPointQueryPreviewStatusRate(
      "sample",
      0
    );
  }
  if (discUpdateRateElement) {
    discUpdateRateElement.textContent = formatPointQueryPreviewStatusRate(
      "disc",
      0
    );
  }
  if (skippedInputRateElement) {
    skippedInputRateElement.textContent = formatPointQueryPreviewStatusRate(
      "skip",
      0
    );
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

  const angleDeg = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;
  element.style.display = "block";
  element.style.left = `${start.x}px`;
  element.style.top = `${start.y}px`;
  element.style.width = `${lengthPx}px`;
  element.style.transform = `translateY(-50%) rotate(${angleDeg}deg)`;
  if (headElement) {
    headElement.style.display = "block";
    headElement.style.left = `${end.x}px`;
    headElement.style.top = `${end.y}px`;
    headElement.style.transform =
      `translate(-50%, -50%) rotate(${angleDeg}deg)`;
  }
};

const createPointQueryPreviewLagDebugOverlay = () => {
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
    metrics: PointQueryPreviewLagMetrics,
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
    if (
      metrics.latestMeasuredLagSource === "offset" &&
      sampleClientPosition
    ) {
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

const cloneScreenVector = (value: ScreenVector | null) =>
  value ? { ...value } : null;

const cloneTangentPlaneFailure = (
  failure: PointQueryPreviewTangentPlaneFailure | null
) =>
  failure
    ? {
        ...failure,
        clientPosition: cloneScreenVector(failure.clientPosition),
        screenPosition: cloneScreenVector(failure.screenPosition),
      }
    : null;

const cloneDiscOriginJump = (jump: PointQueryPreviewDiscOriginJump | null) =>
  jump
    ? {
        ...jump,
        previousClientPosition: cloneScreenVector(jump.previousClientPosition),
        nextClientPosition: { ...jump.nextClientPosition },
      }
    : null;

const buildFailedPickLogSignature = (
  failure: PointQueryPreviewTangentPlaneFailure
) =>
  [
    failure.reason,
    failure.placementMode,
    failure.screenPosition
      ? Math.round(failure.screenPosition.x / FAILED_PICK_LOG_SCREEN_BUCKET_PX)
      : "none",
    failure.screenPosition
      ? Math.round(failure.screenPosition.y / FAILED_PICK_LOG_SCREEN_BUCKET_PX)
      : "none",
  ].join(":");

const readHasDebugSinks = ({
  statusElements,
  onTangentPlaneFailure,
}: {
  statusElements: PointQueryPreviewStatusElements;
  onTangentPlaneFailure?: (
    failure: PointQueryPreviewTangentPlaneFailure
  ) => void;
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

export const createPointQueryPreviewDebugRuntime = ({
  scene,
  statusElements,
  onTangentPlaneFailure,
  enabled = false,
}: {
  scene: Scene;
  statusElements: PointQueryPreviewStatusElements;
  onTangentPlaneFailure?: (
    failure: PointQueryPreviewTangentPlaneFailure
  ) => void;
  enabled?: boolean;
}) => {
  const lagDebugOverlay = createPointQueryPreviewLagDebugOverlay();
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
  let latestRatesHz: PointQueryPreviewRatesHz = {
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
  const telemetryEntries: PointQueryPreviewTelemetryEntry[] = [];
  const tangentPlaneFailures: PointQueryPreviewTangentPlaneFailure[] = [];
  const tangentPlaneFailureCounts = createInitialTangentPlaneFailureCounts();
  const recordedTangentPlaneFailureKeys = new Set<string>();
  let tangentPlaneFailureCount = 0;
  let latestTangentPlaneFailure: PointQueryPreviewTangentPlaneFailure | null =
    null;
  const discOriginJumps: PointQueryPreviewDiscOriginJump[] = [];
  let discOriginJumpCount = 0;
  let latestDiscOriginJump: PointQueryPreviewDiscOriginJump | null = null;
  const discScaleChanges: PointQueryPreviewDiscScaleChange[] = [];
  let discScaleChangeCount = 0;
  let latestDiscScaleChange: PointQueryPreviewDiscScaleChange | null = null;
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
        latestMeasuredLagSource === "none"
          ? ""
          : ` ${latestMeasuredLagSource}`;
      statusElements.lagReadoutElement.textContent =
        `lag ${latestMeasuredLagPx.toFixed(1)} px${sourceLabel}`;
    }
    if (statusElements.syncReadoutElement) {
      statusElements.syncReadoutElement.textContent =
        `sync ${latestRequestToDiscLatencyMs.toFixed(1)} ms`;
    }
    if (statusElements.requestTimingReadoutElement) {
      statusElements.requestTimingReadoutElement.textContent =
        `live ${latestLiveLagPx.toFixed(1)} | off ${latestSampleOffsetPx.toFixed(1)} px`;
    }
  };

  const maybeLogFailedPick = (failure: PointQueryPreviewTangentPlaneFailure) => {
    if (
      failure.reason !==
      POINT_QUERY_PREVIEW_TANGENT_PLANE_FAILURE_REASONS.TRUE_SAMPLE_MISS
    ) {
      return;
    }

    const signature = buildFailedPickLogSignature(failure);
    if (
      lastFailedPickLogSignature === signature &&
      failure.t - lastFailedPickLogTimeMs < FAILED_PICK_LOG_THROTTLE_MS
    ) {
      return;
    }

    lastFailedPickLogSignature = signature;
    lastFailedPickLogTimeMs = failure.t;

    console.warn("[PointQueryPreview] preferred pick miss", {
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
      nowMs - lastMousePositionEventTimeMs >= PERFORMANCE_IDLE_RESET_MS;
    const renderIdle =
      lastRenderRequestEventTimeMs <= 0 ||
      nowMs - lastRenderRequestEventTimeMs >= PERFORMANCE_IDLE_RESET_MS;
    const sampleIdle =
      lastSampleEventTimeMs <= 0 ||
      nowMs - lastSampleEventTimeMs >= PERFORMANCE_IDLE_RESET_MS;
    const discIdle =
      lastDiscUpdateEventTimeMs <= 0 ||
      nowMs - lastDiscUpdateEventTimeMs >= PERFORMANCE_IDLE_RESET_MS;
    const skippedIdle =
      lastSkippedInputEventTimeMs <= 0 ||
      nowMs - lastSkippedInputEventTimeMs >= PERFORMANCE_IDLE_RESET_MS;

    if (!force && elapsedMs < PERFORMANCE_REPORT_INTERVAL_MS) {
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
        formatPointQueryPreviewStatusRate("mouse", latestRatesHz.mouse);
    }
    if (statusElements.renderRequestRateElement) {
      statusElements.renderRequestRateElement.textContent =
        formatPointQueryPreviewStatusRate("render", latestRatesHz.render);
    }
    if (statusElements.sampleRateElement) {
      statusElements.sampleRateElement.textContent =
        formatPointQueryPreviewStatusRate("sample", latestRatesHz.sample);
    }
    if (statusElements.discUpdateRateElement) {
      statusElements.discUpdateRateElement.textContent =
        formatPointQueryPreviewStatusRate("disc", latestRatesHz.disc);
    }
    if (statusElements.skippedInputRateElement) {
      statusElements.skippedInputRateElement.textContent =
        formatPointQueryPreviewStatusRate("skip", latestRatesHz.skip);
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
    resetPointQueryPreviewStatusElements(statusElements);
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
      resetPointQueryPreviewStatusElements(statusElements);
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
      placementMode: PointQueryPreviewDiscPlacementMode;
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
        isPointQueryPreviewDiscPlaneOffsetPlacementMode(placementMode) &&
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
    }: PointQueryPreviewRecordTelemetryEntryArgs) => {
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
      if (telemetryEntries.length > MAX_TELEMETRY_ENTRY_COUNT) {
        telemetryEntries.splice(
          0,
          telemetryEntries.length - MAX_TELEMETRY_ENTRY_COUNT
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
    }: PointQueryPreviewRecordTangentPlaneFailureArgs) => {
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

      const failure: PointQueryPreviewTangentPlaneFailure = {
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
      if (tangentPlaneFailures.length > MAX_TANGENT_PLANE_FAILURE_COUNT) {
        tangentPlaneFailures.splice(
          0,
          tangentPlaneFailures.length - MAX_TANGENT_PLANE_FAILURE_COUNT
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
    }: PointQueryPreviewRecordDiscOriginJumpArgs) => {
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
        DISC_ORIGIN_JUMP_PIXEL_RESOLUTION_MULTIPLIER;
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
          DISC_ORIGIN_JUMP_PIXEL_RESOLUTION_MULTIPLIER,
        source,
        previousClientPosition: cloneScreenVector(previousClientPosition),
        nextClientPosition: nextClientPosition
          ? { ...nextClientPosition }
          : { x: 0, y: 0 },
      };
      discOriginJumpCount += 1;
      discOriginJumps.push(latestDiscOriginJump);
      if (discOriginJumps.length > MAX_DISC_ORIGIN_JUMP_COUNT) {
        discOriginJumps.splice(
          0,
          discOriginJumps.length - MAX_DISC_ORIGIN_JUMP_COUNT
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
    }: PointQueryPreviewRecordDiscScaleChangeArgs) => {
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
      if (relativeChange <= DISC_SCALE_CHANGE_RELATIVE_THRESHOLD) {
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
        thresholdRelativeChange: DISC_SCALE_CHANGE_RELATIVE_THRESHOLD,
      };
      discScaleChangeCount += 1;
      discScaleChanges.push(latestDiscScaleChange);
      if (discScaleChanges.length > MAX_DISC_ORIGIN_JUMP_COUNT) {
        discScaleChanges.splice(
          0,
          discScaleChanges.length - MAX_DISC_ORIGIN_JUMP_COUNT
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
    }: PointQueryPreviewTelemetrySnapshotArgs): PointQueryPreviewControllerTelemetrySnapshot => ({
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
      tangentPlaneFailures: tangentPlaneFailures.map((failure) =>
        cloneTangentPlaneFailure(failure)!
      ),
      discOriginJumps: discOriginJumps.map((jump) => cloneDiscOriginJump(jump)!),
      discScaleChanges: discScaleChanges.map((scaleChange) => ({
        ...scaleChange,
      })),
    }),
    destroy: () => {
      hideLagDebugOverlay();
      lagDebugOverlay.destroy();
      resetPointQueryPreviewStatusElements(statusElements);
    },
  };
};
