import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  buildShadowReceiverCells,
  buildShadowReceiverGrid,
  buildShadowReceiverNeighbourRing,
  getVisibleShadowReceiverCorners,
} from "./shadow-receiver-grid";
import { planShadowReceiverPages } from "./shadow-page-plan";

const receiverTile = (
  id: string,
  minimum: [number, number, number],
  maximum: [number, number, number]
) => ({
  id,
  bounds: new THREE.Box3(
    new THREE.Vector3(...minimum),
    new THREE.Vector3(...maximum)
  ),
});

/** Test every elementary rectangle, including micron-width remainders that a
 * regular sample grid would miss. Source overlap must have exactly one owner.
 */
const expectExactReceiverCoverage = (
  sources: readonly ReturnType<typeof receiverTile>[],
  cells: readonly ReturnType<typeof receiverTile>[]
) => {
  const edges = (axis: "x" | "z") =>
    [
      ...new Set(
        [...sources, ...cells].flatMap(({ bounds }) => [
          bounds.min[axis],
          bounds.max[axis],
        ])
      ),
    ].sort((a, b) => a - b);
  const x = edges("x");
  const z = edges("z");
  const contains = (bounds: THREE.Box3, px: number, pz: number) =>
    bounds.min.x < px &&
    bounds.max.x > px &&
    bounds.min.z < pz &&
    bounds.max.z > pz;
  for (let i = 1; i < x.length; i += 1) {
    for (let j = 1; j < z.length; j += 1) {
      const px = (x[i - 1] + x[i]) / 2;
      const pz = (z[j - 1] + z[j]) / 2;
      const original = sources.filter(({ bounds }) => contains(bounds, px, pz));
      const owners = cells.filter(({ bounds }) => contains(bounds, px, pz));
      expect(owners).toHaveLength(original.length > 0 ? 1 : 0);
      for (const { bounds } of original) {
        expect(owners[0].bounds.min.y).toBeLessThanOrEqual(bounds.min.y);
        expect(owners[0].bounds.max.y).toBeGreaterThanOrEqual(bounds.max.y);
      }
    }
  }
};

describe("source-tile receiver ownership", () => {
  it("fetches full visible edge cells without promoting offscreen cells or inventing empty coverage", () => {
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.set(0, 10, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const edge = receiverTile("edge", [0.5, 0, -0.5], [20, 1, 0.5]);
    const offscreen = receiverTile("offscreen", [100, 0, 100], [110, 1, 110]);
    const points = getVisibleShadowReceiverCorners([edge, offscreen], camera);
    expect(points).toHaveLength(8);
    expect(new THREE.Box3().setFromPoints([...points])).toEqual(edge.bounds);
    expect(getVisibleShadowReceiverCorners([offscreen], camera)).toEqual([]);
    expect(getVisibleShadowReceiverCorners([], camera)).toEqual([]);
  });

  it("retains full tile identities and bounds across observer moves and pitches", () => {
    const tiles = [
      receiverTile("dem:16/1/2", [-10, 103, -10], [0, 147, 0]),
      receiverTile("dem:16/2/2", [0, 98, -10], [10, 157, 0]),
    ];
    const cells = buildShadowReceiverCells(tiles);
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);
    for (const position of [
      [5, 180, 80],
      [-5, 160, 95],
      [5, 210, 45],
    ]) {
      camera.position.set(...(position as [number, number, number]));
      camera.lookAt(0, 120, -5);
      camera.updateMatrixWorld(true);
      const planned = planShadowReceiverPages(
        cells,
        camera,
        new THREE.Vector2(1440, 1440),
        0.5
      );
      expect(planned.map(({ id, bounds }) => ({ id, bounds }))).toEqual(cells);
    }
    expect(cells.map(({ bounds }) => bounds)).toEqual(
      tiles.map(({ bounds }) => bounds)
    );
    expect(buildShadowReceiverCells([...tiles].reverse())).toEqual(cells);
  });

  it("partitions overlapping native boxes without gaps or doubled ownership", () => {
    const tiles = [
      receiverTile("a", [0, 0, 0], [10, 10, 10]),
      receiverTile("b", [-5, 5, -5], [15, 40, 15]),
      receiverTile("roof", [2, 100, 2], [8, 120, 8]),
    ];
    const cells = buildShadowReceiverCells(tiles);
    const area = cells.reduce(
      (sum, { bounds }) =>
        sum + (bounds.max.x - bounds.min.x) * (bounds.max.z - bounds.min.z),
      0
    );
    expect(area).toBe(400);
    for (let x = -4.5; x < 15; x += 1) {
      for (let z = -4.5; z < 15; z += 1) {
        const owners = cells.filter(
          ({ bounds }) =>
            x >= bounds.min.x &&
            x < bounds.max.x &&
            z >= bounds.min.z &&
            z < bounds.max.z
        );
        expect(owners).toHaveLength(1);
        for (const { bounds } of tiles) {
          if (
            x >= bounds.min.x &&
            x < bounds.max.x &&
            z >= bounds.min.z &&
            z < bounds.max.z
          ) {
            expect(owners[0].bounds.min.y).toBeLessThanOrEqual(bounds.min.y);
            expect(owners[0].bounds.max.y).toBeGreaterThanOrEqual(bounds.max.y);
          }
        }
      }
    }
    expect(buildShadowReceiverCells([...tiles].reverse())).toEqual(cells);
  });

  it.each([0.000024, 0.01])(
    "absorbs %sm full-edge scraps without removing coverage or receiver heights",
    (width) => {
      const tiles = [
        receiverTile("a", [0, 0, 0], [10, 10, 10]),
        receiverTile("b", [-width, -5, -width], [10 + width, 40, 10 + width]),
      ];
      const cells = buildShadowReceiverCells(tiles);
      expect(cells).toHaveLength(1);
      expect(cells[0].id).toBe("a");
      expect(cells[0].bounds).toEqual(tiles[1].bounds);
      expectExactReceiverCoverage(tiles, cells);
      expect(buildShadowReceiverCells([...tiles].reverse())).toEqual(cells);
      expect(tiles[0].bounds).toEqual(
        receiverTile("a", [0, 0, 0], [10, 10, 10]).bounds
      );

      const offset = new THREE.Vector3(1000, -37, -8000);
      const translated = tiles.map(({ id, bounds }) => ({
        id,
        bounds: bounds.clone().translate(offset),
      }));
      const rebased = buildShadowReceiverCells(translated);
      expect(rebased.map(({ id }) => id)).toEqual(cells.map(({ id }) => id));
      expect(rebased[0].bounds).toEqual(
        cells[0].bounds.clone().translate(offset)
      );
      expectExactReceiverCoverage(translated, rebased);
    }
  );

  it("also absorbs scraps below one percent of a large source width", () => {
    const tiles = [
      receiverTile("a", [0, 0, 0], [100, 1, 100]),
      receiverTile("b", [0, -2, -0.5], [100, 20, 100.5]),
    ];
    const cells = buildShadowReceiverCells(tiles);
    expect(cells).toHaveLength(1);
    expect(cells[0].id).toBe("a");
    expectExactReceiverCoverage(tiles, cells);
  });

  it("keeps partial-edge scraps when their union is not a rectangle", () => {
    const tiles = [
      receiverTile("a", [0, 0, 0], [10, 1, 10]),
      receiverTile("b", [-0.01, -2, 0], [5, 20, 5]),
    ];
    const cells = buildShadowReceiverCells(tiles);
    expect(cells).toHaveLength(2);
    expectExactReceiverCoverage(tiles, cells);
  });

  it("does not combine genuinely narrow native source tiles", () => {
    const tiles = [
      receiverTile("a", [0, 0, 0], [0.01, 1, 10]),
      receiverTile("b", [0.01, 0, 0], [10, 1, 10]),
    ];
    const cells = buildShadowReceiverCells(tiles);
    expect(cells.map(({ id }) => id)).toEqual(["a", "b"]);
    expectExactReceiverCoverage(tiles, cells);
  });

  it("does not rename a tile on height refinement or unrelated tile arrival", () => {
    const tile = receiverTile("dem:16/1/2", [0, 10, 0], [10, 20, 10]);
    const initial = buildShadowReceiverCells([tile]);
    const refined = receiverTile(tile.id, [0, 9.99, 0], [10, 20.01, 10]);
    const distant = receiverTile(
      "a-distant",
      [1000, -50, 1000],
      [2000, 999, 2000]
    );
    const after = buildShadowReceiverCells([distant, refined]);
    expect(after.find(({ id }) => id === initial[0].id)?.bounds).toEqual(
      refined.bounds
    );
    expect(tile.bounds.min.y).toBe(10);
    expect(tile.bounds.max.y).toBe(20);
  });

  it("keeps unsplit source IDs and split topology IDs across scene-origin changes", () => {
    const tiles = [
      receiverTile("a", [0, 0, 0], [10, 10, 10]),
      receiverTile("b", [-5, 0, -5], [15, 20, 15]),
    ];
    const initial = buildShadowReceiverCells(tiles);
    const offset = new THREE.Vector3(1000, -37, -8000);
    const rebased = buildShadowReceiverCells(
      tiles.map(({ id, bounds }) => ({
        id,
        bounds: bounds.clone().translate(offset),
      }))
    );
    expect(initial[0].id).toBe("a");
    expect(initial.slice(1).map(({ id }) => JSON.parse(id))).toEqual([
      ["b", "a", "west"],
      ["b", "a", "east"],
      ["b", "a", "south"],
      ["b", "a", "north"],
    ]);
    expect(rebased.map(({ id }) => id)).toEqual(initial.map(({ id }) => id));
    expect(rebased.map(({ bounds }) => bounds)).toEqual(
      initial.map(({ bounds }) => bounds.clone().translate(offset))
    );
  });

  it("does not double-cover shared edges or discard receiver pages above a viewport-grid cap", () => {
    const tiles = Array.from({ length: 70 }, (_, x) =>
      receiverTile(`tile-${x}`, [x, 0, 0], [x + 1, 1, 1])
    );
    const cells = buildShadowReceiverCells(tiles);
    expect(cells).toHaveLength(70);
    expect(new Set(cells.map(({ id }) => id)).size).toBe(70);
    expect(buildShadowReceiverCells([])).toEqual([]);
  });

  it("rejects ambiguous identities and invalid bounds instead of dropping surfaces", () => {
    const tile = receiverTile("a", [0, 0, 0], [1, 1, 1]);
    expect(() => buildShadowReceiverCells([tile, tile])).toThrow(RangeError);
    expect(() =>
      buildShadowReceiverCells([{ id: "empty", bounds: new THREE.Box3() }])
    ).toThrow(RangeError);
    expect(() =>
      buildShadowReceiverCells([
        receiverTile("infinite", [0, 0, 0], [Infinity, 1, 1]),
      ])
    ).toThrow(RangeError);
  });
});

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
