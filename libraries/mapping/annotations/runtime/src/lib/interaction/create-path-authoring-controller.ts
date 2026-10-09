import type { Vector3 } from "three";
import {
  ecefFromGeographicCoordinate,
  type AnnotationGeographicCoordinate,
} from "@carma-mapping/annotations/core";

import {
  isValidAnnotationEngine,
  type AnnotationEngine,
  type AnnotationScreenPosition,
} from "../engine";
import type { RuntimeEdgeRenderModel } from "../render/annotation-render-models";
import {
  annotationVisualDefaults,
  type PointMarkerVisualStyle,
} from "../config/annotation-visual-defaults";
import {
  applyLineRuntime,
  clearLineRuntime,
  createLineCollection,
  createLineRuntime,
  createAnnotationOverlayLayer,
  destroyAnnotationOverlayLayer,
  hidePointMarkers,
  placePointMarkers,
  annotationOverlayDefaults,
} from "./authoring-visual-runtime";
import { areCoordinateListsEqual } from "../utils/coordinate-equality";

export type PathAuthoringControllerState = {
  lineCoordinates: readonly AnnotationGeographicCoordinate[];
  markerCoordinates: readonly AnnotationGeographicCoordinate[];
};

export type PathAuthoringLineOptions = Partial<
  Pick<
    RuntimeEdgeRenderModel,
    "overlayDashed" | "overlayDashPattern" | "strokeWidth"
  >
>;

export type PathAuthoringController = {
  setState: (
    state: PathAuthoringControllerState,
    requestRender?: boolean
  ) => void;
  clear: (requestRender?: boolean) => void;
  destroy: () => void;
};

const EMPTY_PATH_AUTHORING_STATE: PathAuthoringControllerState = {
  lineCoordinates: [],
  markerCoordinates: [],
};
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

type PreviewOverlayPathLine = {
  root: SVGSVGElement;
  polyline: SVGPolylineElement;
};

const createPreviewOverlayPathLine = (
  lineColor: string,
  lineOptions?: PathAuthoringLineOptions
): PreviewOverlayPathLine => {
  const root = document.createElementNS(SVG_NAMESPACE, "svg");
  root.setAttribute("width", "100%");
  root.setAttribute("height", "100%");
  root.style.position = "absolute";
  root.style.inset = "0";
  root.style.overflow = "visible";
  root.style.pointerEvents = "none";

  const polyline = document.createElementNS(SVG_NAMESPACE, "polyline");
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", lineColor);
  polyline.setAttribute(
    "stroke-width",
    `${lineOptions?.strokeWidth ?? annotationOverlayDefaults.lineStrokeWidthPx}`
  );
  polyline.setAttribute("stroke-linecap", "round");
  polyline.setAttribute("stroke-linejoin", "round");
  polyline.setAttribute(
    "stroke-dasharray",
    lineOptions?.overlayDashPattern ??
      annotationVisualDefaults.patterns.edgeDashPattern
  );
  polyline.style.display = "none";
  root.appendChild(polyline);

  return {
    root,
    polyline,
  };
};

const hidePreviewOverlayPathLine = (
  overlayPathLine: PreviewOverlayPathLine | null
) => {
  if (!overlayPathLine) {
    return;
  }

  overlayPathLine.polyline.style.display = "none";
};

const applyPreviewOverlayPathLine = ({
  engine,
  overlayPathLine,
  linePositions,
}: {
  engine: AnnotationEngine;
  overlayPathLine: PreviewOverlayPathLine | null;
  linePositions: readonly Vector3[];
}) => {
  if (!overlayPathLine || linePositions.length < 2) {
    hidePreviewOverlayPathLine(overlayPathLine);
    return;
  }

  const points = linePositions
    .map((position) => engine.worldToScreen(position))
    .filter(
      (screenPosition): screenPosition is AnnotationScreenPosition =>
        screenPosition !== null
    );

  if (points.length !== linePositions.length) {
    hidePreviewOverlayPathLine(overlayPathLine);
    return;
  }

  overlayPathLine.polyline.setAttribute(
    "points",
    points.map((point) => `${point.x},${point.y}`).join(" ")
  );
  overlayPathLine.polyline.style.display = "block";
};

export const createPathAuthoringController = (
  engine: AnnotationEngine,
  {
    overlayLayerId,
    lineId,
    lineColor,
    showPointMarkers = true,
    lineOptions,
    pointMarkerStyle,
  }: {
    overlayLayerId: string;
    lineId: string;
    lineColor: string;
    showPointMarkers?: boolean;
    lineOptions?: PathAuthoringLineOptions;
    pointMarkerStyle?: PointMarkerVisualStyle;
  }
): PathAuthoringController => {
  const overlayLayer = createAnnotationOverlayLayer(engine, overlayLayerId);
  if (!overlayLayer) {
    return {
      setState: () => undefined,
      clear: () => undefined,
      destroy: () => undefined,
    };
  }

  const lineCollection = createLineCollection(engine);
  const pathLine = createLineRuntime(lineCollection, lineId, lineColor, {
    width: lineOptions?.strokeWidth,
  });
  const overlayPathLine = lineOptions?.overlayDashed
    ? createPreviewOverlayPathLine(lineColor, lineOptions)
    : null;
  if (overlayPathLine) {
    overlayLayer.appendChild(overlayPathLine.root);
  }
  const pointMarkers: HTMLDivElement[] = [];
  let currentState = EMPTY_PATH_AUTHORING_STATE;
  let linePositions: readonly Vector3[] = [];

  const hide = () => {
    clearLineRuntime(pathLine);
    hidePreviewOverlayPathLine(overlayPathLine);
    hidePointMarkers(pointMarkers);
  };

  const render = (requestRender = true) => {
    if (!isValidAnnotationEngine(engine)) {
      return;
    }

    if (linePositions.length >= 2) {
      applyLineRuntime(pathLine, linePositions);
    } else {
      clearLineRuntime(pathLine);
    }
    applyPreviewOverlayPathLine({
      engine,
      overlayPathLine,
      linePositions,
    });

    if (showPointMarkers && currentState.markerCoordinates.length > 0) {
      placePointMarkers({
        engine,
        overlayLayer,
        pointMarkers,
        coordinates: currentState.markerCoordinates,
        style: pointMarkerStyle,
      });
    } else {
      hidePointMarkers(pointMarkers);
    }

    if (requestRender) {
      engine.requestRender();
    }
  };

  const removePostRenderListener = engine.subscribePostRender(() => {
    render(false);
  });

  return {
    setState: (nextState, requestRender = true) => {
      if (
        areCoordinateListsEqual(
          currentState.lineCoordinates,
          nextState.lineCoordinates
        ) &&
        areCoordinateListsEqual(
          currentState.markerCoordinates,
          nextState.markerCoordinates
        )
      ) {
        return;
      }

      currentState = {
        lineCoordinates: [...nextState.lineCoordinates],
        markerCoordinates: [...nextState.markerCoordinates],
      };
      linePositions = currentState.lineCoordinates.map((coordinate) =>
        ecefFromGeographicCoordinate(coordinate)
      );
      render(requestRender);
    },
    clear: (requestRender = true) => {
      currentState = EMPTY_PATH_AUTHORING_STATE;
      linePositions = [];
      hide();
      if (requestRender) {
        engine.requestRender();
      }
    },
    destroy: () => {
      removePostRenderListener();
      hide();
      lineCollection.destroy();
      destroyAnnotationOverlayLayer(overlayLayer);
      if (!engine.isDestroyed()) {
        engine.requestRender();
      }
    },
  };
};
