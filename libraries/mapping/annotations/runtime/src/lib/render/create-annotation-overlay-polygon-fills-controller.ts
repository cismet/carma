import { ecefFromGeographicCoordinate } from "@carma-mapping/annotations/core";

import {
  isValidAnnotationEngine,
  type AnnotationEngine,
  type AnnotationScreenPosition,
} from "../engine";
import { ANNOTATION_OVERLAY_GROUP } from "../interaction/annotation-overlay-mount";
import {
  createAnnotationOverlayLayer,
  destroyAnnotationOverlayLayer,
} from "../interaction/authoring-visual-runtime";
import { areCoordinateListsEqual } from "../utils/coordinate-equality";
import {
  RUNTIME_POLYGON_FILL_PLACEMENT,
  type RuntimePolygonFillRenderModel,
} from "./annotation-render-models";

export type AnnotationOverlayPolygonFillsController = {
  setPolygonFills: (
    polygonFills: readonly RuntimePolygonFillRenderModel[],
    requestRender?: boolean
  ) => void;
  clear: (requestRender?: boolean) => void;
  destroy: () => void;
};

type OverlayPolygonFillRenderModel = RuntimePolygonFillRenderModel & {
  overlayFill: string;
  placement: (typeof RUNTIME_POLYGON_FILL_PLACEMENT)[keyof typeof RUNTIME_POLYGON_FILL_PLACEMENT];
};

const normalizeOverlayPolygonFills = (
  polygonFills: readonly RuntimePolygonFillRenderModel[]
): readonly OverlayPolygonFillRenderModel[] =>
  polygonFills.flatMap((polygonFill) => {
    const placement =
      polygonFill.placement ?? RUNTIME_POLYGON_FILL_PLACEMENT.COPLANAR;
    if (
      placement !== RUNTIME_POLYGON_FILL_PLACEMENT.COPLANAR ||
      !polygonFill.overlayFill ||
      polygonFill.coordinates.length < 3
    ) {
      return [];
    }

    return [
      {
        ...polygonFill,
        overlayFill: polygonFill.overlayFill,
        placement,
      },
    ];
  });

const areOverlayPolygonFillsEqual = (
  left: readonly OverlayPolygonFillRenderModel[],
  right: readonly OverlayPolygonFillRenderModel[]
) =>
  left.length === right.length &&
  left.every((polygonFill, index) => {
    const otherPolygonFill = right[index];

    return (
      otherPolygonFill !== undefined &&
      polygonFill.id === otherPolygonFill.id &&
      polygonFill.annotationId === otherPolygonFill.annotationId &&
      polygonFill.overlayFill === otherPolygonFill.overlayFill &&
      polygonFill.selected === otherPolygonFill.selected &&
      areCoordinateListsEqual(
        polygonFill.coordinates,
        otherPolygonFill.coordinates
      )
    );
  });

const createOverlayPolygonElement = () => {
  const polygon = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polygon"
  );
  polygon.style.pointerEvents = "none";
  return polygon;
};

export const createAnnotationOverlayPolygonFillsController = (
  engine: AnnotationEngine | null,
  surfaceKey: string
): AnnotationOverlayPolygonFillsController => {
  if (!isValidAnnotationEngine(engine)) {
    return {
      setPolygonFills: () => undefined,
      clear: () => undefined,
      destroy: () => undefined,
    };
  }

  const overlayLayer = createAnnotationOverlayLayer(
    engine,
    `annotation-overlay-runtime-polygon-fill-layer-${surfaceKey}`,
    ANNOTATION_OVERLAY_GROUP.VISUALIZER
  );
  if (!overlayLayer) {
    return {
      setPolygonFills: () => undefined,
      clear: () => undefined,
      destroy: () => undefined,
    };
  }

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.style.position = "absolute";
  svg.style.inset = "0";
  svg.style.overflow = "visible";
  svg.style.pointerEvents = "none";
  overlayLayer.appendChild(svg);

  let currentPolygonFills: readonly OverlayPolygonFillRenderModel[] = [];
  let polygonById = new Map<string, SVGPolygonElement>();

  const clearPolygons = () => {
    polygonById.forEach((polygon) => polygon.remove());
    polygonById = new Map();
  };

  const render = () => {
    if (engine.isDestroyed()) {
      return;
    }

    currentPolygonFills.forEach((polygonFill) => {
      let polygon = polygonById.get(polygonFill.id);
      if (!polygon) {
        polygon = createOverlayPolygonElement();
        polygonById.set(polygonFill.id, polygon);
        svg.appendChild(polygon);
      }

      polygon.setAttribute("fill", polygonFill.overlayFill);
      const points = polygonFill.coordinates
        .map((coordinate) =>
          engine.worldToScreen(ecefFromGeographicCoordinate(coordinate))
        )
        .filter(
          (screenPosition): screenPosition is AnnotationScreenPosition =>
            screenPosition !== null
        );

      if (points.length !== polygonFill.coordinates.length) {
        polygon.style.display = "none";
        return;
      }

      polygon.setAttribute(
        "points",
        points.map((point) => `${point.x},${point.y}`).join(" ")
      );
      polygon.style.display = "block";
    });
  };

  const removePostRenderListener = engine.subscribePostRender(() => {
    render();
  });

  return {
    setPolygonFills: (polygonFills, requestRender = true) => {
      const normalizedPolygonFills = normalizeOverlayPolygonFills(polygonFills);
      if (
        areOverlayPolygonFillsEqual(currentPolygonFills, normalizedPolygonFills)
      ) {
        return;
      }

      currentPolygonFills = normalizedPolygonFills;
      const nextIds = new Set(
        currentPolygonFills.map((polygonFill) => polygonFill.id)
      );
      polygonById.forEach((polygon, id) => {
        if (nextIds.has(id)) {
          return;
        }

        polygon.remove();
        polygonById.delete(id);
      });
      render();
      if (requestRender) {
        engine.requestRender();
      }
    },
    clear: (requestRender = true) => {
      if (currentPolygonFills.length === 0) {
        return;
      }

      currentPolygonFills = [];
      clearPolygons();
      if (requestRender) {
        engine.requestRender();
      }
    },
    destroy: () => {
      currentPolygonFills = [];
      removePostRenderListener();
      clearPolygons();
      destroyAnnotationOverlayLayer(overlayLayer);
      if (!engine.isDestroyed()) {
        engine.requestRender();
      }
    },
  };
};
