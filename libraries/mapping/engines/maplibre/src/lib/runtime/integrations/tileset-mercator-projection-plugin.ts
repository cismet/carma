import type { Tile } from "3d-tiles-renderer/core";
import {
  Box3,
  Float32BufferAttribute,
  Matrix3,
  Matrix4,
  Mesh,
  Sphere,
  Vector3,
  type BufferGeometry,
  type Object3D,
} from "three";
import { degToRad, type Degrees } from "@carma-units";
import { cartographicToEcef, ecefToEnuMatrix } from "@carma-geo/proj";
import {
  createMeshLocalProjection,
  MESH_PROJECTION_SAMPLING,
  sampleMeshMercatorLut,
  type MeshMercatorLut,
} from "@carma-geo/utils";

type TransformedTile = Tile & { engineData?: { transform?: Matrix4 } };

/**
 * Opt-in local experimental projection. Warps decoded geometry before publication,
 * and source bounds before native Three bounds construction. Not a global tiler.
 * Requires rigid ECEF content (no skinning, morphs, instancing or region bounds).
 * ReorientationPlugin may subsequently mount the resulting virtual ECEF normally.
 */
export class TilesetMercatorProjectionPlugin {
  readonly name = "CARMA_LOCAL_MERCATOR_PROJECTION";
  private disposed = false;
  private readonly tileGenerations = new WeakMap<Tile, number>();
  private readonly processedNodes = new WeakSet<Tile>();
  private readonly ecefToLocal: Matrix4;
  private readonly localToEcef: Matrix4;
  private readonly directProjection: ReturnType<
    typeof createMeshLocalProjection
  >;

  constructor(
    private readonly lut: MeshMercatorLut,
    private readonly yieldControl: () => Promise<void> = () =>
      new Promise((resolve) => setTimeout(resolve, 0))
  ) {
    this.directProjection = createMeshLocalProjection(lut.options);
    const { longitudeDegrees, latitudeDegrees } = lut.options;
    if (Math.abs(latitudeDegrees) > 60)
      throw new RangeError(
        "Experimental Mercator bounds envelope is limited to latitude within 60 degrees"
      );
    const enu = ecefToEnuMatrix(
      cartographicToEcef(
        degToRad(longitudeDegrees as Degrees),
        degToRad(latitudeDegrees as Degrees),
        0
      )
    );
    const eastUpSouth = new Matrix4().set(
      1,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      -1,
      0,
      0,
      0,
      0,
      0,
      1
    );
    this.ecefToLocal = eastUpSouth.multiply(enu);
    this.localToEcef = this.ecefToLocal.clone().invert();
  }

  private project(point: Vector3, exact = false) {
    point.applyMatrix4(this.ecefToLocal);
    const extent = this.lut.options.halfExtentMeters;
    if (Math.abs(point.x) > extent || Math.abs(point.z) > extent)
      throw new RangeError(
        "Tileset exceeds the local Mercator projection domain"
      );
    if (
      exact ||
      this.lut.options.sampling === MESH_PROJECTION_SAMPLING.EXACT ||
      point.y < 0 ||
      point.y > 1000
    )
      this.directProjection(point.x, point.y, point.z, point);
    else sampleMeshMercatorLut(this.lut, point, point);
    return point.applyMatrix4(this.localToEcef);
  }

  preprocessNode(
    tile: TransformedTile,
    _directory: string,
    parent: TransformedTile | null = null
  ) {
    if (this.processedNodes.has(tile)) return;
    if ("region" in tile.boundingVolume)
      throw new Error(
        "Local Mercator projection does not support region bounds"
      );
    const source =
      tile.boundingVolume.box ??
      (tile.boundingVolume.sphere &&
        (() => {
          const [x, y, z, r] = tile.boundingVolume.sphere!;
          return [x, y, z, r, 0, 0, 0, r, 0, 0, 0, r];
        })());
    if (!source)
      throw new Error(
        "Local Mercator projection requires box or sphere bounds"
      );
    const transform = tile.transform
      ? new Matrix4().fromArray(tile.transform)
      : new Matrix4();
    if (parent?.engineData?.transform)
      transform.premultiply(parent.engineData.transform);
    const inverse = transform.clone().invert();
    const center = new Vector3().fromArray(source);
    const axes = [3, 6, 9].map((offset) =>
      new Vector3().fromArray(source, offset)
    );
    const projected = new Box3(),
      originalWorld = new Box3();
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const sz of [-1, 1]) {
          const point = center
            .clone()
            .addScaledVector(axes[0], sx)
            .addScaledVector(axes[1], sy)
            .addScaledVector(axes[2], sz)
            .applyMatrix4(transform);
          originalWorld.expandByPoint(point);
          projected.expandByPoint(
            this.project(point, true).applyMatrix4(inverse)
          );
        }
    projected.expandByPoint(
      this.project(center.clone().applyMatrix4(transform), true).applyMatrix4(
        inverse
      )
    );
    // Curved edges/interiors can extend past corner extrema. This deliberately loose
    // local-domain envelope favors coverage over false-negative frustum rejection.
    const diagonal = originalWorld.getSize(new Vector3()).length();
    const inverseLinearNorm = Math.hypot(
      ...[0, 1, 2, 4, 5, 6, 8, 9, 10].map((index) => inverse.elements[index])
    );
    projected.expandByScalar(
      // Metadata uses direct coordinates, payloads may use a coarse lookup.
      // Include a deliberately loose interpolation envelope for our <=60°,
      // <=50 km domain so coarser profiles cannot cause false-negative culling.
      ((2 * diagonal * diagonal + 4 * this.lut.stepMeters ** 2) / 6356752 +
        0.05) *
        inverseLinearNorm
    );
    const c = projected.getCenter(new Vector3()),
      h = projected.getSize(new Vector3()).multiplyScalar(0.5);
    tile.boundingVolume = {
      box: [c.x, c.y, c.z, h.x, 0, 0, 0, h.y, 0, 0, 0, h.z],
    };
    tile.geometricError *= 1.02;
    this.processedNodes.add(tile);
  }

  async processTileModel(scene: Object3D, tile: Tile) {
    const generation = this.tileGenerations.get(tile) ?? 0;
    const check = () => {
      if (this.disposed || (this.tileGenerations.get(tile) ?? 0) !== generation)
        throw new Error("Mercator tile projection cancelled");
    };
    check();
    scene.updateMatrixWorld(true);
    const meshes: Mesh[] = [];
    scene.traverse((object) => {
      if (object instanceof Mesh) meshes.push(object);
    });
    const pending: { mesh: Mesh; geometry: BufferGeometry }[] = [];
    try {
      for (const mesh of meshes) {
        if (
          "isSkinnedMesh" in mesh ||
          "isInstancedMesh" in mesh ||
          Object.keys(mesh.geometry.morphAttributes).length
        )
          throw new Error(
            "Local Mercator projection requires static non-instanced geometry"
          );
        const geometry = mesh.geometry.clone();
        pending.push({ mesh, geometry });
        const sourcePosition = geometry.getAttribute("position");
        if (!sourcePosition) continue;
        const sourceNormal = geometry.getAttribute("normal");
        const sourceTangent = geometry.getAttribute("tangent");
        // Decode quantized/interleaved attributes through getters, never write a
        // non-linear displacement back into a bounded integer accessor.
        const position = new Float32BufferAttribute(
          new Float32Array(sourcePosition.count * 3),
          3
        );
        const normal =
          sourceNormal &&
          new Float32BufferAttribute(
            new Float32Array(sourceNormal.count * 3),
            3
          );
        const tangent =
          sourceTangent &&
          new Float32BufferAttribute(
            new Float32Array(sourceTangent.count * 4),
            4
          );
        geometry.setAttribute("position", position);
        if (normal) geometry.setAttribute("normal", normal);
        if (tangent) geometry.setAttribute("tangent", tangent);
        const inverse = mesh.matrixWorld.clone().invert();
        const derivativeStep =
          0.1 / Math.max(mesh.matrixWorld.getMaxScaleOnAxis(), 1e-9);
        const point = new Vector3(),
          warped = new Vector3(),
          derivative = new Vector3();
        const jacobian = new Matrix3(),
          normalMatrix = new Matrix3();
        const bounds = new Box3();
        const warp = (p: Vector3) =>
          this.project(p.applyMatrix4(mesh.matrixWorld)).applyMatrix4(inverse);
        for (let i = 0; i < position.count; i++) {
          if (i % 1024 === 0) {
            await this.yieldControl();
            check();
          }
          point.fromBufferAttribute(sourcePosition, i);
          warp(warped.copy(point));
          if (normal || tangent) {
            // Finite local Jacobian transforms existing smooth normals, preserving
            // topology and avoiding an unbounded synchronous triangle rebuild.
            for (let axis = 0; axis < 3; axis++) {
              derivative
                .copy(point)
                .setComponent(axis, point.getComponent(axis) + derivativeStep);
              warp(derivative)
                .sub(warped)
                .multiplyScalar(1 / derivativeStep);
              jacobian.elements[axis * 3] = derivative.x;
              jacobian.elements[axis * 3 + 1] = derivative.y;
              jacobian.elements[axis * 3 + 2] = derivative.z;
            }
            if (normal) {
              normalMatrix.copy(jacobian).invert().transpose();
              derivative
                .fromBufferAttribute(sourceNormal!, i)
                .applyMatrix3(normalMatrix)
                .normalize();
              normal.setXYZ(i, derivative.x, derivative.y, derivative.z);
            }
            if (tangent) {
              derivative
                .fromBufferAttribute(sourceTangent!, i)
                .applyMatrix3(jacobian)
                .normalize();
              tangent.setXYZ(i, derivative.x, derivative.y, derivative.z);
              tangent.setW(i, sourceTangent!.getW(i));
            }
          }
          position.setXYZ(i, warped.x, warped.y, warped.z);
          // Bound the values actually uploaded, including Float32 rounding.
          // A double-precision extremum can exclude the rounded vertex and
          // produce false-negative culling at the viewport perimeter.
          bounds.expandByPoint(point.fromBufferAttribute(position, i));
        }
        position.needsUpdate = true;
        if (normal) normal.needsUpdate = true;
        if (tangent) tangent.needsUpdate = true;
        geometry.boundingBox = bounds;
        geometry.boundingSphere = bounds.getBoundingSphere(new Sphere());
      }
      check();
      const originals = new Set(pending.map((entry) => entry.mesh.geometry));
      for (const { mesh, geometry } of pending) mesh.geometry = geometry;
      for (const original of originals) original.dispose();
    } catch (error) {
      for (const { geometry } of pending) geometry.dispose();
      throw error;
    }
  }

  disposeTile(tile: Tile) {
    this.tileGenerations.set(tile, (this.tileGenerations.get(tile) ?? 0) + 1);
  }
  dispose() {
    this.disposed = true;
  }
}
