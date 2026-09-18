import { describe, expect, it } from "vitest";
import {
  BufferGeometry,
  BufferAttribute,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from "three";
import type { Tile } from "3d-tiles-renderer/core";
import { degToRad, type Degrees } from "@carma-units";
import { cartographicToEcef, ecefToEnuMatrix } from "@carma-geo/proj";
import {
  createMeshMercatorLut,
  createMeshLocalProjection,
  MESH_PROJECTION_METHOD,
  MESH_PROJECTION_ACCURACY,
  MESH_PROJECTION_SAMPLING,
  type MeshMercatorLutOptions,
  projectMeshLocalToMercatorExact,
} from "@carma-geo/utils";
import { TilesetMercatorProjectionPlugin } from "./tileset-mercator-projection-plugin";

const options = {
  longitudeDegrees: 7.18,
  latitudeDegrees: 51.26,
  halfExtentMeters: 24000,
  gridStepMeters: 250,
};
const fixture = async (overrides: Partial<MeshMercatorLutOptions> = {}) => {
  const lut = await createMeshMercatorLut(
    { ...options, ...overrides },
    async () => {}
  );
  const enu = ecefToEnuMatrix(
    cartographicToEcef(
      degToRad(options.longitudeDegrees as Degrees),
      degToRad(options.latitudeDegrees as Degrees),
      0
    )
  );
  const world = new Matrix4()
    .set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1)
    .multiply(enu)
    .invert();
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      [17000, 300, -10000, 17010, 300, -10000, 17000, 300, -9990],
      3
    )
  );
  geometry.setAttribute(
    "normal",
    new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3)
  );
  geometry.setAttribute(
    "uv",
    new Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2)
  );
  const mesh = new Mesh(geometry, new MeshBasicMaterial());
  const scene = new Group();
  scene.add(mesh);
  scene.matrix.copy(world);
  scene.matrix.decompose(scene.position, scene.quaternion, scene.scale);
  const tile = {
    boundingVolume: { box: [17000, 300, -10000, 30, 0, 0, 0, 30, 0, 0, 0, 30] },
    transform: world.toArray(),
    geometricError: 2,
  } as Tile;
  return { lut, world, mesh, geometry, scene, tile };
};

describe("opt-in local Mercator tile projection", () => {
  it.each(Object.entries(MESH_PROJECTION_ACCURACY))(
    "%s lookup payload fits even zero-width source bounds",
    async (_name, profile) => {
      const f = await fixture({ gridStepMeters: profile.gridStepMeters });
      f.tile.boundingVolume.box = [
        17000, 300, -10000, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ];
      const plugin = new TilesetMercatorProjectionPlugin(f.lut, async () => {});
      plugin.preprocessNode(f.tile, "");
      await plugin.processTileModel(f.scene, f.tile);
      const p = new Vector3().fromBufferAttribute(
        f.mesh.geometry.getAttribute("position"),
        0
      );
      const [x, y, z, hx, , , , hy, , , , hz] = f.tile.boundingVolume.box!;
      expect(Math.abs(p.x - x)).toBeLessThan(hx);
      expect(Math.abs(p.y - y)).toBeLessThan(hy);
      expect(Math.abs(p.z - z)).toBeLessThan(hz);
    }
  );
  it("decodes normalized integer positions before writing the warp", async () => {
    const f = await fixture();
    f.geometry.setAttribute(
      "position",
      new BufferAttribute(
        new Uint16Array([16000, 0, 0, 16001, 0, 0, 16000, 0, 1]),
        3,
        true
      )
    );
    f.mesh.scale.setScalar(10000);
    f.mesh.position.set(17000, 300, -10000);
    f.scene.updateMatrixWorld(true);
    const source = new Vector3()
      .fromBufferAttribute(f.geometry.getAttribute("position"), 0)
      .multiplyScalar(10000)
      .add(f.mesh.position);
    const plugin = new TilesetMercatorProjectionPlugin(f.lut, async () => {});
    await plugin.processTileModel(f.scene, f.tile);
    const attribute = f.mesh.geometry.getAttribute("position");
    expect(attribute.array).toBeInstanceOf(Float32Array);
    const actual = new Vector3()
      .fromBufferAttribute(attribute, 0)
      .multiplyScalar(10000)
      .add(f.mesh.position);
    expect(
      actual.distanceTo(projectMeshLocalToMercatorExact(options, source))
    ).toBeLessThan(0.01);
  });
  it.each(
    Object.values(MESH_PROJECTION_METHOD).flatMap((method) =>
      Object.values(MESH_PROJECTION_SAMPLING).map((sampling) => ({
        method,
        sampling,
      }))
    )
  )(
    "$method / $sampling preserves UV, normals and matching bounds",
    async (config) => {
      const f = await fixture(config);
      let yields = 0;
      const plugin = new TilesetMercatorProjectionPlugin(f.lut, async () => {
        yields++;
      });
      const original = f.geometry.getAttribute("position").array.slice();
      plugin.preprocessNode(f.tile, "");
      const once = [...f.tile.boundingVolume.box!];
      plugin.preprocessNode(f.tile, "");
      expect(f.tile.boundingVolume.box).toEqual(once);
      expect(f.tile.geometricError).toBe(2.04);
      await plugin.processTileModel(f.scene, f.tile);
      expect(f.mesh.geometry).not.toBe(f.geometry);
      expect(f.geometry.getAttribute("position").array).toEqual(original);
      expect(f.mesh.geometry.getAttribute("uv").array).toEqual(
        f.geometry.getAttribute("uv").array
      );
      const position = new Vector3().fromBufferAttribute(
        f.mesh.geometry.getAttribute("position"),
        0
      );
      expect(
        position.distanceTo(
          createMeshLocalProjection(f.lut.options)(17000, 300, -10000)
        )
      ).toBeLessThan(0.01);
      expect(f.mesh.geometry.boundingBox!.containsPoint(position)).toBe(true);
      expect(f.mesh.geometry.boundingSphere!.containsPoint(position)).toBe(
        true
      );
      const [x, y, z, hx, , , , hy, , , , hz] = f.tile.boundingVolume.box!;
      expect(Math.abs(position.x - x)).toBeLessThan(hx);
      expect(Math.abs(position.y - y)).toBeLessThan(hy);
      expect(Math.abs(position.z - z)).toBeLessThan(hz);
      expect(
        new Vector3()
          .fromBufferAttribute(f.mesh.geometry.getAttribute("normal"), 0)
          .length()
      ).toBeCloseTo(1);
      expect(yields).toBeGreaterThan(0);
    }
  );
  it("cancels pending geometry without publishing and permits later reload", async () => {
    const f = await fixture();
    let cancel = true;
    const plugin = new TilesetMercatorProjectionPlugin(f.lut, async () => {
      if (cancel) plugin.disposeTile(f.tile);
    });
    await expect(plugin.processTileModel(f.scene, f.tile)).rejects.toThrow(
      "cancelled"
    );
    expect(f.mesh.geometry).toBe(f.geometry);
    cancel = false;
    await plugin.processTileModel(f.scene, f.tile);
    expect(f.mesh.geometry).not.toBe(f.geometry);
  });
  it("fails closed for region bounds", async () => {
    const f = await fixture();
    const plugin = new TilesetMercatorProjectionPlugin(f.lut);
    expect(() =>
      plugin.preprocessNode(
        { boundingVolume: { region: [0, 0, 1, 1, 0, 1] } } as unknown as Tile,
        ""
      )
    ).toThrow("region");
  });
});
