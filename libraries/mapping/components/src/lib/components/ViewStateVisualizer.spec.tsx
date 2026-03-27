// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import type { ViewState } from "@carma-mapping/engines-interop/view-state";
import { ViewStateVisualizer } from "./ViewStateVisualizer";

const { primitiveMock, createPrimitiveMock } = vi.hoisted(() => {
  const labelAnchors = {
    bearing: { leftPx: 10, topPx: 10 },
    pitch: { leftPx: 20, topPx: 20 },
    range: { leftPx: 30, topPx: 30 },
    altitude: { leftPx: 40, topPx: 40 },
    east: { leftPx: 50, topPx: 50 },
    north: { leftPx: 60, topPx: 60 },
    up: { leftPx: 70, topPx: 70 },
    imageX: { leftPx: 80, topPx: 80 },
    imageY: { leftPx: 90, topPx: 90 },
  };
  const primitive = {
    resize: vi.fn(() => labelAnchors),
    update: vi.fn(() => labelAnchors),
    setOverview: vi.fn(() => null),
    setVisualized: vi.fn(() => null),
    setDisplay: vi.fn(() => null),
    setInteractive: vi.fn(),
    readLabelAnchors: vi.fn(() => labelAnchors),
    dispose: vi.fn(),
  };

  return {
    primitiveMock: primitive,
    createPrimitiveMock: vi.fn(() => primitive),
  };
});

vi.mock("@carma-mapping/engines/three/primitives", () => ({
  DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS: {
    bearing: "#0ea5e9",
    pitch: "#f59e0b",
    range: "#64748b",
    altitude: "#94a3b8",
    east: "#ef4444",
    north: "#22c55e",
    up: "#3b82f6",
    imageX: "#a855f7",
    imageY: "#ec4899",
  },
  createViewStateVisualizerPrimitive: createPrimitiveMock,
  mergeViewStateVisualizerDisplayOptions: () => ({
    labels: {
      showAxes: true,
      showAngles: true,
      showImagePlane: true,
      fontSizePx: 11,
    },
    worldAxes: {
      show: true,
    },
    angleCues: {
      show: true,
    },
    cameraView: {
      imagePlane: {
        show: true,
      },
      axes: {
        show: true,
      },
    },
    altitude: {
      show: true,
    },
    cueColors: {},
  }),
  mergeViewStateVisualizerOverviewOptions: () => ({}),
  mergeViewStateVisualizerVisualizedOptions: () => ({}),
}));

describe("ViewStateVisualizer", () => {
  beforeEach(() => {
    createPrimitiveMock.mockClear();
    primitiveMock.resize.mockClear();
    primitiveMock.update.mockClear();
    primitiveMock.setOverview.mockClear();
    primitiveMock.setVisualized.mockClear();
    primitiveMock.setDisplay.mockClear();
    primitiveMock.setInteractive.mockClear();
    primitiveMock.readLabelAnchors.mockClear();
    primitiveMock.dispose.mockClear();
  });

  it("creates and resizes the primitive with the full rectangular viewport", async () => {
    const { rerender, container } = render(
      <ViewStateVisualizer
        viewState={{} as ViewState}
        width={96}
        height={240}
      />
    );

    await waitFor(() => {
      expect(createPrimitiveMock).toHaveBeenCalledWith(
        expect.any(HTMLCanvasElement),
        expect.any(Object),
        expect.objectContaining({
          size: {
            widthPx: 96,
            heightPx: 240,
          },
        })
      );
    });

    const canvas = container.querySelector("canvas");
    expect(canvas?.width).toBe(96);
    expect(canvas?.height).toBe(240);

    rerender(
      <ViewStateVisualizer
        viewState={{} as ViewState}
        width={72}
        height={320}
      />
    );

    await waitFor(() => {
      expect(primitiveMock.resize).toHaveBeenLastCalledWith({
        widthPx: 72,
        heightPx: 320,
      });
    });
  });
});
