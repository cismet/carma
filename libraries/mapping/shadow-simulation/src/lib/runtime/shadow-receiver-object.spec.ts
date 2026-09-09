import { Camera, Group, Mesh, Scene } from "three";
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
    expect(() =>
      renderShadowReceiverObject(
        scene,
        root.id,
        () => {
          expect(receiver.visible).toBe(true);
          expect(ancestor.visible).toBe(true);
          expect(caster.visible).toBe(false);
          expect(caster.castShadow).toBe(true);
          throw new Error("replay");
        },
        "color-only"
      )
    ).toThrow("replay");
    expect(caster.visible).toBe(true);
    expect(alreadyHidden.visible).toBe(false);
  });

  it("masks only other colour draws, keeping every caster and shared material valid", () => {
    const scene = new Scene();
    const root = new Group();
    const receiver = new Mesh();
    const caster = new Mesh(receiver.geometry, receiver.material);
    root.add(receiver);
    scene.add(root, caster);
    caster.castShadow = true;
    const before = caster.onBeforeRender;
    const after = caster.onAfterRender;
    const beforeShadow = caster.onBeforeShadow;
    const args = [
      undefined as never,
      scene,
      new Camera(),
      caster.geometry,
      caster.material,
      null as never,
    ] as const;
    const draw = vi.fn(() => {
      // Three's earlier shadow traversal sees all casters and original material.
      expect(caster.visible).toBe(true);
      expect(caster.castShadow).toBe(true);
      expect(caster.onBeforeShadow).toBe(beforeShadow);
      expect(caster.material.colorWrite).toBe(true);
      caster.onBeforeRender(...args);
      expect(caster.material.colorWrite).toBe(false);
      expect(caster.material.depthWrite).toBe(false);
      caster.onAfterRender(...args);
      // A later receiver draw may use the exact same material.
      expect(receiver.material.colorWrite).toBe(true);
      expect(receiver.material.depthWrite).toBe(true);
    });
    expect(renderShadowReceiverObject(scene, root.id, draw)).toBe(true);
    expect(draw).toHaveBeenCalledOnce();
    expect(caster.onBeforeRender).toBe(before);
    expect(caster.onAfterRender).toBe(after);
  });

  it("restores callbacks and pending material writes if rendering throws", () => {
    const scene = new Scene();
    const receiver = new Mesh();
    const other = new Mesh();
    scene.add(receiver, other);
    other.material.depthWrite = false;
    const before = other.onBeforeRender;
    expect(() =>
      renderShadowReceiverObject(scene, receiver.id, () => {
        other.onBeforeRender(
          undefined as never,
          scene,
          new Camera(),
          other.geometry,
          other.material,
          null as never
        );
        throw new Error("GPU draw");
      })
    ).toThrow("GPU draw");
    expect(other.onBeforeRender).toBe(before);
    expect(other.material.colorWrite).toBe(true);
    expect(other.material.depthWrite).toBe(false);
  });

  it("does not render unrelated geometry for a disposed receiver", () => {
    const scene = new Scene();
    const draw = vi.fn();
    expect(renderShadowReceiverObject(scene, -1, draw)).toBe(false);
    expect(draw).not.toHaveBeenCalled();
    expect(renderShadowReceiverObject(scene, undefined, draw)).toBe(true);
    expect(draw).toHaveBeenCalledOnce();
  });
});
