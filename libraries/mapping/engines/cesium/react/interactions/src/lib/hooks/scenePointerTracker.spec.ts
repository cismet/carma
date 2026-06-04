// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import type { Scene } from "@carma-cesium";

import {
  CESIUM_POINTER_QUERY_PRESERVE_ATTRIBUTE,
  getCesiumScenePointerClientPosition,
  getCesiumScenePointerScreenPosition,
  registerCesiumScenePointerTracker,
} from "./scenePointerTracker";

const createScene = () => {
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () =>
    ({
      bottom: 100,
      height: 100,
      left: 0,
      right: 200,
      top: 0,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.appendChild(canvas);

  return { canvas } as unknown as Scene;
};

const dispatchPointerMove = (
  target: Element,
  clientX: number,
  clientY: number
) => {
  target.dispatchEvent(
    new MouseEvent("pointermove", {
      bubbles: true,
      clientX,
      clientY,
    })
  );
};

describe("scenePointerTracker", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps the last canvas pointer position over ignored pointer-query UI", () => {
    const scene = createScene();
    const unregister = registerCesiumScenePointerTracker(scene);
    const overlay = document.createElement("div");
    overlay.setAttribute(CESIUM_POINTER_QUERY_PRESERVE_ATTRIBUTE, "true");
    document.body.appendChild(overlay);

    dispatchPointerMove(scene.canvas, 40, 30);
    expect(getCesiumScenePointerClientPosition(scene)).toEqual({
      x: 40,
      y: 30,
    });
    expect(getCesiumScenePointerScreenPosition(scene)).toEqual(
      expect.objectContaining({ x: 40, y: 30 })
    );

    dispatchPointerMove(overlay, 90, 80);

    expect(getCesiumScenePointerClientPosition(scene)).toEqual({
      x: 40,
      y: 30,
    });
    expect(getCesiumScenePointerScreenPosition(scene)).toEqual(
      expect.objectContaining({ x: 40, y: 30 })
    );

    unregister();
  });

  it("clears the pointer position over uncaptured non-Cesium UI", () => {
    const scene = createScene();
    const unregister = registerCesiumScenePointerTracker(scene);
    const overlay = document.createElement("div");
    document.body.appendChild(overlay);

    dispatchPointerMove(scene.canvas, 40, 30);
    expect(getCesiumScenePointerClientPosition(scene)).toEqual({
      x: 40,
      y: 30,
    });

    dispatchPointerMove(overlay, 90, 80);

    expect(getCesiumScenePointerClientPosition(scene)).toBeNull();
    expect(getCesiumScenePointerScreenPosition(scene)).toBeNull();

    unregister();
  });
});
