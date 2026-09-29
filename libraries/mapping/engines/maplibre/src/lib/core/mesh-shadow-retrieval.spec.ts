import { describe, expect, it } from "vitest";
import { mesh, quartet } from "./mesh-tile-test-fixtures";
import {
  excludeMeshReceiverAncestors,
  meshContentLevel,
  selectMeshShadowRetrieval,
} from "./mesh-shadow-retrieval";

describe("offscreen caster retrieval", () => {
  it("rejects every visible receiver ancestor even from a stale published caster cut", () => {
    const root = mesh();
    const {
      children: [parent, independent],
    } = quartet(root);
    const {
      children: [receiver],
    } = quartet(parent);
    const candidates = new Set([root, parent, receiver, independent]);
    expect(
      excludeMeshReceiverAncestors(candidates, new Set([receiver]))
    ).toEqual(new Set([receiver, independent]));
    expect(candidates.has(parent)).toBe(true);
  });
  it("skips intermediate payloads and irrelevant siblings, sharing visible geometry", () => {
    const root = mesh();
    const {
      children: [receiver, branch, outside, otherView],
    } = quartet(root);
    const { children: targets } = quartet(branch);
    const { children: receivers } = quartet(receiver);
    for (const tile of [branch, ...targets]) tile.internal.loadingState = 0;
    const viewport = new Set([receivers[0], otherView]);
    const required = new Set([
      root,
      branch,
      targets[0],
      targets[1],
      receiver,
      receivers[0],
    ]);
    const query = () =>
      selectMeshShadowRetrieval(
        root,
        viewport,
        new Set(),
        6,
        (tile) => ({
          intersects: required.has(tile),
          errorPixels: 6,
          receiverGeometricError: 1,
          receiverContentLevel: meshContentLevel(receivers[0]),
        }),
        (tile) => viewport.has(tile)
      );
    const pending = query();
    expect(pending.requests).toEqual(new Set(targets.slice(0, 2)));
    expect(pending.requests.has(branch)).toBe(false);
    expect(pending.requests.has(outside)).toBe(false);
    expect(pending.casters.size).toBe(0);
    targets[0].internal.loadingState = 4;
    expect(query().casters.size).toBe(0);
    targets[1].internal.loadingState = 4;
    const ready = query();
    expect(ready.converged).toBe(true);
    expect(ready.requests.size).toBe(0);
    expect(ready.casters).toEqual(new Set(targets.slice(0, 2)));
  });

  it("descends a straddling observer box to offscreen casters and prepares metadata through its owner", () => {
    const root = mesh();
    const {
      children: [receiver, branch],
    } = quartet(root);
    const children = quartet(branch).children;
    children[0].internal.loadingState = 0;
    const inView = (tile: typeof root) =>
      tile === root || tile === branch || tile === receiver;
    const demand = (tile: typeof root) => ({
      intersects: tile === root || tile === branch || tile === children[0],
      errorPixels: 6,
      receiverGeometricError: 1,
      receiverContentLevel: 1,
    });
    expect(
      selectMeshShadowRetrieval(
        root,
        new Set([receiver]),
        new Set(),
        6,
        demand,
        inView
      ).requests
    ).toEqual(new Set([children[0]]));
    // Native children have no internal state or parent until preprocessing.
    delete (children[0] as Partial<typeof root>).internal;
    children[0].parent = null;
    const pending = selectMeshShadowRetrieval(
      root,
      new Set([receiver]),
      new Set(),
      6,
      demand,
      inView
    );
    expect(pending.unpreparedParents).toEqual(new Set([branch]));
    expect(pending.converged).toBe(false);
  });
});
