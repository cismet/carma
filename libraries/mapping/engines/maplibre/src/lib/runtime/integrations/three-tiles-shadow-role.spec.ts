import { Group, Mesh } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  getTileShadowRole,
  setTileShadowRole,
  setTileShadowMaterialReceiver,
} from "./three-tiles-shadow-role";

describe("mesh shadow roles", () => {
  it("keeps offscreen payloads casting without receiving", () => {
    const root = new Group();
    const mesh = new Mesh();
    root.add(mesh);
    setTileShadowRole(root, { receiver: false, caster: true });
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(false);
    expect(getTileShadowRole(root)).toEqual({ receiver: false, caster: true });
    expect(mesh.material.colorWrite).toBe(false);
    expect(mesh.material.depthWrite).toBe(false);
    expect(mesh.material.visible).toBe(true);
    expect(root.visible).toBe(true);
  });

  it("changes roles when a retained caster becomes a visible receiver", () => {
    const root = new Group();
    const mesh = new Mesh();
    root.add(mesh);
    setTileShadowRole(root, { receiver: false, caster: true });
    setTileShadowRole(root, { receiver: true, caster: true });
    expect(mesh.receiveShadow).toBe(true);
    // Appearance refreshes may start at the whole tileset, not this payload.
    expect(getTileShadowRole(mesh)?.receiver).toBe(true);
    expect(mesh.material.colorWrite).toBe(true);
    expect(mesh.material.depthWrite).toBe(true);
    setTileShadowRole(root, { receiver: false, caster: true });
    expect(mesh.receiveShadow).toBe(false);
    expect(mesh.castShadow).toBe(true);
  });

  it("does not revisit mesh descendants when the role is unchanged", () => {
    const root = new Group();
    const traverse = vi.spyOn(root, "traverse");
    setTileShadowRole(root, { receiver: false, caster: true });
    setTileShadowRole(root, { receiver: false, caster: true });
    expect(traverse).toHaveBeenCalledOnce();
  });

  it("shows a receiver child without mixing it into its parent's depth cut", () => {
    const child = new Mesh();
    setTileShadowRole(child, { receiver: true, caster: false });
    expect(child.receiveShadow).toBe(true);
    expect(child.material.colorWrite).toBe(true);
    expect(child.material.depthWrite).toBe(true);
    expect(child.castShadow).toBe(false);
    expect(child.userData.disableShadowCasting).toBe(true);
    setTileShadowRole(child, { receiver: true, caster: true });
    expect(child.castShadow).toBe(true);
    expect(child.userData.disableShadowCasting).toBe(false);
  });

  it("restores display writes before appearance changes without losing opacity policy", () => {
    const mesh = new Mesh();
    setTileShadowRole(mesh, { receiver: false, caster: true });
    setTileShadowMaterialReceiver(mesh.material, true);
    // The appearance layer now makes the tile translucent.
    mesh.material.depthWrite = false;
    setTileShadowMaterialReceiver(mesh.material, false);
    setTileShadowRole(mesh, { receiver: true, caster: true });
    expect(mesh.material.colorWrite).toBe(true);
    expect(mesh.material.depthWrite).toBe(false);
  });
});
