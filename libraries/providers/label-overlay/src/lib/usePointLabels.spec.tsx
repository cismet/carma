import { renderHook } from "@testing-library/react";
import type { CssPixelPosition } from "@carma-units";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PointLabelData } from "./usePointLabels";

const useLabelOverlayMock = vi.hoisted(() => vi.fn());

vi.mock("./useLabelOverlay", () => ({
  useLabelOverlay: () => useLabelOverlayMock(),
}));

import { usePointLabels } from "./usePointLabels";

const createCanvasPositionGetter = (x: number, y: number) => () =>
  ({ x, y } as CssPixelPosition);

const createPoint = (
  getCanvasPosition: () => CssPixelPosition | null,
  onClick: () => void
): PointLabelData => ({
  id: "point-1",
  content: "Point 1",
  getCanvasPosition,
  onClick,
  visible: true,
});

const createHiddenPoint = (
  getCanvasPosition: () => CssPixelPosition | null,
  onClick: () => void,
  isHidden: boolean
): PointLabelData => ({
  ...createPoint(getCanvasPosition, onClick),
  isHidden,
});

describe("usePointLabels", () => {
  beforeEach(() => {
    useLabelOverlayMock.mockReset();
  });

  it("updates overlay positions in place without re-adding unchanged point portals", () => {
    const addLabelOverlayElement = vi.fn();
    const removeLabelOverlayElement = vi.fn();
    const updateLabelOverlayElement = vi.fn();
    const stableClickHandler = vi.fn();

    useLabelOverlayMock.mockReturnValue({
      addLabelOverlayElement,
      removeLabelOverlayElement,
      updateLabelOverlayElement,
    });

    const { rerender } = renderHook(
      ({ points }: { points: PointLabelData[] }) => usePointLabels(points),
      {
        initialProps: {
          points: [
            createPoint(createCanvasPositionGetter(10, 20), stableClickHandler),
          ],
        },
      }
    );

    expect(addLabelOverlayElement).toHaveBeenCalledTimes(1);
    expect(updateLabelOverlayElement).not.toHaveBeenCalled();

    rerender({
      points: [
        createPoint(createCanvasPositionGetter(30, 40), stableClickHandler),
      ],
    });

    expect(addLabelOverlayElement).toHaveBeenCalledTimes(1);
    expect(updateLabelOverlayElement).toHaveBeenCalledTimes(1);
    expect(updateLabelOverlayElement).toHaveBeenCalledWith(
      "point-label-point-1",
      expect.objectContaining({
        getCanvasPosition: expect.any(Function),
        onClick: stableClickHandler,
        visible: true,
      })
    );
    expect(removeLabelOverlayElement).not.toHaveBeenCalledWith(
      "point-label-point-1"
    );
  });

  it("updates visibility-only changes in place without re-adding point portals", () => {
    const addLabelOverlayElement = vi.fn();
    const removeLabelOverlayElement = vi.fn();
    const updateLabelOverlayElement = vi.fn();
    const stableClickHandler = vi.fn();

    useLabelOverlayMock.mockReturnValue({
      addLabelOverlayElement,
      removeLabelOverlayElement,
      updateLabelOverlayElement,
    });

    const { rerender } = renderHook(
      ({ points }: { points: PointLabelData[] }) => usePointLabels(points),
      {
        initialProps: {
          points: [
            createHiddenPoint(
              createCanvasPositionGetter(10, 20),
              stableClickHandler,
              false
            ),
          ],
        },
      }
    );

    expect(addLabelOverlayElement).toHaveBeenCalledTimes(1);

    rerender({
      points: [
        createHiddenPoint(
          createCanvasPositionGetter(10, 20),
          stableClickHandler,
          true
        ),
      ],
    });

    expect(addLabelOverlayElement).toHaveBeenCalledTimes(1);
    expect(updateLabelOverlayElement).toHaveBeenCalledTimes(1);
    expect(updateLabelOverlayElement).toHaveBeenCalledWith(
      "point-label-point-1",
      expect.objectContaining({
        isHidden: true,
        onClick: stableClickHandler,
      })
    );
    expect(removeLabelOverlayElement).not.toHaveBeenCalled();
  });
});
