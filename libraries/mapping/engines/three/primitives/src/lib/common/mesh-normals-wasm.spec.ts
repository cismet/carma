import { BufferAttribute, BufferGeometry } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  prepareMeshVertexNormalsWasm,
  tryComputeMeshVertexNormalsWasm,
} from "./mesh-normals-wasm";
import { computeMeshVertexNormals } from "./mesh-helpers";

describe("exact worker WASM normals", () => {
  afterEach(() => vi.restoreAllMocks());

  it("initializes once per worker realm", async () => {
    const first = prepareMeshVertexNormalsWasm();
    expect(prepareMeshVertexNormalsWasm()).toBe(first);
    await expect(first).resolves.toBe(true);
  });

  it.each([Uint16Array, Uint32Array])(
    "matches Three, including empty and degenerate faces (%s)",
    async (Index) => {
      await prepareMeshVertexNormalsWasm();
      for (const indices of [[], [0, 0, 0], [0, 2, 1, 1, 2, 3]]) {
        const geometry = new BufferGeometry();
        geometry.setAttribute(
          "position",
          new BufferAttribute(
            new Float32Array([
              0, 312.125, 0, 0.73, 312.39, 0, 0, 312.441, 0.73, 0.73, 313.222,
              0.73,
            ]),
            3
          )
        );
        geometry.setIndex(new BufferAttribute(new Index(indices), 1));
        const reference = geometry.clone();
        reference.computeVertexNormals();
        const normals = new Float32Array(12).fill(11);
        expect(
          tryComputeMeshVertexNormalsWasm(
            geometry.getAttribute("position").array as Float32Array,
            new Index(indices),
            normals
          )
        ).toBe(true);
        expect(normals).toEqual(reference.getAttribute("normal").array);
        geometry.setAttribute("normal", new BufferAttribute(normals, 3));
        computeMeshVertexNormals(geometry);
        expect(geometry.getAttribute("normal").array).toBe(normals);
        expect(normals).toEqual(reference.getAttribute("normal").array);
      }
    }
  );

  it("grows scratch memory and preserves large indices, then reuses it for smaller tiles", async () => {
    await prepareMeshVertexNormalsWasm();
    for (const count of [65_538, 3, 264_196, 3]) {
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i += 1)
        positions.set([i % 514, Math.sin(i) * 19, i / 514], i * 3);
      const indices = new Uint32Array([0, count - 1, count - 2]);
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(positions, 3));
      geometry.setIndex(new BufferAttribute(indices, 1));
      geometry.computeVertexNormals();
      const normals = new Float32Array(positions.length);
      expect(tryComputeMeshVertexNormalsWasm(positions, indices, normals)).toBe(
        true
      );
      expect(normals).toEqual(geometry.getAttribute("normal").array);
    }
  });

  it("fails closed once when CSP blocks compilation, leaving JS available", async () => {
    vi.resetModules();
    vi.spyOn(WebAssembly, "instantiate").mockRejectedValue(new Error("CSP"));
    const isolated = await import("./mesh-normals-wasm");
    await expect(isolated.prepareMeshVertexNormalsWasm()).resolves.toBe(false);
    await expect(isolated.prepareMeshVertexNormalsWasm()).resolves.toBe(false);
    expect(WebAssembly.instantiate).toHaveBeenCalledTimes(1);
    expect(
      isolated.tryComputeMeshVertexNormalsWasm(
        new Float32Array(9),
        new Uint16Array([0, 1, 2]),
        new Float32Array(9)
      )
    ).toBe(false);
  });
});
