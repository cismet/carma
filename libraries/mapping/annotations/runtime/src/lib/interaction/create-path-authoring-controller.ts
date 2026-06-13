import {
  cartesian3FromGeographicCoordinate,
  isValidScene,
} from "@carma-mapping/engines/cesium/core";

import type { CesiumGeographicCoordinate } from "../store";
import {
  SceneTransforms,
  defined,
  type Cartesian3,
  type Scene,
} from "@carma-cesium";
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
  createPreviewOverlayLayer,
  destroyLineCollection,
  destroyPreviewOverlayLayer,
  hidePointMarkers,
  placePointMarkers,
  annotationOverlayDefaults,
} from "./authoring-visual-runtime";
import { areCoordinateListsEqual } from "../utils/coordinate-equality";

export type PathAuthoringControllerState = {
  lineCoordinates: readonly CesiumGeographicCoordinate[];
  markerCoordinates: readonly CesiumGeographicCoordinate[];
};

export type PathAuthoringLineOptions = Partial<
  Pick<
    RuntimeEdgeRenderModel,
    "overlayDashed" | "overlayDashPattern" | "strokeWidth"
  >
>;

export type PathAuthoringController = {
  setState: (state: PathAuthoringControllerState) => void;
  clear: () => void;
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
  scene,
  overlayPathLine,
  linePositions,
}: {
  scene: Scene;
  overlayPathLine: PreviewOverlayPathLine | null;
  linePositions: readonly Cartesian3[];
}) => {
  if (!overlayPathLine || linePositions.length < 2) {
    hidePreviewOverlayPathLine(overlayPathLine);
    return;
  }

  const points = linePositions
    .map((position) =>
      SceneTransforms.worldToWindowCoordinates(scene, position)
    )
    .filter((screenPosition) => defined(screenPosition));

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
  scene: Scene,
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
  const overlayLayer = createPreviewOverlayLayer(scene, overlayLayerId);
  if (!overlayLayer) {
    return {
      setState: () => undefined,
      clear: () => undefined,
      destroy: () => undefined,
    };
  }

  const lineCollection = createLineCollection(scene);
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
  let linePositions: readonly Cartesian3[] = [];

  const hide = () => {
    clearLineRuntime(pathLine);
    hidePreviewOverlayPathLine(overlayPathLine);
    hidePointMarkers(pointMarkers);
  };

  const render = (requestRender = true) => {
    if (!isValidScene(scene)) {
      return;
    }

    if (linePositions.length >= 2) {
      applyLineRuntime(pathLine, linePositions);
    } else {
      clearLineRuntime(pathLine);
    }
    applyPreviewOverlayPathLine({
      scene,
      overlayPathLine,
      linePositions,
    });

    if (showPointMarkers && currentState.markerCoordinates.length > 0) {
      placePointMarkers({
        scene,
        overlayLayer,
        pointMarkers,
        coordinates: currentState.markerCoordinates,
        style: pointMarkerStyle,
      });
    } else {
      hidePointMarkers(pointMarkers);
    }

    if (requestRender) {
      scene.requestRender();
    }
  };

  const removePostRenderListener = scene.postRender.addEventListener(() => {
    render(false);
  });

  return {
    setState: (nextState) => {
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
      linePositions = currentState.lineCoordinates.map(
        cartesian3FromGeographicCoordinate
      );
      render();
    },
    clear: () => {
      currentState = EMPTY_PATH_AUTHORING_STATE;
      linePositions = [];
      hide();
      scene.requestRender();
    },
    destroy: () => {
      removePostRenderListener();
      hide();
      destroyLineCollection(scene, lineCollection);
      destroyPreviewOverlayLayer(overlayLayer);
      if (!scene.isDestroyed()) {
        scene.requestRender();
      }
    },
  };
};
