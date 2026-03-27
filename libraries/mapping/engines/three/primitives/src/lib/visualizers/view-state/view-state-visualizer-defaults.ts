import { COLORS_HEX } from "@carma-commons/utils";
import { PI_OVER_SIX, PI_OVER_TWO } from "@carma/math";
import type {
  ResolvedViewStateVisualizerDisplayOptions,
  ResolvedViewStateVisualizerOverviewOptions,
  ResolvedViewStateVisualizerVisualizedOptions,
  ViewStateVisualizerCueKey,
  ViewStateVisualizerDisplayOptions,
  ViewStateVisualizerOverviewOptions,
  ViewStateVisualizerVisualizedOptions,
  ViewStateVisualizerSize,
} from "./view-state-visualizer-types";

export const DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS = Object.freeze({
  bearing: "#22d3ee",
  pitch: "#f59e0b",
  range: "#64748b",
  altitude: "#94a3b8",
  east: COLORS_HEX.AXIS_EAST,
  north: COLORS_HEX.AXIS_NORTH,
  up: COLORS_HEX.AXIS_UP,
  cameraForward: "#64748b",
  cameraRight: COLORS_HEX.AXIS_EAST,
  cameraUp: COLORS_HEX.AXIS_UP,
  imageX: COLORS_HEX.AXIS_EAST,
  imageY: COLORS_HEX.AXIS_UP,
}) satisfies Readonly<Record<ViewStateVisualizerCueKey, string>>;

export const DEFAULT_VIEW_STATE_VISUALIZER_OVERVIEW_OPTIONS = Object.freeze({
  fovDeg: 38,
  orthographic: false,
}) satisfies Readonly<ResolvedViewStateVisualizerOverviewOptions>;

export const DEFAULT_VIEW_STATE_VISUALIZER_INTERACTIVE = false;
export const DEFAULT_VIEW_STATE_VISUALIZER_VISUALIZED_OPTIONS = Object.freeze({
  maxPitch: null,
  imagePlaneDistance: null,
}) satisfies Readonly<ResolvedViewStateVisualizerVisualizedOptions>;

export const DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS = Object.freeze({
  surface: Object.freeze({
    showGraticule: false,
    show: true,
    rotateWithPose: false,
    sphereCapRad: PI_OVER_TWO,
    sphereOpacity: 0.13,
  }),
  worldAxes: Object.freeze({
    show: true,
    lineWidthPx: 0.5,
  }),
  angleCues: Object.freeze({
    show: true,
    lineWidthPx: 1,
  }),
  cameraView: Object.freeze({
    imagePlane: Object.freeze({
      show: true,
      showOffset: true,
    }),
    axes: Object.freeze({
      show: true,
      lineWidthPx: 0.5,
    }),
    frustum: Object.freeze({
      show: true,
      lineWidthPx: 0.5,
    }),
    marker: Object.freeze({
      show: true,
    }),
  }),
  altitude: Object.freeze({
    show: true,
    showScaleBreak: true,
    lineWidthPx: 2,
  }),
  labels: Object.freeze({
    showAxes: true,
    showAngles: true,
    showImagePlane: true,
    fontSizePx: 11,
  }),
  cueColors: DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS,
}) satisfies Readonly<ResolvedViewStateVisualizerDisplayOptions>;

export const mergeViewStateVisualizerOverviewOptions = (
  ...overviews: Array<ViewStateVisualizerOverviewOptions | undefined>
): ResolvedViewStateVisualizerOverviewOptions => {
  const merged = overviews.reduce<ViewStateVisualizerOverviewOptions>(
    (accumulator, overview) => {
      if (!overview) {
        return accumulator;
      }

      return {
        ...accumulator,
        ...overview,
      };
    },
    {}
  );

  return {
    ...DEFAULT_VIEW_STATE_VISUALIZER_OVERVIEW_OPTIONS,
    ...merged,
  };
};

export const mergeViewStateVisualizerVisualizedOptions = (
  ...visualizedOptions: Array<
    | ViewStateVisualizerVisualizedOptions
    | ResolvedViewStateVisualizerVisualizedOptions
    | undefined
  >
): ResolvedViewStateVisualizerVisualizedOptions => {
  const merged = visualizedOptions.reduce<
    Partial<ResolvedViewStateVisualizerVisualizedOptions>
  >((accumulator, visualized) => {
    if (!visualized) {
      return accumulator;
    }

    return {
      ...accumulator,
      ...visualized,
    };
  }, {});

  return {
    maxPitch:
      typeof merged.maxPitch === "number" && Number.isFinite(merged.maxPitch)
        ? merged.maxPitch
        : DEFAULT_VIEW_STATE_VISUALIZER_VISUALIZED_OPTIONS.maxPitch,
    imagePlaneDistance:
      typeof merged.imagePlaneDistance === "number" &&
      Number.isFinite(merged.imagePlaneDistance)
        ? merged.imagePlaneDistance
        : DEFAULT_VIEW_STATE_VISUALIZER_VISUALIZED_OPTIONS.imagePlaneDistance,
  };
};

export const mergeViewStateVisualizerDisplayOptions = (
  ...displays: Array<ViewStateVisualizerDisplayOptions | undefined>
): ResolvedViewStateVisualizerDisplayOptions => {
  const merged = displays.reduce<ViewStateVisualizerDisplayOptions>(
    (accumulator, display) => {
      if (!display) {
        return accumulator;
      }

      return {
        surface: {
          ...(accumulator.surface ?? {}),
          ...(display.surface ?? {}),
        },
        worldAxes: {
          ...(accumulator.worldAxes ?? {}),
          ...(display.worldAxes ?? {}),
        },
        angleCues: {
          ...(accumulator.angleCues ?? {}),
          ...(display.angleCues ?? {}),
        },
        cameraView: {
          ...(accumulator.cameraView ?? {}),
          ...(display.cameraView ?? {}),
          imagePlane: {
            ...(accumulator.cameraView?.imagePlane ?? {}),
            ...(display.cameraView?.imagePlane ?? {}),
          },
          axes: {
            ...(accumulator.cameraView?.axes ?? {}),
            ...(display.cameraView?.axes ?? {}),
          },
          frustum: {
            ...(accumulator.cameraView?.frustum ?? {}),
            ...(display.cameraView?.frustum ?? {}),
          },
          marker: {
            ...(accumulator.cameraView?.marker ?? {}),
            ...(display.cameraView?.marker ?? {}),
          },
        },
        altitude: {
          ...(accumulator.altitude ?? {}),
          ...(display.altitude ?? {}),
        },
        labels: {
          ...(accumulator.labels ?? {}),
          ...(display.labels ?? {}),
        },
        cueColors: {
          ...(accumulator.cueColors ?? {}),
          ...(display.cueColors ?? {}),
        },
      };
    },
    {}
  );

  return {
    surface: {
      ...DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.surface,
      ...(merged.surface ?? {}),
    },
    worldAxes: {
      ...DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.worldAxes,
      ...(merged.worldAxes ?? {}),
    },
    angleCues: {
      ...DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.angleCues,
      ...(merged.angleCues ?? {}),
    },
    cameraView: {
      imagePlane: {
        ...DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.cameraView.imagePlane,
        ...(merged.cameraView?.imagePlane ?? {}),
      },
      axes: {
        ...DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.cameraView.axes,
        ...(merged.cameraView?.axes ?? {}),
      },
      frustum: {
        ...DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.cameraView.frustum,
        ...(merged.cameraView?.frustum ?? {}),
      },
      marker: {
        ...DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.cameraView.marker,
        ...(merged.cameraView?.marker ?? {}),
      },
    },
    altitude: {
      ...DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.altitude,
      ...(merged.altitude ?? {}),
    },
    labels: {
      ...DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.labels,
      ...(merged.labels ?? {}),
    },
    cueColors: {
      ...DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS.cueColors,
      ...(merged.cueColors ?? {}),
    },
  };
};

export const VIEW_STATE_VISUALIZER_GEOMETRY_DEFAULTS = Object.freeze({
  hemisphere: Object.freeze({
    radius: 1,
    widthSegments: 80,
    heightSegments: 48,
    minCapRad: 0.01,
  }),
  sampling: Object.freeze({
    circleSampleCount: 96,
    horizontalArcSampleCount: 64,
    pitchArcSampleCount: 56,
    discSegments: 96,
  }),
  overviewCamera: Object.freeze({
    rotationAroundUpRad: PI_OVER_SIX,
    orbitPhiRad: Math.acos(1.22 / Math.hypot(4.1, 1.22)),
    fovDeg: 38,
    near: 0.1,
    far: 100,
  }),
  frame: Object.freeze({
    cameraBoxSize: 1 / 6,
    padding: 0.25,
  }),
  axes: Object.freeze({
    axisLength: 0.5,
    labelUpOffset: 0.01,
    northLabelExtraLength: 0.05,
  }),
  arcs: Object.freeze({
    indicatorRadius: 0.15,
    outerRadius: 1,
    maxPitchRingDashSize: 0.08,
    maxPitchRingGapSize: 0.06,
  }),
  imagePlane: Object.freeze({
    distance: 0.42,
    basisLineLength: 0.24,
    originHalfExtent: 0.05,
    fallbackHalfHeight: 0.18,
    fallbackHalfWidth: 0.24,
    maxDistance: 1.5,
    labelOffsetFactor: 0.14,
  }),
  altitude: Object.freeze({
    zeroElevationDiscRadius: 0.25,
    overflowGapHalfHeight: 0.16,
    scaleBreakHalfHeight: 0.032,
    scaleBreakHalfWidth: 0.024,
    rangeLabelFallbackUpFactor: 0.35,
  }),
  numeric: Object.freeze({
    minRenderLineWidthPx: 0.1,
    epsilon: 1e-6,
  }),
  interaction: Object.freeze({
    minOrbitPhi: 0.15,
    maxOrbitPhiFactorOfPi: 0.48,
  }),
});

export const VIEW_STATE_VISUALIZER_MATERIAL_DEFAULTS = Object.freeze({
  scene: Object.freeze({
    ambientLight: Object.freeze({ color: 0xffffff, intensity: 0.45 }),
    hemisphereLight: Object.freeze({
      skyColor: 0xe0f2fe,
      groundColor: 0xcbd5e1,
      intensity: 0.72,
    }),
    directionalLight: Object.freeze({
      color: 0xffffff,
      intensity: 1.34,
      position: Object.freeze({ x: 2.6, y: 3.1, z: 1.7 }),
    }),
  }),
  surface: Object.freeze({
    hemisphere: Object.freeze({
      color: 0xf1f5f9,
      roughness: 0.12,
      metalness: 0.01,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      emissive: 0xe0f2fe,
      emissiveIntensity: 0.025,
    }),
    altitudeDisc: Object.freeze({
      color: 0x94a3b8,
      opacity: 0.12,
    }),
    altitudeOutline: Object.freeze({
      color: 0x94a3b8,
      opacity: 0.72,
    }),
    maxPitchRing: Object.freeze({
      color: COLORS_HEX.AXIS_EAST,
      opacity: 0.95,
    }),
  }),
  camera: Object.freeze({
    fillColor: 0x94a3b8,
    edgeColor: 0x64748b,
    emissiveColor: 0x334155,
    rangeOpacity: 0.76,
    markerOpacity: 0.56,
    markerEmissiveIntensity: 0.05,
  }),
  altitude: Object.freeze({
    lineColor: 0x94a3b8,
    lineOpacity: 0.96,
    breakOpacity: 0.98,
  }),
  arcs: Object.freeze({
    bearingOpacity: 0.88,
    pitchOpacity: 0.9,
  }),
  axes: Object.freeze({
    opacity: 0.95,
  }),
  imagePlane: Object.freeze({
    neutralColor: 0x0f172a,
    forwardOpacity: 0.62,
    originOpacity: 0.95,
    rightColor: 0x7c3aed,
    rightOpacity: 0.95,
    upColor: 0x15803d,
    upOpacity: 0.95,
    surfaceOpacity: 0.14,
    offsetSurfaceOpacity: 0.28,
  }),
  frustum: Object.freeze({
    color: 0x475569,
    opacity: 0.64,
  }),
});

export const VIEW_STATE_VISUALIZER_DEFAULTS = Object.freeze({
  size: Object.freeze({
    widthPx: 176,
    heightPx: 176,
  }) satisfies ViewStateVisualizerSize,
  geometry: VIEW_STATE_VISUALIZER_GEOMETRY_DEFAULTS,
  materials: VIEW_STATE_VISUALIZER_MATERIAL_DEFAULTS,
  display: DEFAULT_VIEW_STATE_VISUALIZER_DISPLAY_OPTIONS,
  overviewCamera: VIEW_STATE_VISUALIZER_GEOMETRY_DEFAULTS.overviewCamera,
});
