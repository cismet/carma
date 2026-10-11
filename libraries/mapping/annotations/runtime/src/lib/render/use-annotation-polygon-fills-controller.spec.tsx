import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnnotationEngine } from "../engine";
import type { RuntimePolygonFillRenderModel } from "./annotation-render-models";
import { createAnnotationOverlayPolygonFillsController } from "./create-annotation-overlay-polygon-fills-controller";
import { createAnnotationPolygonFillsController } from "./create-annotation-polygon-fills-controller";
import { useAnnotationOverlayPolygonFillsController } from "./use-annotation-overlay-polygon-fills-controller";
import { useAnnotationPolygonFillsController } from "./use-annotation-polygon-fills-controller";

vi.mock("./create-annotation-polygon-fills-controller", () => ({
  createAnnotationPolygonFillsController: vi.fn(),
}));

vi.mock("./create-annotation-overlay-polygon-fills-controller", () => ({
  createAnnotationOverlayPolygonFillsController: vi.fn(),
}));

type FillController = {
  setPolygonFills: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

const createFillController = (): FillController => ({
  setPolygonFills: vi.fn(),
  clear: vi.fn(),
  destroy: vi.fn(),
});

const basePolygonFill = {
  id: "polygon-fill-1",
  annotationId: "measurement-1",
  coordinates: [
    { longitude: 7, latitude: 51, altitude: 100 },
    { longitude: 7.0001, latitude: 51, altitude: 100 },
    { longitude: 7.0001, latitude: 51.0001, altitude: 100 },
  ],
  fill: "rgba(0, 0, 0, 0.5)",
  overlayFill: "rgba(0, 0, 0, 0.25)",
} satisfies RuntimePolygonFillRenderModel;

const polygonFill = Object.freeze([basePolygonFill]);
const noPolygonFills = Object.freeze(
  []
) as readonly RuntimePolygonFillRenderModel[];

const nextPolygonFill = Object.freeze([
  {
    ...basePolygonFill,
    id: "polygon-fill-2",
  },
] satisfies readonly RuntimePolygonFillRenderModel[]);

describe("useAnnotationPolygonFillsController", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("syncs existing fills when an engine becomes available later", () => {
    const nullEngineController = createFillController();
    const engineController = createFillController();
    vi.mocked(createAnnotationPolygonFillsController)
      .mockReturnValueOnce(nullEngineController)
      .mockReturnValueOnce(engineController);
    const engine = {} as AnnotationEngine;

    const { rerender } = renderHook(
      ({ currentEngine }) =>
        useAnnotationPolygonFillsController(currentEngine, polygonFill),
      {
        initialProps: {
          currentEngine: null as AnnotationEngine | null,
        },
      }
    );

    rerender({ currentEngine: engine });

    expect(nullEngineController.destroy).toHaveBeenCalledOnce();
    expect(createAnnotationPolygonFillsController).toHaveBeenLastCalledWith(
      engine
    );
    expect(engineController.setPolygonFills).toHaveBeenCalledWith(polygonFill);
  });

  it("updates fills without recreating the current fill controller", () => {
    const engineController = createFillController();
    vi.mocked(createAnnotationPolygonFillsController).mockReturnValue(
      engineController
    );
    const engine = {} as AnnotationEngine;

    const { rerender } = renderHook(
      ({ fills }) => useAnnotationPolygonFillsController(engine, fills),
      {
        initialProps: {
          fills: polygonFill,
        },
      }
    );

    rerender({ fills: nextPolygonFill });

    expect(createAnnotationPolygonFillsController).toHaveBeenCalledOnce();
    expect(engineController.setPolygonFills).toHaveBeenCalledWith(
      nextPolygonFill
    );
  });

  it("removes ground and coplanar fills when their measurement disappears", () => {
    const engineController = createFillController();
    vi.mocked(createAnnotationPolygonFillsController).mockReturnValue(
      engineController
    );
    const engine = {} as AnnotationEngine;

    const { rerender } = renderHook(
      ({ fills }) => useAnnotationPolygonFillsController(engine, fills),
      { initialProps: { fills: polygonFill } }
    );

    rerender({ fills: noPolygonFills });

    expect(engineController.setPolygonFills).toHaveBeenLastCalledWith(
      noPolygonFills
    );
  });
});

describe("useAnnotationOverlayPolygonFillsController", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("syncs existing fills when an overlay engine becomes available later", () => {
    const nullEngineController = createFillController();
    const engineController = createFillController();
    vi.mocked(createAnnotationOverlayPolygonFillsController)
      .mockReturnValueOnce(nullEngineController)
      .mockReturnValueOnce(engineController);
    const engine = {} as AnnotationEngine;

    const { rerender } = renderHook(
      ({ currentEngine }) =>
        useAnnotationOverlayPolygonFillsController(
          currentEngine,
          polygonFill,
          "committed"
        ),
      {
        initialProps: {
          currentEngine: null as AnnotationEngine | null,
        },
      }
    );

    rerender({ currentEngine: engine });

    expect(nullEngineController.destroy).toHaveBeenCalledOnce();
    expect(
      createAnnotationOverlayPolygonFillsController
    ).toHaveBeenLastCalledWith(engine, "committed");
    expect(engineController.setPolygonFills).toHaveBeenCalledWith(polygonFill);
  });

  it("syncs existing fills when the overlay surface changes", () => {
    const committedController = createFillController();
    const previewController = createFillController();
    vi.mocked(createAnnotationOverlayPolygonFillsController)
      .mockReturnValueOnce(committedController)
      .mockReturnValueOnce(previewController);
    const engine = {} as AnnotationEngine;

    const { rerender } = renderHook(
      ({ surfaceKey }) =>
        useAnnotationOverlayPolygonFillsController(
          engine,
          polygonFill,
          surfaceKey
        ),
      {
        initialProps: {
          surfaceKey: "committed",
        },
      }
    );

    rerender({ surfaceKey: "preview" });

    expect(committedController.destroy).toHaveBeenCalledOnce();
    expect(
      createAnnotationOverlayPolygonFillsController
    ).toHaveBeenLastCalledWith(engine, "preview");
    expect(previewController.setPolygonFills).toHaveBeenCalledWith(polygonFill);
  });

  it("removes the overlay fill when its measurement disappears", () => {
    const engineController = createFillController();
    vi.mocked(createAnnotationOverlayPolygonFillsController).mockReturnValue(
      engineController
    );
    const engine = {} as AnnotationEngine;

    const { rerender } = renderHook(
      ({ fills }) =>
        useAnnotationOverlayPolygonFillsController(engine, fills, "committed"),
      { initialProps: { fills: polygonFill } }
    );

    rerender({ fills: noPolygonFills });

    expect(engineController.setPolygonFills).toHaveBeenLastCalledWith(
      noPolygonFills
    );
  });
});
