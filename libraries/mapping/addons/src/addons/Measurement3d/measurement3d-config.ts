import type { CssPixels, Milliseconds, Ratio } from "@carma-units";
import { REFERENCE_OBJECT_SCALING_MODES } from "@carma-commons/math";
import type { AnnotationAreaPaletteOptions } from "@carma-mapping/annotations/core";
import type { AnnotationToolBehaviorOptions } from "@carma-mapping/annotations/builtin-tools";
import type { MapLibreMeasurementStyleOptions } from "@carma-mapping/annotations/maplibre";
import type {
  AnnotationLineStyleOptions,
  AnnotationReferenceObjectSizingOptions,
  AreaOcclusionStyleOptions,
} from "@carma-mapping/annotations/runtime";

export type Measurement3dConfig = {
  /** Persistence key of the measurements; share it with a Cesium host to keep one set. */
  storageKey?: string;
  /** Control-column placement of the on/off button. */
  position?: "topleft" | "topright" | "bottomleft" | "bottomright";
  order?: number;
  /** The tool settings; every part is optional and combines with the others. */
  style?: {
    lines?: AnnotationLineStyleOptions;
    areaOcclusion?: AreaOcclusionStyleOptions;
    /** Colours and alphas of the area fills per area type. */
    area?: AnnotationAreaPaletteOptions;
    /** The pattern of the area fills and the ruler of the lines in the scene. */
    scene?: MapLibreMeasurementStyleOptions;
  };
  referenceObjectSizing?: Partial<AnnotationReferenceObjectSizingOptions>;
  /** Refinements of the tools; replaces MEASUREMENT3D_DEFAULTS.toolBehavior as a whole. */
  toolBehavior?: AnnotationToolBehaviorOptions;
  infoBox?: {
    pixelWidth?: number;
    controlOrder?: number;
  };
};

export const MEASUREMENT3D_DEFAULTS = Object.freeze({
  storageKey: "carma::measurement3d::annotations",
  infoBox: { pixelWidth: 350, controlOrder: 12 },
  /**
   * The point query disc keeps a world size while the pointer moves, so near
   * and far show in perspective. After moveend its 1/2/5 outer radius is
   * picked for the viewport-centre ground. Only usability limits trigger
   * decade jumps under a static camera. Three query and edit gizmos share this sizing policy; legacy engines retain their existing sizing.
   */
  referenceObjectSizing: {
    scalingMode: REFERENCE_OBJECT_SCALING_MODES.WORLD,
    worldRadiusMeters: 3,
    targetScreenRadiusCssPx: 48,
    resizeWorldRadiusToScreenTarget: true,
    resizeStepFactor: 2,
    quantizeWorldRadius: true,
    discSizing: {
      targetScreenRadiusCssPx: 64 as CssPixels,
      minimumScreenRadiusCssPx: 10 as CssPixels,
      maximumViewportRadiusRatio: 0.5 as Ratio,
      sceneResizeFactor: 10 as Ratio,
      resizeHysteresisRatio: 0.15 as Ratio,
      radiusLabelVisibleDurationMs: 3000 as Milliseconds,
      radiusLabelFadeDurationMs: 250 as Milliseconds,
      resizeAnimationDurationMs: 200 as Milliseconds,
      centerCircleDiameterCssPx: 6 as CssPixels,
      crosshairHalo: true,
    },
  } satisfies AnnotationReferenceObjectSizingOptions,
  /**
   * The refinements of the tools that the Cesium measurement does not have:
   * per-type node edit rules, area values as pills outside their area and
   * the polyline total as a badge at the screen-left end.
   */
  toolBehavior: {
    nodeEditRules: true,
    areaLabelPills: true,
    polylineEndBadge: true,
  } satisfies AnnotationToolBehaviorOptions,
  /**
   * The geoportal Cesium measurement style, except that area fills stay in
   * the scene: the MapLibre engine draws the part behind a surface itself,
   * so no DOM overlay fill doubles it. Occluded area edges are dashed.
   * Distance and polyline stay quiet until selected: meter markers and
   * measure components (legs, segment labels) show only then.
   */
  style: {
    lines: {
      strokeWidthPx: 1.5,
      overlayDashPattern: "8 8",
      meterMarkers: "selected",
      components: "selected",
    },
    areaOcclusion: {
      fill: { overlay: false },
      line: { overlayDashed: true },
    },
  } satisfies {
    lines: AnnotationLineStyleOptions;
    areaOcclusion: AreaOcclusionStyleOptions;
  },
});
