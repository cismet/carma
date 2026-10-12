import {
  createElement,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

import {
  getEquilateralTriangleHeight,
  getEquilateralTrianglePathD,
  getEquilateralTriangleViewBox,
} from "@carma-commons/math";
import {
  ARROW_LAYER_Z_INDEX,
  AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX,
  AXIS_LINE_LAYER_Z_INDEX,
  CENTER_DRAG_HIT_AREA_PX,
  CENTER_HIT_LAYER_Z_INDEX,
  DISC_LAYER_Z_INDEX,
  DISC_OUTLINE_BASE_OPACITY,
  DISC_OUTLINE_COLOR,
  DISC_SVG_EXTENT,
  DISC_SVG_HALF_EXTENT,
  PLANE_DRAG_DISC_CURSOR,
  ROTATION_HANDLE_RADIUS_PX,
  SECONDARY_AXIS_COLOR,
} from "@carma-mapping/gizmo/core";

import type {
  AnnotationGizmoAxisCandidate,
  AnnotationGizmoLabels,
} from "@carma-mapping/annotations/core";
import {
  ARROW_OUTLINE_STROKE,
  ARROW_TIP_DOT_FILL,
  ARROW_TIP_DOT_RADIUS_PX,
  CONE_ARROW_RIM_STROKE_OPACITY,
} from "./engine-point-move-gizmo-constants";

export type PointMoveGizmoOverlayContentProps = {
  axisCandidates: AnnotationGizmoAxisCandidate[];
  labels: AnnotationGizmoLabels;
  axisUiLengthPx: number;
  axisArrowOffsetPx: number;
  axisWidthPx: number;
  arrowActiveEdgePx: number;
  showAxes: boolean;
  showRotationHandle: boolean;
  snapPlaneDragToGround: boolean;
  centerPlaneDragCursor: string;
  onAxisMouseDown: (
    event: ReactMouseEvent<HTMLDivElement>,
    axisCandidate: AnnotationGizmoAxisCandidate
  ) => void;
  onDiscPlaneMouseDown: (event: ReactMouseEvent<SVGPathElement>) => void;
  onRotationHandleMouseDown: (event: ReactMouseEvent<SVGCircleElement>) => void;
  onCenterMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onWheel: (event: ReactWheelEvent) => void;
};

/** One move arrow; the overlay layout rotates it and swaps in the cone silhouette. */
const createAxisArrow = (
  side: "up" | "down",
  axisCandidate: AnnotationGizmoAxisCandidate,
  {
    labels,
    arrowActiveEdgePx,
    onAxisMouseDown,
    onWheel,
  }: PointMoveGizmoOverlayContentProps
) =>
  createElement(
    "svg",
    {
      key: `${axisCandidate.id}-arrow-${side}`,
      [`data-point-move-axis-arrow-${side}`]: axisCandidate.id,
      onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) =>
        onAxisMouseDown(event, axisCandidate),
      onWheel,
      viewBox: getEquilateralTriangleViewBox(arrowActiveEdgePx),
      style: {
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -100%)",
        transformOrigin: "50% 100%",
        width: `${arrowActiveEdgePx}px`,
        height: `${getEquilateralTriangleHeight(arrowActiveEdgePx)}px`,
        display: "block",
        color: axisCandidate.color ?? SECONDARY_AXIS_COLOR,
        zIndex: ARROW_LAYER_Z_INDEX,
        pointerEvents: "auto",
        cursor: "move",
        userSelect: "none",
        overflow: "visible",
      },
      title: axisCandidate.title ?? labels.genericAxis,
    },
    createElement("path", {
      "data-point-move-axis-arrow-outline": "true",
      d: getEquilateralTrianglePathD(arrowActiveEdgePx),
      fill: "currentColor",
      stroke: ARROW_OUTLINE_STROKE,
      strokeWidth: `${AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX}`,
      strokeLinejoin: "round",
      strokeLinecap: "round",
      paintOrder: "stroke",
      vectorEffect: "non-scaling-stroke",
      shapeRendering: "geometricPrecision",
    }),
    createElement("path", {
      "data-point-move-axis-arrow-rim": "true",
      d: "",
      fill: "none",
      stroke: ARROW_OUTLINE_STROKE,
      strokeOpacity: CONE_ARROW_RIM_STROKE_OPACITY,
      strokeWidth: `${AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX}`,
      strokeLinejoin: "round",
      vectorEffect: "non-scaling-stroke",
      shapeRendering: "geometricPrecision",
      style: { display: "none" },
    }),
    createElement("circle", {
      "data-point-move-axis-arrow-tip": "true",
      cx: arrowActiveEdgePx / 2,
      cy: 0,
      r: ARROW_TIP_DOT_RADIUS_PX,
      fill: ARROW_TIP_DOT_FILL,
    })
  );

/** The overlay markup; `layoutPointMoveGizmoOverlay` positions it every frame. */
export const createPointMoveGizmoOverlayContent = (
  props: PointMoveGizmoOverlayContentProps
) => {
  const {
    axisCandidates,
    labels,
    axisUiLengthPx,
    axisArrowOffsetPx,
    axisWidthPx,
    showAxes,
    showRotationHandle,
    snapPlaneDragToGround,
    centerPlaneDragCursor,
    onDiscPlaneMouseDown,
    onRotationHandleMouseDown,
    onCenterMouseDown,
    onWheel,
  } = props;
  return createElement(
    "div",
    {
      style: {
        position: "relative",
        width: `${axisUiLengthPx}px`,
        height: `${axisUiLengthPx}px`,
        pointerEvents: "none",
        userSelect: "none",
        overflow: "visible",
      },
    },
    // Arrows and axis line only where the node may move along an axis.
    ...(showAxes ? axisCandidates : []).flatMap((axisCandidate) => [
      createElement("div", {
        key: `${axisCandidate.id}-line`,
        "data-point-move-axis-line": axisCandidate.id,
        style: {
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: `${axisArrowOffsetPx * 2}px`,
          height: `${axisWidthPx}px`,
          background: "rgba(255,255,255,0.82)",
          opacity: 1,
          zIndex: AXIS_LINE_LAYER_Z_INDEX,
          pointerEvents: "none",
        },
      }),
      createAxisArrow("up", axisCandidate, props),
      createAxisArrow("down", axisCandidate, props),
    ]),
    createElement(
      "svg",
      {
        key: "disc-outline-svg",
        "data-point-move-disc-outline-svg": "true",
        viewBox: `${-DISC_SVG_HALF_EXTENT} ${-DISC_SVG_HALF_EXTENT} ${DISC_SVG_EXTENT} ${DISC_SVG_EXTENT}`,
        width: `${DISC_SVG_EXTENT}`,
        height: `${DISC_SVG_EXTENT}`,
        style: {
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: `${DISC_SVG_EXTENT}px`,
          height: `${DISC_SVG_EXTENT}px`,
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: DISC_LAYER_Z_INDEX,
        },
      },
      ...axisCandidates.map((axisCandidate) =>
        createElement("path", {
          key: `disc-outline-path-${axisCandidate.id}`,
          "data-point-move-disc-outline-path": axisCandidate.id,
          d: "",
          fill: "none",
          stroke: DISC_OUTLINE_COLOR,
          strokeWidth: `${AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX}`,
          strokeLinejoin: "round",
          strokeLinecap: "round",
          vectorEffect: "non-scaling-stroke",
          shapeRendering: "geometricPrecision",
          style: {
            opacity: DISC_OUTLINE_BASE_OPACITY,
            display: "none",
            pointerEvents: "none",
          },
        })
      ),
      createElement(
        "path",
        {
          key: "disc-interaction-path",
          "data-point-move-disc-interaction-path": "true",
          d: "",
          onMouseDown: onDiscPlaneMouseDown,
          onWheel,
          fill: "rgba(255,255,255,0.001)",
          stroke: "none",
          style: {
            display: "none",
            pointerEvents: "auto",
            cursor: PLANE_DRAG_DISC_CURSOR,
          },
        },
        createElement("title", null, labels.outerDisc)
      ),
      ...(showRotationHandle
        ? [
            createElement("ellipse", {
              key: "disc-rotation-handle",
              "data-point-move-disc-rotation-handle": "true",
              cx: "0",
              cy: "0",
              rx: `${ROTATION_HANDLE_RADIUS_PX}`,
              ry: `${ROTATION_HANDLE_RADIUS_PX}`,
              onMouseDown: onRotationHandleMouseDown,
              onWheel,
              fill: DISC_OUTLINE_COLOR,
              stroke: DISC_OUTLINE_COLOR,
              strokeWidth: `${AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX}`,
              vectorEffect: "non-scaling-stroke",
              style: {
                display: "none",
                pointerEvents: "auto",
                cursor: "grab",
              },
            }),
          ]
        : [])
    ),
    createElement("div", {
      "data-point-move-axis-center-hit": "true",
      onMouseDown: onCenterMouseDown,
      onWheel,
      style: {
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: `${CENTER_DRAG_HIT_AREA_PX}px`,
        height: `${CENTER_DRAG_HIT_AREA_PX}px`,
        borderRadius: "50%",
        background: "transparent",
        zIndex: CENTER_HIT_LAYER_Z_INDEX,
        pointerEvents: "auto",
        cursor: centerPlaneDragCursor,
        userSelect: "none",
      },
      title: snapPlaneDragToGround ? labels.surfacePlane : labels.freePlane,
    })
  );
};
