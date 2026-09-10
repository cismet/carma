import { Camera, Group, Mesh, Scene, type WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";
import { renderShadowReceiverObject } from "./shadow-receiver-object";

describe("native shadow receiver ownership", () => {
  it("skips unrelated colour replay draws and restores visibility even on failure", () => {
    const scene = new Scene();
    const ancestor = new Mesh();
    const root = new Group();
    const receiver = new Mesh();
    const caster = new Mesh();
    const alreadyHidden = new Mesh();
    alreadyHidden.visible = false;
    root.add(receiver);
    ancestor.add(root);
    scene.add(ancestor, caster, alreadyHidden);
    caster.castShadow = true;
    const renderer = {
      render: () => {
        expect(receiver.visible).toBe(true);
        expect(ancestor.visible).toBe(true);
        expect(caster.visible).toBe(false);
        expect(caster.castShadow).toBe(true);
        throw new Error("replay");
      },
    } as unknown as WebGLRenderer;
    expect(() =>
      renderShadowReceiverObject(
        scene,
        root.id,
        renderer,
        new Camera(),
        "color-only"
      )
    ).toThrow("replay");
    expect(caster.visible).toBe(true);
    expect(alreadyHidden.visible).toBe(false);
  });

  it("skips unrelated receiver draws but draws every caster with the light camera", () => {
    const scene = new Scene();
    const root = new Group();
    const receiver = new Mesh();
    const caster = new Mesh(receiver.geometry, receiver.material);
    root.add(receiver);
    scene.add(root, caster);
    caster.castShadow = true;
    const before = caster.onBeforeRender;
    const after = caster.onAfterRender;
    const camera = new Camera();
    const lightCamera = new Camera();
    const drawBuffer = vi.fn();
    const renderer = {
      renderBufferDirect: drawBuffer,
      render: vi.fn(() => {
        expect(caster.visible).toBe(true);
        expect(caster.castShadow).toBe(true);
        for (const drawCamera of [lightCamera, camera]) {
          for (const mesh of [receiver, caster])
            renderer.renderBufferDirect(
              drawCamera,
              scene,
              mesh.geometry,
              mesh.material,
              mesh,
              null
            );
        }
        expect(receiver.material.colorWrite).toBe(true);
        expect(receiver.material.depthWrite).toBe(true);
      }),
    } as unknown as WebGLRenderer;
    expect(renderShadowReceiverObject(scene, root.id, renderer, camera)).toBe(
      true
    );
    expect(renderer.render).toHaveBeenCalledOnce();
    expect(drawBuffer.mock.calls.map((args) => [args[0], args[4]])).toEqual([
      [lightCamera, receiver],
      [lightCamera, caster],
      [camera, receiver],
    ]);
    expect(renderer.renderBufferDirect).toBe(drawBuffer);
    expect(caster.onBeforeRender).toBe(before);
    expect(caster.onAfterRender).toBe(after);
  });

  it("restores the renderer draw entry on failure without mutating shared resources", () => {
    const scene = new Scene();
    const receiver = new Mesh();
    const other = new Mesh();
    scene.add(receiver, other);
    other.material.depthWrite = false;
    const before = other.onBeforeRender;
    const drawBuffer = vi.fn();
    const renderer = {
      renderBufferDirect: drawBuffer,
      render: () => {
        throw new Error("GPU draw");
      },
    } as unknown as WebGLRenderer;
    expect(() =>
      renderShadowReceiverObject(scene, receiver.id, renderer, new Camera())
    ).toThrow("GPU draw");
    expect(other.onBeforeRender).toBe(before);
    expect(other.material.colorWrite).toBe(true);
    expect(other.material.depthWrite).toBe(false);
    expect(renderer.renderBufferDirect).toBe(drawBuffer);
  });

  it("does not render unrelated geometry for a disposed receiver", () => {
    const scene = new Scene();
    const draw = vi.fn();
    const renderer = { render: draw } as unknown as WebGLRenderer;
    const camera = new Camera();
    expect(renderShadowReceiverObject(scene, -1, renderer, camera)).toBe(false);
    expect(draw).not.toHaveBeenCalled();
    expect(renderShadowReceiverObject(scene, undefined, renderer, camera)).toBe(
      true
    );
    expect(draw).toHaveBeenCalledOnce();
  });
});
