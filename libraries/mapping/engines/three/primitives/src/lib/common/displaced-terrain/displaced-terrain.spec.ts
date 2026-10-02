import { describe, expect, it, vi } from "vitest";
import {
  BufferAttribute,
  BufferGeometry,
  Box3,
  DataArrayTexture,
  Group,
  InstancedMesh,
  Material,
  Mesh,
  MeshDepthMaterial,
  MeshPhongMaterial,
  MeshLambertMaterial,
  MeshBasicMaterial,
  Raycaster,
  Scene,
  ShaderLib,
  Vector3,
} from "three";
import { canInstanceTerrainMesh, sameTerrainTopology } from "./eligibility";
import { createDisplacedTerrainPresentation } from "./displaced-terrain-presentation";
import {
  packTerrainVertices,
  terrainTextureLayout,
  unpackTerrainVertex,
} from "./packing";
import { applyTerrainVertexPulling } from "./shaders";

const tileGeometry = () => {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(
      new Float32Array([0, 0, 0, 1, 0, 0.25, 0, 1, 0.5, 1, 1, 0.75]),
      3
    )
  );
  geometry.setAttribute(
    "normal",
    new BufferAttribute(
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
      3
    )
  );
  geometry.setAttribute(
    "uv",
    new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2)
  );
  geometry.setIndex([0, 1, 2, 1, 3, 2]);
  return geometry;
};
const fixture = () => {
  const source = new Scene();
  const target = new Scene();
  const material = new MeshPhongMaterial();
  const tiles = Array.from({ length: 3 }, (_, index) => {
    const tile = new Mesh(tileGeometry(), material);
    tile.position.set(index + 0.123456789, 0, 0);
    tile.castShadow = tile.receiveShadow = true;
    source.add(tile);
    return tile;
  });
  return { source, target, tiles, material };
};
const batchIn = (scene: Scene) =>
  scene.children[0].children[0] as InstancedMesh;

// Representation checks use prepared buffers only; no terrain download or WebGL context.
describe("prepared terrain displacement", () => {
  it("packs every position and normal bit without per-vertex views or quantization", () => {
    const geometry = tileGeometry();
    const position = geometry.getAttribute("position") as BufferAttribute;
    const bits = new Uint32Array(position.array.buffer);
    bits[0] = 0x80000000; // signed zero
    bits[1] = 0x7fc01234; // payload verifies a bit copy, not JS-number re-encoding
    const layout = terrainTextureLayout(position.count)!;
    const data = new Float32Array(layout.floatsPerLayer * 2);
    packTerrainVertices(geometry, data, layout, 1);
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const unpacked = unpackTerrainVertex(data, layout, vertex, 1);
      expect(new Uint32Array(unpacked.position.buffer)).toEqual(
        bits.slice(vertex * 3, vertex * 3 + 3)
      );
      const normal = geometry.getAttribute("normal").array as Float32Array;
      expect(unpacked.normal).toEqual(normal.slice(vertex * 3, vertex * 3 + 3));
    }
    expect(
      data.slice(0, layout.floatsPerLayer).every((value) => value === 0)
    ).toBe(true);
    expect(terrainTextureLayout(1, 1)).toBeUndefined();
  });

  it.each(["phong", "depth", "distance"] as const)(
    "uses identical prepared displacement in the %s pass with one fetch pair",
    (pass) => {
      const shader = {
        vertexShader: ShaderLib[pass].vertexShader,
        uniforms: {},
      };
      const layout = terrainTextureLayout(4)!;
      const texture = new DataArrayTexture(
        new Float32Array(layout.floatsPerLayer),
        layout.width,
        layout.height,
        1
      );
      applyTerrainVertexPulling(shader, texture, layout);
      expect(shader.vertexShader).toContain(
        "vec3 transformed = terrainPreparedPosition;"
      );
      expect(
        shader.vertexShader.match(
          /terrainVertex\(terrainPreparedPosition, terrainPreparedNormal\)/g
        )
      ).toHaveLength(1);
      expect(shader.vertexShader).toContain("component % 4 == 0");
      expect(shader.uniforms).toMatchObject({
        terrainVertices: { value: texture },
      });
    }
  );

  it("keeps custom shaders, mirrored transforms and unsupported attributes on their original representation", () => {
    const { tiles } = fixture();
    const tile = tiles[0];
    expect(canInstanceTerrainMesh(tile)).toBe(true);
    tile.customDepthMaterial = new MeshDepthMaterial();
    expect(canInstanceTerrainMesh(tile)).toBe(false);
    tile.customDepthMaterial = undefined;
    tile.geometry.setAttribute(
      "color",
      new BufferAttribute(new Float32Array(12), 3)
    );
    expect(canInstanceTerrainMesh(tile)).toBe(false);
    tile.geometry.deleteAttribute("color");
    tile.scale.x = -1;
    tile.updateMatrixWorld();
    expect(canInstanceTerrainMesh(tile)).toBe(false);
    tile.scale.x = 1;
    tile.updateMatrixWorld();
    tile.matrixWorld.elements[4] = 0.5;
    expect(canInstanceTerrainMesh(tile)).toBe(false);
    tile.matrixWorld.identity();
    (tile.material as Material).onBeforeCompile = () => undefined;
    expect(canInstanceTerrainMesh(tile)).toBe(false);
  });

  it("does not share different diagonals or UV topology", () => {
    const { tiles } = fixture();
    expect(sameTerrainTopology(tiles[0], tiles[1])).toBe(true);
    tiles[1].geometry.setIndex([0, 1, 3, 0, 3, 2]);
    expect(sameTerrainTopology(tiles[0], tiles[1])).toBe(false);
    tiles[1].geometry = tileGeometry();
    (tiles[1].geometry.getAttribute("uv") as BufferAttribute).setX(0, 0.125);
    expect(sameTerrainTopology(tiles[0], tiles[1])).toBe(false);
  });

  it("uploads only changed prepared layers and leaves a static fractional-transform view unchanged", () => {
    const { source, target, tiles } = fixture();
    const presentation = createDisplacedTerrainPresentation(source, target);
    expect(presentation.update()).toMatchObject({
      tiles: 3,
      instancedTiles: 3,
      fallbackTiles: 0,
      batches: 1,
    });
    expect(presentation.update().uploadedBytes).toBe(0);
    const normal = tiles[1].geometry.getAttribute("normal") as BufferAttribute;
    normal.setX(0, 0.125);
    normal.needsUpdate = true;
    expect(presentation.update().uploadedBytes).toBe(
      terrainTextureLayout(4)!.floatsPerLayer * 4
    );
    expect(presentation.update().uploadedBytes).toBe(0);
    const position = tiles[2].geometry.getAttribute(
      "position"
    ) as BufferAttribute;
    position.setZ(3, 5);
    position.needsUpdate = true;
    presentation.update();
    expect(batchIn(target).boundingBox!.max.z).toBe(5);
    tiles[1].geometry.index!.needsUpdate = true;
    expect(presentation.update().uploadedBytes).toBeGreaterThan(0);
    presentation.dispose();
  });

  it("culls with actual displaced bounds and uses a small RTC origin for large ECEF translations", () => {
    const { source, target, tiles } = fixture();
    for (const tile of tiles) tile.position.x += 6_300_000;
    const presentation = createDisplacedTerrainPresentation(source, target);
    presentation.update();
    const batch = batchIn(target);
    target.updateMatrixWorld(true);
    const expected = new Box3();
    for (const tile of tiles) expected.union(new Box3().setFromObject(tile));
    const actual = batch.boundingBox!.clone().applyMatrix4(batch.matrixWorld);
    expect(actual.min.distanceTo(expected.min)).toBeLessThan(1e-8);
    expect(actual.max.distanceTo(expected.max)).toBeLessThan(1e-8);
    expect(Math.abs(batch.instanceMatrix.array[12])).toBeLessThan(3);
    expect(batch.castShadow && batch.receiveShadow).toBe(true);
    expect(batch.customDepthMaterial).toBeInstanceOf(MeshDepthMaterial);
    presentation.dispose();
  });

  it("delegates picking to source geometry and releases only owned rendering resources", () => {
    const { source, target, tiles } = fixture();
    const presentation = createDisplacedTerrainPresentation(source, target);
    presentation.update();
    const batch = batchIn(target);
    let sourceDisposed = false;
    let sharedDisposed = false;
    tiles[0].geometry.addEventListener("dispose", () => {
      sourceDisposed = true;
    });
    batch.geometry.addEventListener("dispose", () => {
      sharedDisposed = true;
    });
    const ray = new Raycaster(new Vector3(0.4, 0.3, 10), new Vector3(0, 0, -1));
    const hits = ray.intersectObject(batch);
    expect(hits[0].object).toBe(tiles[0]);
    presentation.dispose();
    presentation.dispose();
    expect(target.children).toHaveLength(0);
    expect(sharedDisposed).toBe(true);
    expect(sourceDisposed).toBe(false);
    expect(source.children).toHaveLength(3);
  });

  it("retains unaffected pages when another tile family arrives or leaves", () => {
    const { source, target, material } = fixture();
    const presentation = createDisplacedTerrainPresentation(source, target);
    presentation.update();
    const retained = batchIn(target);
    const otherFamily = new Group();
    for (let index = 0; index < 2; index += 1) {
      const tile = new Mesh(tileGeometry(), material);
      tile.receiveShadow = true;
      tile.position.x = index + 5;
      otherFamily.add(tile);
    }
    source.add(otherFamily);
    const arrived = presentation.update();
    expect(arrived.batches).toBe(2);
    expect(target.children[0].children).toContain(retained);
    expect(arrived.uploadedBytes).toBe(
      2 * terrainTextureLayout(4)!.floatsPerLayer * 4 + 2 * 64
    );
    source.remove(otherFamily);
    expect(presentation.update().uploadedBytes).toBe(0);
    expect(batchIn(target)).toBe(retained);
    presentation.dispose();
  });

  it("rejects overlapping rendering trees and falls back for relative shears", () => {
    const { source, target } = fixture();
    expect(() => createDisplacedTerrainPresentation(source, source)).toThrow(
      RangeError
    );
    const child = new Group();
    source.add(child);
    expect(() => createDisplacedTerrainPresentation(source, child)).toThrow(
      RangeError
    );
    target.scale.set(2, 1, 1);
    target.rotation.z = Math.PI / 4;
    const presentation = createDisplacedTerrainPresentation(source, target);
    expect(presentation.update()).toMatchObject({
      instancedTiles: 0,
      fallbackTiles: 3,
    });
    presentation.dispose();
  });

  it("bounds each texture page and preserves fallback meshes and source visibility", () => {
    const { source, target, tiles } = fixture();
    tiles[0].customDepthMaterial = new MeshDepthMaterial();
    const group = new Group();
    source.add(group);
    group.add(tiles[2]);
    const presentation = createDisplacedTerrainPresentation(source, target, {
      tilesPerBatch: 2,
    });
    expect(presentation.update()).toMatchObject({
      batches: 1,
      instancedTiles: 2,
      fallbackTiles: 1,
    });
    const clone = target.children[0].children.find(
      (object) => !(object instanceof InstancedMesh)
    ) as Mesh;
    expect(clone.geometry).toBe(tiles[0].geometry);
    expect(clone.customDepthMaterial).toBe(tiles[0].customDepthMaterial);
    group.visible = false;
    expect(presentation.update()).toMatchObject({
      tiles: 2,
      instancedTiles: 0,
      fallbackTiles: 2,
    });
    expect(tiles[0].visible).toBe(true);
    presentation.dispose();
  });
});

describe("shared terrain runtime materials", () => {
  it.each([MeshLambertMaterial, MeshBasicMaterial])(
    "batches runtime surfaces and retains composed render hooks",
    (MaterialType) => {
      const { source, target, tiles } = fixture();
      const material = new MaterialType();
      tiles.forEach((tile) => {
        tile.material = material;
        tile.userData.isShadowTerrainSurface = true;
      });
      const presentation = createDisplacedTerrainPresentation(source, target);
      expect(presentation.update().instancedTiles).toBe(3);
      const batch = batchIn(target);
      expect(batch.userData.isShadowTerrainSurface).toBe(true);
      const surface = batch.material as Material;
      const hook = surface.onBeforeCompile;
      surface.onBeforeCompile = (shader, renderer) => hook(shader, renderer);
      const composed = surface.onBeforeCompile;
      surface.userData.liveUniform = { value: 1 };
      surface.defines = { ...surface.defines, CARMA_MAP_STYLE_PROJECTED: 1 };
      presentation.update();
      expect(surface.onBeforeCompile).toBe(composed);
      expect(surface.userData.liveUniform).toEqual({ value: 1 });
      expect(surface.defines?.CARMA_MAP_STYLE_PROJECTED).toBe(1);
      expect(canInstanceTerrainMesh(tiles[0])).toBe(true);
      presentation.dispose();
    }
  );

  it("owns fallback materials so a first tile can later join a compatible batch", () => {
    const { source, target, tiles, material } = fixture();
    source.remove(tiles[1], tiles[2]);
    const presentation = createDisplacedTerrainPresentation(source, target);
    expect(presentation.update().fallbackTiles).toBe(1);
    const fallback = target.children[0].children[0] as Mesh;
    expect(fallback.material).not.toBe(material);
    const version = (fallback.material as Material).version;
    material.needsUpdate = true;
    presentation.update();
    expect((fallback.material as Material).version).toBeGreaterThan(version);
    const dispose = vi.spyOn(fallback.material as Material, "dispose");
    (fallback.material as Material).onBeforeCompile = () => {};
    expect(canInstanceTerrainMesh(tiles[0])).toBe(true);
    source.add(tiles[1], tiles[2]);
    expect(presentation.update().instancedTiles).toBe(3);
    expect(dispose).toHaveBeenCalledTimes(1);
    presentation.dispose();
  });
});
