import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT,
  type AnnotationEngine,
  type AnnotationScenePolygonFill,
  type AnnotationScenePolygonFillsHandle,
} from "../engine";
import { RUNTIME_POLYGON_FILL_PLACEMENT } from "./annotation-render-models";
import { createAnnotationPolygonFillsController } from "./create-annotation-polygon-fills-controller";

type PolygonFillsHandleMock = AnnotationScenePolygonFillsHandle & {
  polygonFills: readonly AnnotationScenePolygonFill[];
};

const createPolygonFillsHandle = (): PolygonFillsHandleMock => {
  const handle: PolygonFillsHandleMock = {
    polygonFills: [],
    setPolygonFills: vi.fn((polygonFills) => {
      handle.polygonFills = polygonFills;
    }),
    clear: vi.fn(() => {
      handle.polygonFills = [];
    }),
    destroy: vi.fn(() => {
      handle.polygonFills = [];
    }),
  };
  return handle;
};

const createEngine = () => {
  const polygonFillsHandle = createPolygonFillsHandle();
  const engine = {
    createPolygonFills: vi.fn(() => polygonFillsHandle),
    requestRender: vi.fn(),
    isDestroyed: () => false,
  } as unknown as AnnotationEngine;
  return { engine, polygonFillsHandle };
};

const createFill = (
  placement: (typeof RUNTIME_POLYGON_FILL_PLACEMENT)[keyof typeof RUNTIME_POLYGON_FILL_PLACEMENT]
) => ({
  id: `fill-${placement}`,
  annotationId: "area-1",
  coordinates: [
    { longitude: 7, latitude: 51, altitude: 100 },
    { longitude: 7.001, latitude: 51, altitude: 100 },
    { longitude: 7.001, latitude: 51.001, altitude: 100 },
  ],
  fill: "rgba(255, 127, 0, 0.5)",
  placement,
});

describe("createAnnotationPolygonFillsController", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("maps ground fills to the engine and removes them when their measurement disappears", () => {
    const { engine, polygonFillsHandle } = createEngine();
    const controller = createAnnotationPolygonFillsController(engine);

    controller.setPolygonFills([
      createFill(RUNTIME_POLYGON_FILL_PLACEMENT.GROUND),
    ]);
    expect(polygonFillsHandle.polygonFills).toHaveLength(1);
    expect(polygonFillsHandle.polygonFills[0]?.placement).toBe(
      ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT.GROUND
    );
    expect(polygonFillsHandle.polygonFills[0]?.positionsECEF).toHaveLength(3);

    controller.setPolygonFills([]);
    expect(polygonFillsHandle.polygonFills).toHaveLength(0);
  });

  it("maps coplanar fills to the engine and removes them when their measurement disappears", () => {
    const { engine, polygonFillsHandle } = createEngine();
    const controller = createAnnotationPolygonFillsController(engine);

    controller.setPolygonFills([
      createFill(RUNTIME_POLYGON_FILL_PLACEMENT.COPLANAR),
    ]);
    expect(polygonFillsHandle.polygonFills).toHaveLength(1);
    expect(polygonFillsHandle.polygonFills[0]?.placement).toBe(
      ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT.COPLANAR
    );

    controller.setPolygonFills([]);
    expect(polygonFillsHandle.polygonFills).toHaveLength(0);
  });

  it("defaults the placement to coplanar and skips equal fills", () => {
    const { engine, polygonFillsHandle } = createEngine();
    const controller = createAnnotationPolygonFillsController(engine);
    const { placement: _placement, ...fillWithoutPlacement } = createFill(
      RUNTIME_POLYGON_FILL_PLACEMENT.COPLANAR
    );

    controller.setPolygonFills([fillWithoutPlacement]);
    controller.setPolygonFills([fillWithoutPlacement]);

    expect(polygonFillsHandle.setPolygonFills).toHaveBeenCalledOnce();
    expect(polygonFillsHandle.polygonFills[0]?.placement).toBe(
      ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT.COPLANAR
    );
  });

  it("passes the picking option to the engine and destroys the handle", () => {
    const { engine, polygonFillsHandle } = createEngine();
    const controller = createAnnotationPolygonFillsController(engine, {
      allowPicking: false,
    });

    expect(engine.createPolygonFills).toHaveBeenCalledWith({
      allowPicking: false,
    });

    controller.destroy();
    expect(polygonFillsHandle.destroy).toHaveBeenCalledOnce();
    expect(engine.requestRender).toHaveBeenCalled();
  });
});
