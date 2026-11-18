import { renderHook } from "@testing-library/react";
import { Matrix4 } from "three";
import { describe, expect, it, vi } from "vitest";

import type {
  AnnotationEngine,
  AnnotationScenePrimitiveHandle,
} from "@carma-mapping/annotations/core";
import type { ScenePrimitiveModel } from "./scene-primitive-models";
import { useScenePrimitives } from "./use-scene-primitives";

const createEngine = () => {
  const preRender = new Set<() => void>();
  const engine = {
    isDestroyed: () => false,
    requestRender: vi.fn(),
    subscribePreRender: (listener: () => void) => {
      preRender.add(listener);
      return () => preRender.delete(listener);
    },
  } as unknown as AnnotationEngine;
  return { engine, frame: () => preRender.forEach((listener) => listener()) };
};

const createHandle = () =>
  ({
    setModelMatrix: vi.fn(),
    setVisible: vi.fn(),
    destroy: vi.fn(),
  } satisfies AnnotationScenePrimitiveHandle);

const model = (
  id: string,
  signature: string,
  handle: AnnotationScenePrimitiveHandle,
  place: () => Matrix4 | null
): ScenePrimitiveModel => ({
  id,
  signature,
  create: () => handle,
  place,
});

describe("useScenePrimitives", () => {
  it("creates the primitives at their placement and places them before every frame", () => {
    const { engine, frame } = createEngine();
    const handle = createHandle();
    let matrix: Matrix4 | null = new Matrix4().makeTranslation(1, 2, 3);
    const primitives = [model("a", "s", handle, () => matrix)];
    renderHook(() => useScenePrimitives(engine, primitives));
    expect(handle.setVisible).toHaveBeenLastCalledWith(true);

    matrix = new Matrix4().makeTranslation(4, 5, 6);
    frame();
    expect(handle.setModelMatrix).toHaveBeenLastCalledWith(matrix);
    matrix = null;
    frame();
    expect(handle.setVisible).toHaveBeenLastCalledWith(false);
  });

  it("keeps a primitive with an equal signature and swaps its model", () => {
    const { engine, frame } = createEngine();
    const handle = createHandle();
    const first = new Matrix4().makeTranslation(1, 0, 0);
    const second = new Matrix4().makeTranslation(2, 0, 0);
    const { rerender } = renderHook(
      ({ primitives }) => useScenePrimitives(engine, primitives),
      { initialProps: { primitives: [model("a", "s", handle, () => first)] } }
    );
    rerender({ primitives: [model("a", "s", createHandle(), () => second)] });
    frame();
    expect(handle.destroy).not.toHaveBeenCalled();
    expect(handle.setModelMatrix).toHaveBeenLastCalledWith(second);
  });

  it("replaces changed primitives and destroys removed ones and all on unmount", () => {
    const { engine } = createEngine();
    const a = createHandle();
    const b = createHandle();
    const nextA = createHandle();
    const place = () => new Matrix4();
    const { rerender, unmount } = renderHook(
      ({ primitives }) => useScenePrimitives(engine, primitives),
      {
        initialProps: {
          primitives: [model("a", "s", a, place), model("b", "s", b, place)],
        },
      }
    );
    rerender({ primitives: [model("a", "t", nextA, place)] });
    expect(a.destroy).toHaveBeenCalledTimes(1);
    expect(b.destroy).toHaveBeenCalledTimes(1);
    unmount();
    expect(nextA.destroy).toHaveBeenCalledTimes(1);
  });
});
