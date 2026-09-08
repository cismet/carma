import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createTiledShadowReference } from "./tiled-shadow-reference";

describe("LOD caster fixture", () => {
  it("uses cached extruded digits by default and invalidates the union on digit changes", () => {
    const reference = createTiledShadowReference();
    const meshes = reference.scene.children.filter(
      (o): o is THREE.Mesh => o instanceof THREE.Mesh
    );
    const digits = meshes.filter((o) => o.geometry.type === "TextGeometry");
    expect(digits).toHaveLength(reference.cells.length);
    expect(new Set(digits.map((o) => o.geometry)).size).toBe(1);
    expect(digits.every((o) => o.castShadow && o.receiveShadow)).toBe(true);
    expect(
      digits.every(
        (o) => (o.material as THREE.Material).shadowSide === THREE.DoubleSide
      )
    ).toBe(true);
    const page = {
      id: reference.cells[0].id,
      level: 2,
      width: 512,
      height: 512,
    };
    expect(reference.setLevels([page])).toHaveLength(1);
    expect(reference.setLevels([page])).toHaveLength(0);
    expect(new Set(digits.map((o) => o.geometry)).size).toBe(2);
    reference.dispose();
  });

  it("retains all columns/roofs as casters and encloses raised objects", () => {
    const reference = createTiledShadowReference();
    expect(reference.setCaster("columns", 12)).toHaveLength(
      reference.cells.length
    );
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
