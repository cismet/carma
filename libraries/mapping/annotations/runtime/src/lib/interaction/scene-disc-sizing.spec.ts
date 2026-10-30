import { Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import type { AnnotationEngine } from "@carma-mapping/annotations/core";
import { createSceneDiscSizing } from "./scene-disc-sizing";
const harness = () => {
  const ground = new Vector3(100, 0, 0),
    state = { groundScale: 12.8, pointerScale: 12.8, destroyed: false };
  let camera: { onMoveStart?: () => void; onMoveEnd?: () => void } = {};
  const release = vi.fn(),
    getGround = vi.fn(() => ground);
  const engine = {
    canvas: { clientWidth: 800, clientHeight: 600 },
    isDestroyed: () => state.destroyed,
    getViewportCenterGroundPosition: getGround,
    getScreenPixelsPerMeterAt: (p: Vector3) =>
      p.equals(ground) ? state.groundScale : state.pointerScale,
    subscribeCameraMove: vi.fn((callbacks: typeof camera) => {
      camera = callbacks;
      return release;
    }),
  } as unknown as AnnotationEngine;
  return {
    engine,
    state,
    getGround,
    release,
    start: () => camera.onMoveStart?.(),
    end: () => camera.onMoveEnd?.(),
  };
};
describe("shared Three query/edit disc sizing", () => {
  it("subscribes explicitly once and holds until moveend", () => {
    const h = harness(),
      changed = vi.fn(),
      sizing = createSceneDiscSizing(h.engine, {}, 3);
    expect(h.engine.subscribeCameraMove).not.toHaveBeenCalled();
    sizing.start(changed);
    sizing.start(changed);
    expect(h.engine.subscribeCameraMove).toHaveBeenCalledOnce();
    expect(sizing.resolve(new Vector3())).toBe(5);
    h.start();
    h.state.groundScale = 32;
    for (let i = 0; i < 20; i++)
      expect(sizing.resolve(new Vector3(i, 0, 0))).toBe(5);
    expect(h.getGround).toHaveBeenCalledOnce();
    expect(changed).not.toHaveBeenCalled();
    h.end();
    expect(changed).toHaveBeenCalledOnce();
    expect(sizing.resolve(new Vector3())).toBe(2);
    expect(h.getGround).toHaveBeenCalledTimes(2);
    sizing.destroy();
    sizing.destroy();
    expect(h.release).toHaveBeenCalledOnce();
  });
  it("keeps query and edit instances on the same nice radius and usability escapes", () => {
    const h = harness(),
      query = createSceneDiscSizing(h.engine, {}, 3),
      edit = createSceneDiscSizing(h.engine, {}, 99);
    query.start(() => {});
    expect(query.resolve(new Vector3())).toBe(5);
    expect(edit.resolve(new Vector3())).toBe(5);
    h.state.pointerScale = 1;
    expect(query.resolve(new Vector3())).toBe(50);
    expect(edit.resolve(new Vector3())).toBe(50);
    h.state.pointerScale = 1000;
    expect(query.resolve(new Vector3())).toBe(0.05);
    expect(edit.resolve(new Vector3())).toBe(0.05);
    query.destroy();
    edit.destroy();
  });
  it("returns the fallback after engine disposal without additional ground picks", () => {
    const h = harness(),
      sizing = createSceneDiscSizing(h.engine, {}, 3);
    expect(sizing.resolve(new Vector3())).toBe(5);
    h.state.destroyed = true;
    expect(sizing.resolve(new Vector3())).toBe(3);
    expect(h.getGround).toHaveBeenCalledOnce();
    sizing.destroy();
  });
});
