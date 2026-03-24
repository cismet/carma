import { useMemo, type CSSProperties, type ReactNode } from "react";
import {
  CAMERA_TYPE,
  type CameraIntrinsics,
  type CameraType,
} from "@carma-commons/camera/model";
import {
  ObjectCentricViewStateInfoBox,
  type ObjectCentricViewStateInfoRow,
} from "@carma-mapping/components";
import { type ViewStateVisualizerDisplayOptions } from "@carma-mapping/engines/three/primitives";
import {
  deriveView,
  projectViewSyncTargetToMapLibre,
  readViewSyncHorizontalFov,
  readViewSyncVerticalFov,
  useViewState,
  type CommonViewState,
  type ViewState,
} from "@carma-mapping/engines-interop/view-sync";
import { formatLengthMeters, radToDegNumeric } from "@carma/units/helpers";

const FIGURE_SPACE = "\u2007";
const NARROW_NO_BREAK_SPACE = "\u202f";
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

const formatOrUnresolved = (
  value: number | null | undefined,
  formatter: (resolvedValue: number) => string
) =>
  typeof value === "number" && Number.isFinite(value)
    ? formatter(value)
    : "unresolved";

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
  intrinsics: CameraIntrinsics | null | undefined
): number | null => {
  const candidate = (intrinsics as { aspect?: unknown } | null | undefined)
    ?.aspect;
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? candidate
    : null;
};

const toOverlayViewState = (state: CommonViewState): ViewState => {
  const derived = deriveView(state);
  return {
    longitude: derived.longitude,
    latitude: derived.latitude,
    altitude: derived.altitude,
    zoom: derived.zoom,
    bearing: derived.bearing,
    pitch: derived.pitch,
    roll: derived.roll,
    range: derived.range,
    ...(typeof state.intrinsics.fov === "number" &&
    Number.isFinite(state.intrinsics.fov)
      ? { fovVertical: state.intrinsics.fov }
      : {}),
    ...(typeof state.intrinsics.fovHorizontal === "number" &&
    Number.isFinite(state.intrinsics.fovHorizontal)
      ? { fovHorizontal: state.intrinsics.fovHorizontal }
      : {}),
  };
};

export const formatTargetSummary = (
  target: ViewState | null | undefined
): string => {
  if (!target) {
    return "target unresolved";
  }

  return [
    `${radToDegNumeric(target.longitude).toFixed(5)}`,
    `${radToDegNumeric(target.latitude).toFixed(5)}`,
    `${target.altitude.toFixed(1)}m`,
    `b ${radToDegNumeric(target.bearing).toFixed(1)}°`,
    `p ${radToDegNumeric(target.pitch).toFixed(1)}°`,
    `r ${target.range.toFixed(1)}m`,
  ].join(" • ");
};

const formatViewSyncTargetTableRows = (
  target: ViewState | null | undefined,
  intrinsics: CameraIntrinsics | null | undefined
): ObjectCentricViewStateInfoRow[] => {
  if (!target) {
    return [
      { kind: "section", key: "geographic", label: "Geographic" },
      { label: "longitude", value: "unresolved" },
      { label: "latitude", value: "unresolved" },
      {
        cueLabel: "ℎ",
        cueColor: ALTITUDE_CUE_COLOR,
        label: "ellipsoidal height",
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

  const fovVertical = readViewSyncVerticalFov(target);
  const fovHorizontal = readViewSyncHorizontalFov(target);
  const projection = projectViewSyncTargetToMapLibre(target);

  return [
    {
      kind: "section",
      key: "geographic",
      label: "Geographic",
    },
    {
      label: "longitude",
      value: `${formatAlignedNumber(radToDegNumeric(target.longitude), 5)}°`,
    },
    {
      label: "latitude",
      value: `${formatAlignedNumber(radToDegNumeric(target.latitude), 5)}°`,
    },
    {
      cueLabel: "ℎ",
      cueColor: ALTITUDE_CUE_COLOR,
      label: "ellipsoidal height",
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
      value: `${formatAlignedNumber(radToDegNumeric(target.bearing), 1)}°`,
    },
    {
      cueLabel: "p",
      cueColor: PITCH_CUE_COLOR,
      label: "pitch",
      value: `${formatAlignedNumber(radToDegNumeric(target.pitch), 1)}°`,
    },
    {
      cueLabel: "r",
      cueColor: RANGE_CUE_COLOR,
      label: "range",
      value: formatAlignedNumber(target.range, 1, "m"),
    },
    {
      label: "zoom equiv.",
      value: projection
        ? formatCompactNumber(projection.zoom, 2)
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
      value: `${formatOrUnresolved(
        fovVertical,
        (resolvedFovVertical) =>
          `${formatCompactNumber(radToDegNumeric(resolvedFovVertical), 1)}°`
      )} / ${formatOrUnresolved(
        fovHorizontal,
        (resolvedFovHorizontal) =>
          `${formatCompactNumber(radToDegNumeric(resolvedFovHorizontal), 1)}°`
      )}`,
    },
    {
      label: "aspect ratio",
      value: formatOrUnresolved(
        readIntrinsicsAspect(intrinsics),
        (resolvedAspect) => formatCompactNumber(resolvedAspect, 3)
      ),
    },
    {
      label: "near",
      value: formatOrUnresolved(intrinsics?.frustum?.near, (resolvedNear) =>
        formatLengthMeters(resolvedNear, {
          maximumFractionDigitsMeters: 2,
          maximumFractionDigitsKilometers: 2,
        })
      ),
    },
    {
      label: "far",
      value: formatOrUnresolved(intrinsics?.frustum?.far, (resolvedFar) =>
        formatLengthMeters(resolvedFar, {
          maximumFractionDigitsMeters: 2,
          maximumFractionDigitsKilometers: 2,
        })
      ),
    },
  ];
};

const FRAMEWORK_STATUS_PREFIX_RE =
  /^(?:(?:cesium|maplibre|leaflet)\s*->\s*(?:cesium|maplibre|leaflet)|(cesium|maplibre|leaflet))\s*•\s*/i;

const stripFrameworkStatusPrefix = (text: string): string =>
  text.replace(FRAMEWORK_STATUS_PREFIX_RE, "");

const formatViewSyncJson = (target: ViewState | null | undefined) =>
  JSON.stringify(target ?? null, null, 2);

export const buildPanelStatusText = (
  text: string,
  hashText?: string | null
): ReactNode => (
  <span
    style={{
      display: "flex",
      flexDirection: "column",
      width: "100%",
      textAlign: "center",
      lineHeight: 1.15,
      paddingBlock: 3,
    }}
  >
    <span>{stripFrameworkStatusPrefix(text)}</span>
    {hashText ? (
      <span
        style={{
          opacity: 0.8,
          fontSize: 11,
        }}
      >
        {hashText}
      </span>
    ) : null}
  </span>
);

export const ViewSyncMetaOverlay = ({
  fallbackTarget,
  style,
}: {
  fallbackTarget: CommonViewState;
  style?: CSSProperties;
}) => {
  const currentState = useViewState();
  const visualizerState = currentState ?? fallbackTarget;
  const visualizerTarget = useMemo(
    () => toOverlayViewState(visualizerState),
    [visualizerState]
  );
  const rows = useMemo(
    () =>
      formatViewSyncTargetTableRows(
        visualizerTarget,
        visualizerState.intrinsics
      ),
    [visualizerTarget, visualizerState.intrinsics]
  );
  const formattedViewJson = useMemo(
    () => formatViewSyncJson(visualizerTarget),
    [visualizerTarget]
  );
  const visualizerDisplayOptions = useMemo(
    () => ({} satisfies ViewStateVisualizerDisplayOptions),
    []
  );
  return (
    <ObjectCentricViewStateInfoBox
      rows={rows}
      viewState={visualizerState}
      visualizerInteractive={true}
      visualizerDisplayOptions={visualizerDisplayOptions}
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
