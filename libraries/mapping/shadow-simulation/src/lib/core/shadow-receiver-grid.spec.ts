import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  buildShadowReceiverGrid,
  buildShadowReceiverNeighbourRing,
} from "./shadow-receiver-grid";

describe("map shadow receiver grid", () => {
  it("covers negative coordinates, elevated roofs and exact cell edges without overlapping interiors", () => {
    const bounds = new THREE.Box3(
      new THREE.Vector3(-32, -5, -100),
      new THREE.Vector3(128, 315, 230)
    );
    const cells = buildShadowReceiverGrid(bounds);
    expect(cells.length).toBeLessThanOrEqual(25);
    for (let x = bounds.min.x; x <= bounds.max.x; x += 5) {
      for (let z = bounds.min.z; z <= bounds.max.z; z += 5) {
        expect(
          cells.some(({ bounds: b }) =>
            b.containsPoint(new THREE.Vector3(x, 315, z))
          )
        ).toBe(true);
      }
    }
    for (let a = 0; a < cells.length; a += 1) {
      for (let b = a + 1; b < cells.length; b += 1) {
        const overlap = cells[a].bounds
          .clone()
          .intersect(cells[b].bounds)
          .getSize(new THREE.Vector3());
        expect(overlap.x * overlap.z).toBe(0);
      }
    }
  });

  it("keeps shared cell identities/projections on pans and bounds wide-view work", () => {
    const bounds = new THREE.Box3(
      new THREE.Vector3(-100, 120, 200),
      new THREE.Vector3(100, 190, 400)
    );
    const before = buildShadowReceiverGrid(bounds);
    const after = buildShadowReceiverGrid(
      bounds.clone().translate(new THREE.Vector3(0.1, 0, 0.1))
    );
    for (const cell of before) {
      const next = after.find(({ id }) => cell.id === id);
      if (next) expect(next.bounds).toEqual(cell.bounds);
    }
    expect(
      buildShadowReceiverGrid(
        new THREE.Box3(
          new THREE.Vector3(-4000, 0, -4000),
          new THREE.Vector3(4000, 600, 4000)
        )
      ).length
    ).toBeLessThanOrEqual(25);
    expect(buildShadowReceiverGrid(new THREE.Box3())).toEqual([]);
  });

  it("warms a bounded ring in all directions with future foreground identities", () => {
    const cells = buildShadowReceiverGrid(
      new THREE.Box3(
        new THREE.Vector3(-100, 120, -100),
        new THREE.Vector3(100, 190, 100)
      )
    );
    const ring = buildShadowReceiverNeighbourRing(cells);
    expect(ring).toHaveLength(16);
    expect(new Set(ring.map(({ id }) => id)).size).toBe(16);
    expect(ring.every(({ id }) => cells.every((cell) => cell.id !== id))).toBe(
      true
    );
    const sectors = new Set(
      ring.map(({ bounds }) => {
        const center = bounds.getCenter(new THREE.Vector3());
        return (
          (Math.round(Math.atan2(center.z, center.x) / (Math.PI / 4)) + 8) % 8
        );
      })
    );
    expect(sectors.size).toBe(8);
    for (const candidate of ring) {
      const center = candidate.bounds.getCenter(new THREE.Vector3());
      const later = buildShadowReceiverGrid(
        new THREE.Box3(
          center.clone().addScalar(-1),
          center.clone().addScalar(1)
        )
      );
      expect(
        later.some(
          ({ id, bounds }) =>
            id === candidate.id && bounds.equals(candidate.bounds)
        )
      ).toBe(true);
    }
    expect(buildShadowReceiverNeighbourRing(cells, 0)).toEqual([]);
    expect(buildShadowReceiverNeighbourRing([], 16)).toEqual([]);
    expect(buildShadowReceiverNeighbourRing(cells, 1)).toHaveLength(1);
  });
});
