import { useMemo, type CSSProperties, type ReactNode } from "react";

import {
  CAMERA_TYPE,
  readLongerEdgeFovFromIntrinsics,
  readMetersPerCssPixelFromIntrinsics,
  readRangeFromMetersPerCssPixel,
  type CameraType,
} from "@carma-commons/camera/model";
import {
  ObjectCentricViewStateInfoBox,
  type ObjectCentricViewStateInfoRow,
} from "@carma-mapping/components";
import {
  buildViewState,
  deriveOrbitAngles,
  deriveRoll,
  deriveView,
  useViewState,
  useViewStateControllerId,
  type ViewState,
  type ShareableViewState,
} from "@carma-mapping/engines-interop/view-state";
import {
  type ViewStateVisualizerDisplayOptions,
  type ViewStateVisualizerVisualizedOptions,
} from "@carma-mapping/engines/three/primitives";
import { latLngRadToDeg } from "@carma/geo/helpers";
import {
  formatLatLonDegrees,
  formatLengthMetersScientificParts,
  radToDegNumeric,
} from "@carma/units/helpers";

import {
  CARMA_STORY_MAPPING_ENGINES,
  STORY_MAPPING_ENGINE_OPTIONS,
  type StoryMappingEngine,
} from "./mappingEngines";
type MappingEngineStatusFormatOptions = {
  delimiter?: string;
};

const FIGURE_SPACE = "\u2007";
const HAIR_SPACE = "\u200A";
const NARROW_NO_BREAK_SPACE = "\u202f";
const THIN_SPACE = "\u2009";
export const DEFAULT_STATUS_BAR_DELIMITER = FIGURE_SPACE;
const RANGE_CUE_COLOR = "#64748b";
const ALTITUDE_CUE_COLOR = "#94a3b8";
const BEARING_CUE_COLOR = "#22d3ee";
const PITCH_CUE_COLOR = "#f59e0b";

const formatAlignedNumber = (
  value: number,
  fractionDigits: number,
  unit?: string
) => {
  const signPrefix = value < 0 ? "-" : FIGURE_SPACE;
  const suffix = unit ? `${NARROW_NO_BREAK_SPACE}${unit}` : "";
  return `${signPrefix}${Math.abs(value).toFixed(fractionDigits)}${suffix}`;
};

const formatCompactNumber = (
  value: number,
  fractionDigits: number,
  unit?: string
) => {
  const suffix = unit ? `${NARROW_NO_BREAK_SPACE}${unit}` : "";
  return `${Math.abs(value).toFixed(fractionDigits)}${suffix}`;
};

const formatCompactDecimal = (value: number, fractionDigits: number): string =>
  value
    .toFixed(fractionDigits)
    .replace(/(\.\d*?[1-9])0+$/u, "$1")
    .replace(/\.0+$/u, "");

const formatStatusMetric = (label: string, value: string): string =>
  `${label}${HAIR_SPACE}${value}`;

const formatOrUnresolved = (
  value: number | null | undefined,
  formatter: (resolvedValue: number) => ReactNode
) =>
  typeof value === "number" && Number.isFinite(value)
    ? formatter(value)
    : "unresolved";

const renderScientificLengthMeters = (value: number): ReactNode => {
  const formatted = formatLengthMetersScientificParts(value);
  if (formatted.exponent === null) {
    return formatted.text;
  }

  return (
    <>
      {formatted.coefficient}
      {THIN_SPACE}
      {"\u00D7"}
      {THIN_SPACE}
      10
      <sup>{formatted.exponent}</sup>
      {NARROW_NO_BREAK_SPACE}
      {formatted.unit}
    </>
  );
};

const formatCameraType = (cameraType: CameraType | null | undefined) => {
  if (!cameraType) {
    return "unresolved";
  }
  if (cameraType === CAMERA_TYPE.PERSPECTIVE) {
    return "Perspective";
  }
  if (cameraType === CAMERA_TYPE.ORTHOGRAPHIC) {
    return "Orthographic";
  }
  return cameraType;
};

const readIntrinsicsAspect = (
  state: ViewState | null | undefined
): number | null => {
  const intrinsics = state?.intrinsics;
  const viewport = state?.metadata.viewport;
  const viewOffset = intrinsics?.viewOffset;
  const candidate = (intrinsics as { aspect?: unknown } | null | undefined)
    ?.aspect;
  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return candidate;
  }

  if (
    typeof viewport?.widthPx === "number" &&
    Number.isFinite(viewport.widthPx) &&
    viewport.widthPx > 0 &&
    typeof viewport?.heightPx === "number" &&
    Number.isFinite(viewport.heightPx) &&
    viewport.heightPx > 0
  ) {
    return viewport.widthPx / viewport.heightPx;
  }

  if (
    typeof viewOffset?.width === "number" &&
    Number.isFinite(viewOffset.width) &&
    viewOffset.width > 0 &&
    typeof viewOffset?.height === "number" &&
    Number.isFinite(viewOffset.height) &&
    viewOffset.height > 0
  ) {
    return viewOffset.width / viewOffset.height;
  }

  if (
    typeof intrinsics?.fov === "number" &&
    Number.isFinite(intrinsics.fov) &&
    intrinsics.fov > 0 &&
    typeof intrinsics?.fovHorizontal === "number" &&
    Number.isFinite(intrinsics.fovHorizontal) &&
    intrinsics.fovHorizontal > 0
  ) {
    const tanVerticalHalfFov = Math.tan(intrinsics.fov * 0.5);
    const tanHorizontalHalfFov = Math.tan(intrinsics.fovHorizontal * 0.5);

    if (
      Number.isFinite(tanVerticalHalfFov) &&
      tanVerticalHalfFov > 0 &&
      Number.isFinite(tanHorizontalHalfFov) &&
      tanHorizontalHalfFov > 0
    ) {
      return tanHorizontalHalfFov / tanVerticalHalfFov;
    }
  }

  return null;
};

const readVisualizerViewportDimensions = (
  state: ViewState | null | undefined
): { widthPx: number; heightPx: number } | null => {
  const viewport = state?.metadata.viewport;
  if (
    typeof viewport?.widthPx === "number" &&
    Number.isFinite(viewport.widthPx) &&
    viewport.widthPx > 0 &&
    typeof viewport?.heightPx === "number" &&
    Number.isFinite(viewport.heightPx) &&
    viewport.heightPx > 0
  ) {
    return {
      widthPx: viewport.widthPx,
      heightPx: viewport.heightPx,
    };
  }

  const viewOffset = state?.intrinsics.viewOffset;
  if (
    typeof viewOffset?.width === "number" &&
    Number.isFinite(viewOffset.width) &&
    viewOffset.width > 0 &&
    typeof viewOffset?.height === "number" &&
    Number.isFinite(viewOffset.height) &&
    viewOffset.height > 0
  ) {
    return {
      widthPx: viewOffset.width,
      heightPx: viewOffset.height,
    };
  }

  return null;
};

const readPoseEvaluability = (
  state: ViewState,
  key: "bearing" | "pitch" | "roll" | "range"
): boolean => state.metadata.poseEvaluability?.[key] ?? true;

const buildVisualizerComparisonState = ({
  state,
  referencePerspectiveState,
}: {
  state: ViewState;
  referencePerspectiveState: ViewState | null;
}): ViewState => {
  const isOrthographic = state.intrinsics.type === CAMERA_TYPE.ORTHOGRAPHIC;
  if (!isOrthographic) {
    return state;
  }

  let comparisonRange: number | null = null;
  if (
    referencePerspectiveState &&
    referencePerspectiveState.intrinsics.type === CAMERA_TYPE.PERSPECTIVE
  ) {
    const stateViewport =
      readVisualizerViewportDimensions(state) ??
      readVisualizerViewportDimensions(referencePerspectiveState);
    const referenceViewport = readVisualizerViewportDimensions(
      referencePerspectiveState
    );
    const longerEdgeFov = readLongerEdgeFovFromIntrinsics(
      referencePerspectiveState.intrinsics,
      {
        viewportWidthPx: referenceViewport?.widthPx,
        viewportHeightPx: referenceViewport?.heightPx,
      }
    );
    const metersPerCssPixel = readMetersPerCssPixelFromIntrinsics({
      intrinsics: state.intrinsics,
      viewportWidthPx: stateViewport?.widthPx,
      viewportHeightPx: stateViewport?.heightPx,
    });

    if (
      typeof longerEdgeFov === "number" &&
      Number.isFinite(longerEdgeFov) &&
      longerEdgeFov > 0 &&
      typeof metersPerCssPixel === "number" &&
      Number.isFinite(metersPerCssPixel) &&
      metersPerCssPixel > 0
    ) {
      comparisonRange = readRangeFromMetersPerCssPixel({
        metersPerCssPixel,
        fovRad: longerEdgeFov,
        viewportWidthPx: stateViewport?.widthPx,
        viewportHeightPx: stateViewport?.heightPx,
      });
    }
  }

  const derivedOrbit = deriveOrbitAngles(state);
  const derivedRoll = deriveRoll(state);
  const resolvedBearing = readPoseEvaluability(state, "bearing")
    ? derivedOrbit.bearing
    : 0;
  const resolvedPitch = readPoseEvaluability(state, "pitch")
    ? derivedOrbit.pitch
    : 0;
  const resolvedRoll = readPoseEvaluability(state, "roll") ? derivedRoll : 0;
  const resolvedRange =
    typeof comparisonRange === "number" &&
    Number.isFinite(comparisonRange) &&
    comparisonRange > 0
      ? comparisonRange
      : readPoseEvaluability(state, "range")
      ? derivedOrbit.range
      : 1;

  if (
    resolvedBearing === derivedOrbit.bearing &&
    resolvedPitch === derivedOrbit.pitch &&
    resolvedRoll === derivedRoll &&
    resolvedRange === derivedOrbit.range
  ) {
    return state;
  }

  return buildViewState({
    longitude: state.anchorCartographic.longitude,
    latitude: state.anchorCartographic.latitude,
    altitude: state.anchorCartographic.altitude as number,
    bearing: resolvedBearing,
    pitch: resolvedPitch,
    roll: resolvedRoll,
    range: resolvedRange,
    intrinsics: state.intrinsics,
    metadata: state.metadata,
  });
};

const toOverlayViewState = (state: ViewState): ShareableViewState => {
  const derived = deriveView(state);
  return {
    lng: radToDegNumeric(derived.longitude),
    lat: radToDegNumeric(derived.latitude),
    altitude: derived.altitude,
    zoom: derived.zoom,
    bearing: radToDegNumeric(derived.bearing),
    pitch: radToDegNumeric(derived.pitch),
    roll: radToDegNumeric(derived.roll),
    range: derived.range,
    ...(typeof state.intrinsics.fov === "number" &&
    Number.isFinite(state.intrinsics.fov)
      ? { fov: radToDegNumeric(state.intrinsics.fov) }
      : {}),
  };
};

export const formatTargetSummary = (
  target: ShareableViewState | null | undefined
): string => {
  if (!target) {
    return "target unresolved";
  }

  return [
    `${target.lng.toFixed(5)}`,
    `${target.lat.toFixed(5)}`,
    `${target.altitude.toFixed(1)}m`,
    `b ${(target.bearing ?? 0).toFixed(1)}°`,
    `p ${(target.pitch ?? 0).toFixed(1)}°`,
    `r ${target.range?.toFixed(1) ?? "unresolved"}m`,
  ].join(" • ");
};

const formatLongitudeLatitudeStatus = (
  view: ReturnType<typeof deriveView>
): [string, string] => {
  const geographicDegrees = latLngRadToDeg({
    longitude: view.longitude,
    latitude: view.latitude,
  });

  const [latitude, longitude] = formatLatLonDegrees(
    geographicDegrees.latitude,
    geographicDegrees.longitude,
    {
      fractionDigits: 5,
      locale: "en-US",
    }
  );

  return [longitude, latitude];
};

const joinStatusParts = (
  parts: Array<string | null | undefined>,
  delimiter: string
): string =>
  parts.filter((part): part is string => Boolean(part)).join(delimiter);

export const formatMappingEngineStatusFromViewState = (
  engine: StoryMappingEngine,
  state: ViewState | null | undefined,
  options: MappingEngineStatusFormatOptions = {}
): string => {
  const delimiter = options.delimiter ?? DEFAULT_STATUS_BAR_DELIMITER;

  if (!state) {
    return joinStatusParts([engine, "waiting for shared view"], delimiter);
  }

  const view = deriveView(state);
  const [longitude, latitude] = formatLongitudeLatitudeStatus(view);

  if (engine === CARMA_STORY_MAPPING_ENGINES.LEAFLET) {
    return joinStatusParts(
      [
        engine,
        longitude,
        latitude,
        formatStatusMetric("z", formatCompactDecimal(view.zoom, 2)),
      ],
      delimiter
    );
  }

  if (engine === CARMA_STORY_MAPPING_ENGINES.MAPLIBRE_GL) {
    return joinStatusParts(
      [
        engine,
        longitude,
        latitude,
        formatStatusMetric("z", formatCompactDecimal(view.zoom, 2)),
        formatStatusMetric("b", `${radToDegNumeric(view.bearing).toFixed(1)}°`),
        formatStatusMetric("p", `${radToDegNumeric(view.pitch).toFixed(1)}°`),
      ],
      delimiter
    );
  }

  return joinStatusParts(
    [
      engine,
      longitude,
      latitude,
      formatStatusMetric(
        "z",
        `${formatCompactDecimal(view.zoom, 2)} (${view.range.toFixed(1)}m)`
      ),
      formatStatusMetric("b", `${radToDegNumeric(view.bearing).toFixed(1)}°`),
      formatStatusMetric("p", `${radToDegNumeric(view.pitch).toFixed(1)}°`),
      formatStatusMetric("h", `${view.altitude.toFixed(1)}m`),
    ],
    delimiter
  );
};

const formatViewSyncTargetTableRows = (
  target: ShareableViewState | null | undefined,
  state: ViewState | null | undefined
): ObjectCentricViewStateInfoRow[] => {
  const intrinsics = state?.intrinsics;
  if (!target) {
    return [
      { kind: "section", key: "geographic", label: "Geographic" },
      { label: "longitude", value: "unresolved" },
      { label: "latitude", value: "unresolved" },
      {
        cueLabel: "ℎ",
        cueColor: ALTITUDE_CUE_COLOR,
        label: "height",
        value: "unresolved",
        tooltip:
          "Geodetic / ellipsoidal height h above the reference ellipsoid at the ENU anchor.",
      },
      { kind: "section", key: "pose", label: "Pose" },
      {
        cueLabel: "b",
        cueColor: BEARING_CUE_COLOR,
        label: "bearing",
        value: "unresolved",
      },
      {
        cueLabel: "p",
        cueColor: PITCH_CUE_COLOR,
        label: "pitch",
        value: "unresolved",
      },
      {
        cueLabel: "r",
        cueColor: RANGE_CUE_COLOR,
        label: "range",
        value: "unresolved",
      },
      { label: "zoom equiv.", value: "unresolved" },
      { kind: "section", key: "camera", label: "Camera" },
      { label: "type", value: "unresolved" },
      { label: "fov v / h", value: "unresolved" },
      { label: "aspect ratio", value: "unresolved" },
      { label: "near", value: "unresolved" },
      { label: "far", value: "unresolved" },
    ];
  }

  const fovVertical =
    target.fov ??
    (typeof intrinsics?.fov === "number" && Number.isFinite(intrinsics.fov)
      ? radToDegNumeric(intrinsics.fov)
      : undefined);
  const fovHorizontal =
    (typeof intrinsics?.fovHorizontal === "number" &&
    Number.isFinite(intrinsics.fovHorizontal)
      ? radToDegNumeric(intrinsics.fovHorizontal)
      : undefined) ?? fovVertical;
  const projectionZoom = Number.isFinite(target.zoom) ? target.zoom : null;
  const fovDisplayValue =
    intrinsics?.type === CAMERA_TYPE.ORTHOGRAPHIC
      ? "n/a"
      : `${formatOrUnresolved(
          fovVertical,
          (resolvedFovVertical) =>
            `${formatCompactNumber(resolvedFovVertical, 1)}°`
        )} / ${formatOrUnresolved(
          fovHorizontal,
          (resolvedFovHorizontal) =>
            `${formatCompactNumber(resolvedFovHorizontal, 1)}°`
        )}`;

  return [
    {
      kind: "section",
      key: "geographic",
      label: "Geographic",
    },
    {
      label: "longitude",
      value: `${formatAlignedNumber(target.lng, 5)}°`,
    },
    {
      label: "latitude",
      value: `${formatAlignedNumber(target.lat, 5)}°`,
    },
    {
      cueLabel: "ℎ",
      cueColor: ALTITUDE_CUE_COLOR,
      label: "height",
      value: formatAlignedNumber(target.altitude, 1, "m"),
      tooltip:
        "Geodetic / ellipsoidal height h above the reference ellipsoid at the ENU anchor.",
    },
    {
      kind: "section",
      key: "pose",
      label: "Pose",
    },
    {
      cueLabel: "b",
      cueColor: BEARING_CUE_COLOR,
      label: "bearing",
      value: `${formatAlignedNumber(target.bearing ?? 0, 1)}°`,
    },
    {
      cueLabel: "p",
      cueColor: PITCH_CUE_COLOR,
      label: "pitch",
      value: `${formatAlignedNumber(target.pitch ?? 0, 1)}°`,
    },
    {
      cueLabel: "r",
      cueColor: RANGE_CUE_COLOR,
      label: "range",
      value: Number.isFinite(target.range)
        ? formatAlignedNumber(target.range, 1, "m")
        : "unresolved",
    },
    {
      label: "zoom equiv.",
      value:
        projectionZoom !== null
          ? formatCompactNumber(projectionZoom, 2)
          : "unresolved",
    },
    {
      kind: "section",
      key: "camera",
      label: "Camera",
    },
    {
      label: "type",
      value: formatCameraType(intrinsics?.type),
    },
    {
      label: "fov v / h",
      value: fovDisplayValue,
    },
    {
      label: "aspect ratio",
      value: formatOrUnresolved(readIntrinsicsAspect(state), (resolvedAspect) =>
        formatCompactNumber(resolvedAspect, 3)
      ),
    },
    {
      label: "near",
      value: formatOrUnresolved(intrinsics?.frustum?.near, (resolvedNear) =>
        renderScientificLengthMeters(resolvedNear)
      ),
    },
    {
      label: "far",
      value: formatOrUnresolved(intrinsics?.frustum?.far, (resolvedFar) =>
        renderScientificLengthMeters(resolvedFar)
      ),
    },
  ];
};

const MAPPING_ENGINE_STATUS_PATTERN = STORY_MAPPING_ENGINE_OPTIONS.join("|");

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const readMappingEngineStatusPrefixRegExp = (delimiter: string): RegExp =>
  new RegExp(
    `^(?:(?:${MAPPING_ENGINE_STATUS_PATTERN})\\s*->\\s*(?:${MAPPING_ENGINE_STATUS_PATTERN})|(${MAPPING_ENGINE_STATUS_PATTERN}))\\s*${escapeRegex(
      delimiter
    )}\\s*`,
    "i"
  );

const stripMappingEngineStatusPrefix = (
  text: string,
  delimiter: string = DEFAULT_STATUS_BAR_DELIMITER
): string => text.replace(readMappingEngineStatusPrefixRegExp(delimiter), "");

const STATUS_SEGMENT_LABEL_RE = /^([a-z])\s+(.+)$/i;

const formatStatusValue = (value: string): string => {
  const normalizedValue = value.replace(/^-/, "\u2212");
  return normalizedValue;
};

const renderStatusSegment = (segment: string, key: string): ReactNode => {
  const trimmedSegment = segment.trim();
  const match = trimmedSegment.match(STATUS_SEGMENT_LABEL_RE);

  if (!match) {
    return (
      <span
        key={key}
        style={{
          display: "inline-flex",
          alignItems: "baseline",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {trimmedSegment}
      </span>
    );
  }

  const [, label, value] = match;

  return (
    <span
      key={key}
      style={{
        display: "inline-flex",
        alignItems: "baseline",
      }}
    >
      <span
        style={{
          fontWeight: 700,
          opacity: 0.62,
          letterSpacing: "0.01em",
        }}
      >
        {label}
      </span>
      <span aria-hidden>{HAIR_SPACE}</span>
      <span
        style={{
          fontVariantNumeric: "tabular-nums",
          fontWeight: 400,
        }}
      >
        {formatStatusValue(value)}
      </span>
    </span>
  );
};

const formatViewSyncJson = (target: ShareableViewState | null | undefined) =>
  JSON.stringify(target ?? null, null, 2);

export const buildPanelStatusText = (
  text: string,
  delimiter: string = DEFAULT_STATUS_BAR_DELIMITER
): ReactNode => {
  const strippedText = stripMappingEngineStatusPrefix(text, delimiter);
  const segments = strippedText
    .split(delimiter)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        width: "100%",
        justifyContent: "center",
        lineHeight: 1.15,
        paddingTop: 2,
        paddingBottom: 0,
      }}
    >
      {segments.map((segment, index) => (
        <span
          key={`status-segment-${index}`}
          style={{
            display: "inline-flex",
            alignItems: "baseline",
          }}
        >
          {index > 0 ? (
            <span
              aria-hidden
              style={{
                opacity: 0.58,
                fontWeight: 600,
              }}
            >
              {delimiter}
            </span>
          ) : null}
          {renderStatusSegment(segment, `${index}:${segment}`)}
        </span>
      ))}
    </span>
  );
};

export const ViewSyncMetaOverlay = ({
  fallbackTarget,
  visualizerStates,
  visualizerActiveCameraIndex = 0,
  style,
  visualizerWidth,
  visualizerHeight,
}: {
  fallbackTarget: ViewState;
  visualizerStates?: readonly ViewState[];
  visualizerActiveCameraIndex?: number;
  style?: CSSProperties;
  visualizerWidth?: number;
  visualizerHeight?: number;
}) => {
  const currentState = useViewState();
  const controllerId = useViewStateControllerId();
  const primaryVisualizerState = controllerId
    ? currentState ?? fallbackTarget
    : fallbackTarget;
  const rawVisualizerStates = useMemo(
    () =>
      !visualizerStates || visualizerStates.length === 0
        ? [primaryVisualizerState]
        : [...visualizerStates],
    [primaryVisualizerState, visualizerStates]
  );
  const visualizerReferencePerspectiveState = useMemo(
    () =>
      rawVisualizerStates.find(
        (state) => state.intrinsics.type === CAMERA_TYPE.PERSPECTIVE
      ) ?? null,
    [rawVisualizerStates]
  );
  const visualizerState = useMemo(() => {
    const resolvedStates = rawVisualizerStates.map((state) =>
      buildVisualizerComparisonState({
        state,
        referencePerspectiveState: visualizerReferencePerspectiveState,
      })
    );

    return resolvedStates.length === 1 ? resolvedStates[0]! : resolvedStates;
  }, [rawVisualizerStates, visualizerReferencePerspectiveState]);
  const visualizerTarget = useMemo(
    () => toOverlayViewState(primaryVisualizerState),
    [primaryVisualizerState]
  );
  const rows = useMemo(
    () =>
      formatViewSyncTargetTableRows(visualizerTarget, primaryVisualizerState),
    [primaryVisualizerState, visualizerTarget]
  );
  const formattedViewJson = useMemo(
    () => formatViewSyncJson(visualizerTarget),
    [visualizerTarget]
  );
  const visualizerDisplayOptions = useMemo(
    () =>
      ({
        cameraView: {
          frustum: {
            showInactive: false,
          },
        },
      } satisfies ViewStateVisualizerDisplayOptions),
    []
  );
  const visualizerVisualizedOptions = useMemo(
    () =>
      ({
        imagePlaneDistance: 0.33,
      } satisfies ViewStateVisualizerVisualizedOptions),
    []
  );
  return (
    <ObjectCentricViewStateInfoBox
      rows={rows}
      viewState={visualizerState}
      visualizerInteractive={true}
      visualizerActiveCameraIndex={visualizerActiveCameraIndex}
      visualizerVisualizedOptions={visualizerVisualizedOptions}
      visualizerDisplayOptions={visualizerDisplayOptions}
      visualizerWidth={visualizerWidth}
      visualizerHeight={visualizerHeight}
      visualizerBearingLabel="b"
      visualizerPitchLabel="p"
      width={560}
      detailsTitle="View JSON"
      detailsContent={
        <pre
          style={{
            margin: 0,
            padding: "8px 10px",
            overflowX: "auto",
            fontSize: 11,
            lineHeight: 1.45,
            color: "#0f172a",
            background: "rgba(248, 250, 252, 0.92)",
            borderRadius: 6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formattedViewJson}
        </pre>
      }
      collapsible={true}
      heading={
        <span
          style={{
            fontWeight: 700,
            color: "#f8fafc",
          }}
        >
          Shared Object-Centric Scene State
        </span>
      }
      style={style}
    />
  );
};
