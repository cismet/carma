import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createTiledShadowReference } from "./tiled-shadow-reference";

describe("column caster fixture", () => {
  it("shares one double-sided column geometry per cell", () => {
    const reference = createTiledShadowReference();
    const columns = reference.scene.children.filter(
      (o): o is THREE.Mesh =>
        o instanceof THREE.Mesh && o.geometry.type === "BoxGeometry"
    );
    expect(columns).toHaveLength(reference.cells.length);
    expect(new Set(columns.map((o) => o.geometry)).size).toBe(1);
    expect(columns.every((o) => o.castShadow && o.receiveShadow)).toBe(true);
    expect(
      columns.every(
        (o) => (o.material as THREE.Material).shadowSide === THREE.DoubleSide
      )
    ).toBe(true);
    expect(reference.setCasterLift(0)).toHaveLength(0);
    reference.dispose();
  });

  it("retains all columns/roofs as casters and encloses raised objects", () => {
    const reference = createTiledShadowReference();
    expect(reference.setCasterLift(12)).toHaveLength(reference.cells.length);
    const columns = reference.scene.children.filter(
      (o): o is THREE.Mesh =>
        o instanceof THREE.Mesh && o.geometry.type === "BoxGeometry"
    );
    expect(columns).toHaveLength(reference.cells.length);
    for (const column of columns) {
      expect(column.castShadow).toBe(true);
      const bounds = new THREE.Box3().setFromObject(column);
      expect(bounds.min.y).toBe(9);
      expect(
        reference.cells.some((cell) => cell.bounds.containsBox(bounds))
      ).toBe(true);
    }
    reference.dispose();
  });
});
