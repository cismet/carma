import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Scene } from "@carma-cesium";
import type { RuntimePolygonFillRenderModel } from "./measurement-render-models";
import { createMeasurementOverlayPolygonFillsController } from "./measurement-overlay-polygon-fills-controller.shared";
import { createMeasurementPolygonFillsController } from "./measurement-polygon-fills-controller.shared";
import { useMeasurementOverlayPolygonFillsController } from "./use-measurement-overlay-polygon-fills-controller";
import { useMeasurementPolygonFillsController } from "./use-measurement-polygon-fills-controller";

vi.mock("./measurement-polygon-fills-controller.shared", () => ({
  createMeasurementPolygonFillsController: vi.fn(),
}));

vi.mock("./measurement-overlay-polygon-fills-controller.shared", () => ({
  createMeasurementOverlayPolygonFillsController: vi.fn(),
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
  measurementId: "measurement-1",
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

describe("useMeasurementPolygonFillsController", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("syncs existing fills when a Cesium scene becomes available later", () => {
    const nullSceneController = createFillController();
    const sceneController = createFillController();
    vi.mocked(createMeasurementPolygonFillsController)
      .mockReturnValueOnce(nullSceneController)
      .mockReturnValueOnce(sceneController);
    const scene = {} as Scene;

    const { rerender } = renderHook(
      ({ currentScene }) =>
        useMeasurementPolygonFillsController(currentScene, polygonFill),
      {
        initialProps: {
          currentScene: null as Scene | null,
        },
      }
    );

    rerender({ currentScene: scene });

    expect(nullSceneController.destroy).toHaveBeenCalledOnce();
    expect(createMeasurementPolygonFillsController).toHaveBeenLastCalledWith(
      scene
    );
    expect(sceneController.setPolygonFills).toHaveBeenCalledWith(polygonFill);
  });

  it("updates fills without recreating the current Cesium fill controller", () => {
    const sceneController = createFillController();
    vi.mocked(createMeasurementPolygonFillsController).mockReturnValue(
      sceneController
    );
    const scene = {} as Scene;

    const { rerender } = renderHook(
      ({ fills }) => useMeasurementPolygonFillsController(scene, fills),
      {
        initialProps: {
          fills: polygonFill,
        },
      }
    );

    rerender({ fills: nextPolygonFill });

    expect(createMeasurementPolygonFillsController).toHaveBeenCalledOnce();
    expect(sceneController.setPolygonFills).toHaveBeenCalledWith(
      nextPolygonFill
    );
  });
});

describe("useMeasurementOverlayPolygonFillsController", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("syncs existing fills when an overlay scene becomes available later", () => {
    const nullSceneController = createFillController();
    const sceneController = createFillController();
    vi.mocked(createMeasurementOverlayPolygonFillsController)
      .mockReturnValueOnce(nullSceneController)
      .mockReturnValueOnce(sceneController);
    const scene = {} as Scene;

    const { rerender } = renderHook(
      ({ currentScene }) =>
        useMeasurementOverlayPolygonFillsController(
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
      createMeasurementOverlayPolygonFillsController
    ).toHaveBeenLastCalledWith(scene, "committed");
    expect(sceneController.setPolygonFills).toHaveBeenCalledWith(polygonFill);
  });

  it("syncs existing fills when the overlay surface changes", () => {
    const committedController = createFillController();
    const previewController = createFillController();
    vi.mocked(createMeasurementOverlayPolygonFillsController)
      .mockReturnValueOnce(committedController)
      .mockReturnValueOnce(previewController);
    const scene = {} as Scene;

    const { rerender } = renderHook(
      ({ surfaceKey }) =>
        useMeasurementOverlayPolygonFillsController(
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
      createMeasurementOverlayPolygonFillsController
    ).toHaveBeenLastCalledWith(scene, "preview");
    expect(previewController.setPolygonFills).toHaveBeenCalledWith(polygonFill);
  });
});
