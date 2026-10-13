import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AnnotationEngine } from "@carma-mapping/annotations/core";

import { SceneSelectionHost } from "./SceneSelectionHost";

const setup = () => {
  const canvas = document.createElement("canvas");
  const engine = {
    canvas,
    isDestroyed: () => false,
    pickAnnotationIdsAt: vi.fn(() => []),
    requestRender: vi.fn(),
  } as unknown as AnnotationEngine;
  const onAnnotationSelect = vi.fn();
  render(
    <SceneSelectionHost
      engine={engine}
      enabled
      baseEdges={[]}
      overlayEdges={[]}
      basePolygonFills={[]}
      overlayPolygonFills={[]}
      onAnnotationSelect={onAnnotationSelect}
    />
  );
  const press = (x: number, y: number) =>
    canvas.dispatchEvent(
      new MouseEvent("pointerdown", { button: 0, clientX: x, clientY: y })
    );
  const click = (x: number, y: number, init: MouseEventInit = {}) =>
    canvas.dispatchEvent(
      new MouseEvent("click", { button: 0, clientX: x, clientY: y, ...init })
    );
  return { onAnnotationSelect, press, click };
};

describe("SceneSelectionHost", () => {
  it("selects on a plain click", () => {
    const { onAnnotationSelect, press, click } = setup();
    press(10, 10);
    click(12, 11);
    expect(onAnnotationSelect).toHaveBeenCalledWith(null);
  });

  it("keeps the selection after a camera drag", () => {
    const { onAnnotationSelect, press, click } = setup();
    press(10, 10);
    click(40, 10);
    expect(onAnnotationSelect).not.toHaveBeenCalled();
  });

  it("keeps the selection on a modifier click", () => {
    const { onAnnotationSelect, press, click } = setup();
    press(10, 10);
    click(10, 10, { shiftKey: true });
    expect(onAnnotationSelect).not.toHaveBeenCalled();
  });
});
