import { ecefFromGeographicCoordinate } from "@carma-mapping/annotations/core";

import {
  ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT,
  isValidAnnotationEngine,
  type AnnotationEngine,
  type AnnotationScenePolygonFill,
  type AnnotationScenePolygonFillPlacement,
  type AnnotationScenePolygonFillsHandle,
} from "../engine";
import { areCoordinateListsEqual } from "../utils/coordinate-equality";
import {
  RUNTIME_POLYGON_FILL_PLACEMENT,
  type RuntimePolygonFillPlacement,
  type RuntimePolygonFillRenderModel,
} from "./annotation-render-models";

export type AnnotationPolygonFillsController = {
  setPolygonFills: (
    polygonFills: readonly RuntimePolygonFillRenderModel[],
    requestRender?: boolean
  ) => void;
  clear: (requestRender?: boolean) => void;
  destroy: () => void;
};

export type AnnotationPolygonFillsControllerOptions = {
  allowPicking?: boolean;
};

const SCENE_PLACEMENT_BY_RUNTIME_PLACEMENT: Record<
  RuntimePolygonFillPlacement,
  AnnotationScenePolygonFillPlacement
> = {
  [RUNTIME_POLYGON_FILL_PLACEMENT.GROUND]:
    ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT.GROUND,
  [RUNTIME_POLYGON_FILL_PLACEMENT.COPLANAR]:
    ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT.COPLANAR,
};

const normalizePolygonFills = (
  polygonFills: readonly RuntimePolygonFillRenderModel[]
) =>
  polygonFills.map((polygonFill) => ({
    ...polygonFill,
    placement: polygonFill.placement ?? RUNTIME_POLYGON_FILL_PLACEMENT.COPLANAR,
  }));

const arePolygonFillsEqual = (
  left: readonly RuntimePolygonFillRenderModel[],
  right: readonly RuntimePolygonFillRenderModel[]
) =>
  left.length === right.length &&
  left.every((polygonFill, index) => {
    const otherPolygonFill = right[index];

    return (
      otherPolygonFill !== undefined &&
      polygonFill.id === otherPolygonFill.id &&
      polygonFill.annotationId === otherPolygonFill.annotationId &&
      polygonFill.fill === otherPolygonFill.fill &&
      polygonFill.placement === otherPolygonFill.placement &&
      polygonFill.selected === otherPolygonFill.selected &&
      areCoordinateListsEqual(
        polygonFill.coordinates,
        otherPolygonFill.coordinates
      )
    );
  });

const toScenePolygonFills = (
  normalizedPolygonFills: ReturnType<typeof normalizePolygonFills>
): AnnotationScenePolygonFill[] =>
  normalizedPolygonFills.flatMap((polygonFill) => {
    if (polygonFill.coordinates.length < 3) {
      return [];
    }

    return [
      {
        id: polygonFill.id,
        positionsECEF: polygonFill.coordinates.map((coordinate) =>
          ecefFromGeographicCoordinate(coordinate)
        ),
        fill: polygonFill.fill,
        placement: SCENE_PLACEMENT_BY_RUNTIME_PLACEMENT[polygonFill.placement],
        ...(polygonFill.selected !== undefined
          ? { selected: polygonFill.selected }
          : {}),
      },
    ];
  });

export const createAnnotationPolygonFillsController = (
  engine: AnnotationEngine | null,
  options: AnnotationPolygonFillsControllerOptions = {}
): AnnotationPolygonFillsController => {
  if (!isValidAnnotationEngine(engine)) {
    return {
      setPolygonFills: () => undefined,
      clear: () => undefined,
      destroy: () => undefined,
    };
  }

  let currentPolygonFills: readonly RuntimePolygonFillRenderModel[] = [];
  const allowPicking = options.allowPicking ?? true;
  const polygonFillsHandle: AnnotationScenePolygonFillsHandle =
    engine.createPolygonFills({ allowPicking });

  const clearRenderedPolygonFills = ({
    requestRender,
  }: {
    requestRender: boolean;
  }) => {
    polygonFillsHandle.clear();

    if (requestRender) {
      engine.requestRender();
    }
  };

  const renderPolygonFills = (
    normalizedPolygonFills: ReturnType<typeof normalizePolygonFills>,
    requestRender = true
  ) => {
    polygonFillsHandle.setPolygonFills(
      toScenePolygonFills(normalizedPolygonFills)
    );

    if (requestRender) {
      engine.requestRender();
    }
  };

  return {
    setPolygonFills: (polygonFills, requestRender = true) => {
      const normalizedPolygonFills = normalizePolygonFills(polygonFills);
      if (arePolygonFillsEqual(currentPolygonFills, normalizedPolygonFills)) {
        return;
      }

      currentPolygonFills = normalizedPolygonFills;
      if (engine.isDestroyed()) {
        return;
      }

      renderPolygonFills(normalizedPolygonFills, requestRender);
    },
    clear: (requestRender = true) => {
      if (currentPolygonFills.length === 0) {
        return;
      }

      currentPolygonFills = [];
      if (engine.isDestroyed()) {
        return;
      }

      clearRenderedPolygonFills({ requestRender });
    },
    destroy: () => {
      currentPolygonFills = [];
      if (engine.isDestroyed()) {
        return;
      }

      polygonFillsHandle.destroy();
      engine.requestRender();
    },
  };
};
