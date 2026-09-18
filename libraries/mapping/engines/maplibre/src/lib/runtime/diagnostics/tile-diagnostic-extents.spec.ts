import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createTileDiagnosticExtents } from "./tile-diagnostic-extents";
describe("reusable diagnostic extent buffers", () => {
  const bounds = [
    new THREE.Box3(new THREE.Vector3(1, 2, 3), new THREE.Vector3(4, 6, 8)),
  ];
  const color = () => new THREE.Color("red");
  it("keeps box instances and unit geometry across snapshots and mode switches", () => {
    const pool = createTileDiagnosticExtents();
    pool.update("boxes", bounds, color);
    const box = pool.group.children.find(
      (child) => child instanceof THREE.InstancedMesh
    ) as THREE.InstancedMesh;
    const dispose = vi.fn();
    box.geometry.addEventListener("dispose", dispose);
    pool.update("none", [], color);
    expect(pool.group.visible).toBe(false);
    pool.update("boxes", bounds, color);
    expect(pool.group.children).toContain(box);
    expect(box.count).toBe(1);
    expect(dispose).not.toHaveBeenCalled();
    pool.update("boxes", [...bounds, ...bounds], color);
    const grown = pool.group.children.find(
      (child) => child instanceof THREE.InstancedMesh
    ) as THREE.InstancedMesh;
    expect(grown).not.toBe(box);
    expect(grown.geometry).toBe(box.geometry);
    expect(dispose).not.toHaveBeenCalled();
    pool.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(pool.group.children).toHaveLength(0);
  });
  it("updates edge attributes in place and draws only the current count", () => {
    const pool = createTileDiagnosticExtents();
    pool.update("edges", [...bounds, ...bounds], color);
    const edges = pool.group.children[0] as THREE.LineSegments;
    const positions = edges.geometry.getAttribute("position");
    pool.update("edges", bounds, color);
    expect(edges.geometry.getAttribute("position")).toBe(positions);
    expect(edges.geometry.drawRange.count).toBe(24);
    expect([positions.getX(0), positions.getY(0), positions.getZ(0)]).toEqual([
      1, 2, 3,
    ]);
    expect([positions.getX(1), positions.getY(1), positions.getZ(1)]).toEqual([
      4, 2, 3,
    ]);
    pool.dispose();
  });
});
