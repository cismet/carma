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

  it("upserts overlay positions without removing unchanged point portals", () => {
    const setLabelOverlayElement = vi.fn();
    const removeLabelOverlayElement = vi.fn();
    const stableClickHandler = vi.fn();

    useLabelOverlayMock.mockReturnValue({
      setLabelOverlayElement,
      removeLabelOverlayElement,
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

    expect(setLabelOverlayElement).toHaveBeenCalledTimes(1);

    rerender({
      points: [
        createPoint(createCanvasPositionGetter(30, 40), stableClickHandler),
      ],
    });

    expect(setLabelOverlayElement).toHaveBeenCalledTimes(2);
    expect(setLabelOverlayElement).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "point-label-point-1",
        updatePosition: expect.any(Function),
        onClick: stableClickHandler,
        visible: true,
      })
    );
    expect(removeLabelOverlayElement).not.toHaveBeenCalledWith(
      "point-label-point-1"
    );
  });

  it("upserts visibility-only changes without removing point portals", () => {
    const setLabelOverlayElement = vi.fn();
    const removeLabelOverlayElement = vi.fn();
    const stableClickHandler = vi.fn();

    useLabelOverlayMock.mockReturnValue({
      setLabelOverlayElement,
      removeLabelOverlayElement,
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

    expect(setLabelOverlayElement).toHaveBeenCalledTimes(1);

    rerender({
      points: [
        createHiddenPoint(
          createCanvasPositionGetter(10, 20),
          stableClickHandler,
          true
        ),
      ],
    });

    expect(setLabelOverlayElement).toHaveBeenCalledTimes(2);
    expect(setLabelOverlayElement).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "point-label-point-1",
        visible: false,
        onClick: stableClickHandler,
      })
    );
    expect(removeLabelOverlayElement).not.toHaveBeenCalled();
  });
});
