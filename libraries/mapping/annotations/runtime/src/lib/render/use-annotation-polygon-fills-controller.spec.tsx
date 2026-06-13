import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Scene } from "@carma-cesium";
import type { RuntimePolygonFillRenderModel } from "./annotation-render-models";
import { createAnnotationOverlayPolygonFillsController } from "./annotation-overlay-polygon-fills-controller.shared";
import { createAnnotationPolygonFillsController } from "./annotation-polygon-fills-controller.shared";
import { useAnnotationOverlayPolygonFillsController } from "./use-annotation-overlay-polygon-fills-controller";
import { useAnnotationPolygonFillsController } from "./use-annotation-polygon-fills-controller";

vi.mock("./annotation-polygon-fills-controller.shared", () => ({
  createAnnotationPolygonFillsController: vi.fn(),
}));

vi.mock("./annotation-overlay-polygon-fills-controller.shared", () => ({
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

  it("syncs existing fills when a Cesium scene becomes available later", () => {
    const nullSceneController = createFillController();
    const sceneController = createFillController();
    vi.mocked(createAnnotationPolygonFillsController)
      .mockReturnValueOnce(nullSceneController)
      .mockReturnValueOnce(sceneController);
    const scene = {} as Scene;

    const { rerender } = renderHook(
      ({ currentScene }) =>
        useAnnotationPolygonFillsController(currentScene, polygonFill),
      {
        initialProps: {
          currentScene: null as Scene | null,
        },
      }
    );

    rerender({ currentScene: scene });

    expect(nullSceneController.destroy).toHaveBeenCalledOnce();
    expect(createAnnotationPolygonFillsController).toHaveBeenLastCalledWith(
      scene
    );
    expect(sceneController.setPolygonFills).toHaveBeenCalledWith(polygonFill);
  });

  it("updates fills without recreating the current Cesium fill controller", () => {
    const sceneController = createFillController();
    vi.mocked(createAnnotationPolygonFillsController).mockReturnValue(
      sceneController
    );
    const scene = {} as Scene;

    const { rerender } = renderHook(
      ({ fills }) => useAnnotationPolygonFillsController(scene, fills),
      {
        initialProps: {
          fills: polygonFill,
        },
      }
    );

    rerender({ fills: nextPolygonFill });

    expect(createAnnotationPolygonFillsController).toHaveBeenCalledOnce();
    expect(sceneController.setPolygonFills).toHaveBeenCalledWith(
      nextPolygonFill
    );
  });
});

describe("useAnnotationOverlayPolygonFillsController", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("syncs existing fills when an overlay scene becomes available later", () => {
    const nullSceneController = createFillController();
    const sceneController = createFillController();
    vi.mocked(createAnnotationOverlayPolygonFillsController)
      .mockReturnValueOnce(nullSceneController)
      .mockReturnValueOnce(sceneController);
    const scene = {} as Scene;

    const { rerender } = renderHook(
      ({ currentScene }) =>
        useAnnotationOverlayPolygonFillsController(
          currentScene,
          polygonFill,
          "committed"
        ),
      {
        initialProps: {
          currentScene: null as Scene | null,
        },
      }
    );

    rerender({ currentScene: scene });

    expect(nullSceneController.destroy).toHaveBeenCalledOnce();
    expect(
      createAnnotationOverlayPolygonFillsController
    ).toHaveBeenLastCalledWith(scene, "committed");
    expect(sceneController.setPolygonFills).toHaveBeenCalledWith(polygonFill);
  });

  it("syncs existing fills when the overlay surface changes", () => {
    const committedController = createFillController();
    const previewController = createFillController();
    vi.mocked(createAnnotationOverlayPolygonFillsController)
      .mockReturnValueOnce(committedController)
      .mockReturnValueOnce(previewController);
    const scene = {} as Scene;

    const { rerender } = renderHook(
      ({ surfaceKey }) =>
        useAnnotationOverlayPolygonFillsController(
          scene,
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
    ).toHaveBeenLastCalledWith(scene, "preview");
    expect(previewController.setPolygonFills).toHaveBeenCalledWith(polygonFill);
  });
});
