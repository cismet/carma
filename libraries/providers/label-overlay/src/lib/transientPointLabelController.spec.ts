import { describe, expect, it, vi } from "vitest";
import type { CssPixelPosition } from "@carma-units";
import { createTransientPointLabelController } from "./transientPointLabelController";
import type { LabelOverlayContextType } from "./types";

describe("transient point label layout scheduling", () => {
  it("invalidates the existing frame host without reading layout in setState", () => {
    const overlay: LabelOverlayContextType = {
      setLabelOverlayElement: vi.fn(),
      removeLabelOverlayElement: vi.fn(),
      updatePositions: vi.fn(),
      invalidatePositions: vi.fn(),
    };
    const requestRender = vi.fn();
    const controller = createTransientPointLabelController({
      labelOverlay: overlay,
      overlayId: "draft",
      requestRender,
      deferLayout: true,
    });
    controller.setState({
      content: "A",
      screenPosition: { x: 10, y: 20 } as CssPixelPosition,
    });
    controller.setState({
      content: "A",
      screenPosition: { x: 30, y: 40 } as CssPixelPosition,
    });
    expect(overlay.updatePositions).not.toHaveBeenCalled();
    expect(overlay.invalidatePositions).toHaveBeenCalledTimes(2);
    expect(requestRender).toHaveBeenCalledTimes(2);
    controller.setState(null);
    expect(overlay.updatePositions).not.toHaveBeenCalled();
    expect(overlay.invalidatePositions).toHaveBeenCalledTimes(3);
    controller.destroy();
    expect(overlay.removeLabelOverlayElement).toHaveBeenCalledWith("draft");
  });
});

it("retains synchronous layout by default for the legacy Cesium/DOM path", () => {
  const overlay: LabelOverlayContextType = {
    setLabelOverlayElement: vi.fn(),
    removeLabelOverlayElement: vi.fn(),
    updatePositions: vi.fn(),
    invalidatePositions: vi.fn(),
  };
  const controller = createTransientPointLabelController({
    labelOverlay: overlay,
    overlayId: "legacy",
  });
  controller.setState({ content: "Legacy" });
  expect(overlay.updatePositions).toHaveBeenCalledTimes(1);
  expect(overlay.invalidatePositions).not.toHaveBeenCalled();
  controller.destroy();
});
