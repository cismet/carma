import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  FrontSide,
  Vector3,
} from "three";
import { createThreeTilesSurfaces } from "./three-tiles-runtime-surfaces";
import { normalizeSeparatedSurfaceParts } from "../../core/separated-surface-normalization";
import { runMeshPreparationTask } from "./mesh-preparation-client";

vi.mock("./mesh-preparation-client", () => ({
  runMeshPreparationTask: vi.fn(),
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const fixture = () => {
  const state = {
    separatedSurfaceRenderSides: new WeakMap(),
    normalizedSeparatedSurfaceGeometries: new WeakSet(),
  };
  const services = createThreeTilesSurfaces(state);
  const root = new Group();
  const points = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const faces = [
    [[1, 3, 2]],
    [
      [0, 2, 1],
      [0, 1, 3],
      [0, 2, 3],
    ],
  ];
  const geometries = faces.map((part, i) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(
        part.flatMap((face) => face.flatMap((index) => points[index])),
        3
      )
    );
    geometry.setAttribute(
      "_feature_id_0",
      new Float32BufferAttribute(
        part.flatMap(() => [0, 0, 0]),
        1
      )
    );
    geometry.setIndex(
      part.flatMap((_, index) => [index * 3, index * 3 + 1, index * 3 + 2])
    );
    root.add(
      new Mesh(
        geometry,
        new MeshStandardMaterial({ name: i ? "wall" : "roof" })
      )
    );
    return geometry;
  });
  let finish!: () => void;
  vi.mocked(runMeshPreparationTask).mockImplementation(
    (task) =>
      new Promise((resolve) => {
        if (task.kind !== "surfaces") throw new Error("Expected surface task");
        finish = () =>
          resolve({
            kind: "surfaces",
            data: normalizeSeparatedSurfaceParts(task.parts),
          });
      })
  );
  return { state, services, root, geometries, finish: () => finish() };
};

describe("surface preparation before native publication", () => {
  it("publishes normals and outward winding together only after worker preparation", async () => {
    const f = fixture();
    const before = f.geometries.map((g) => [...g.getIndex()!.array]);
    const loading = f.services.normalizeSeparatedBuildingSurfaces(f.root);
    expect(f.geometries.map((g) => [...g.getIndex()!.array])).toEqual(before);
    expect(f.geometries.every((g) => !g.hasAttribute("normal"))).toBe(true);
    await vi.waitFor(() =>
      expect(runMeshPreparationTask).toHaveBeenCalledOnce()
    );
    f.finish();
    await loading;
    let volume = 0;
    for (const geometry of f.geometries) {
      const positions = geometry.getAttribute("position"),
        normals = geometry.getAttribute("normal"),
        indices = geometry.getIndex()!;
      for (let i = 0; i < indices.count; i += 3) {
        const a = new Vector3().fromBufferAttribute(positions, indices.getX(i));
        const b = new Vector3().fromBufferAttribute(
          positions,
          indices.getX(i + 1)
        );
        const c = new Vector3().fromBufferAttribute(
          positions,
          indices.getX(i + 2)
        );
        const normal = new Vector3().fromBufferAttribute(
          normals,
          indices.getX(i)
        );
        expect(
          b.clone().sub(a).cross(c.clone().sub(a)).dot(normal)
        ).toBeGreaterThan(0);
        volume += a.dot(b.cross(c)) / 6;
      }
      expect(f.state.normalizedSeparatedSurfaceGeometries.has(geometry)).toBe(
        true
      );
    }
    expect(volume).toBeCloseTo(1 / 6);
    for (const child of f.root.children)
      expect(
        f.services.resolveRenderSide(
          (child as Mesh).material as MeshStandardMaterial
        )
      ).toBe(FrontSide);
  });

  it.each([
    "abort",
    "dispose",
    "replaced-index",
    "changed-position",
    "replaced-material",
  ])(
    "does not modify any geometry when %s invalidates pending work",
    async (reason) => {
      const f = fixture(),
        controller = new AbortController();
      const before = [...f.geometries[0].getIndex()!.array];
      const loading = f.services.normalizeSeparatedBuildingSurfaces(f.root, {
        signal: controller.signal,
      });
      const rejected = expect(loading).rejects.toMatchObject({
        name: "AbortError",
      });
      await vi.waitFor(() =>
        expect(runMeshPreparationTask).toHaveBeenCalledOnce()
      );
      if (reason === "abort") controller.abort();
      if (reason === "dispose") f.geometries[1].dispose();
      if (reason === "replaced-index")
        f.geometries[1].setIndex([...f.geometries[1].getIndex()!.array]);
      if (reason === "replaced-material")
        (f.root.children[1] as Mesh).material = new MeshStandardMaterial({
          name: "wall",
        });
      if (reason === "changed-position")
        f.geometries[1].getAttribute("position").needsUpdate = true;
      f.finish();
      await rejected;
      expect([...f.geometries[0].getIndex()!.array]).toEqual(before);
      expect(f.geometries.every((g) => !g.hasAttribute("normal"))).toBe(true);
      expect(
        f.geometries.every(
          (g) => !f.state.normalizedSeparatedSurfaceGeometries.has(g)
        )
      ).toBe(true);
    }
  );

  it("rejects mutations during snapshot yields before dispatching worker work", async () => {
    const f = fixture();
    let time = 0;
    vi.spyOn(performance, "now").mockImplementation(() => (time += 3));
    const loading = f.services.normalizeSeparatedBuildingSurfaces(f.root);
    const rejected = expect(loading).rejects.toMatchObject({
      name: "AbortError",
    });
    f.geometries[0].getAttribute("position").needsUpdate = true;
    await rejected;
    expect(runMeshPreparationTask).not.toHaveBeenCalled();
    expect(f.geometries.every((g) => !g.hasAttribute("normal"))).toBe(true);
  });

  it("deduplicates preparation while giving another caller independent cancellation", async () => {
    const f = fixture(),
      caller = new AbortController();
    const first = f.services.normalizeSeparatedBuildingSurfaces(f.root);
    const second = f.services.normalizeSeparatedBuildingSurfaces(f.root, {
      signal: caller.signal,
    });
    const cancelled = expect(second).rejects.toMatchObject({
      name: "AbortError",
    });
    caller.abort();
    await cancelled;
    await vi.waitFor(() =>
      expect(runMeshPreparationTask).toHaveBeenCalledOnce()
    );
    f.finish();
    await first;
    expect(f.geometries.every((g) => g.hasAttribute("normal"))).toBe(true);
  });
});
