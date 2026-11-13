import {
  BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";
import {
  createLocalEcefFrame,
  createRasterEcefProjector,
} from "@carma-geo/proj";
import { createGeodeticTerrainTileGeometry } from "../geodetic-terrain-tile-geometry";

/** Synthetic continuous height field; no DEM, imagery or datum downloads. */
export function createDisplacedTerrainFixture(
  segments: number,
  tilesPerEdge = 2
) {
  if (!Number.isInteger(segments) || segments < 2 || segments > 512)
    throw new RangeError("Fixture grid needs 2–512 segments");
  if (!Number.isInteger(tilesPerEdge) || tilesPerEdge < 1 || tilesPerEdge > 8)
    throw new RangeError("Fixture needs 1–8 tiles per edge");
  const west = 7.1,
    south = 51.2,
    extent = 0.08;
  const frame = createLocalEcefFrame(west + extent / 2, south + extent / 2);
  const project = createRasterEcefProjector();
  const root = new Group();
  const material = new MeshStandardMaterial({ color: 0xb4bf94, roughness: 1 });
  const side = segments + 1;
  const heightAt = (longitude: number, latitude: number) => {
    const x = (longitude - west) / extent,
      y = (latitude - south) / extent;
    return (
      120 +
      900 * Math.exp(-40 * ((x - 0.4) ** 2 + (y - 0.55) ** 2)) +
      65 * Math.sin(x * 24) * Math.cos(y * 19)
    );
  };
  const u = new Float32Array(side * side),
    v = new Float32Array(side * side);
  const indices = new Uint32Array(segments * segments * 6);
  for (let row = 0; row <= segments; row++)
    for (let column = 0; column <= segments; column++) {
      const i = row * side + column;
      u[i] = column / segments;
      v[i] = row / segments;
      if (row < segments && column < segments) {
        const offset = (row * segments + column) * 6;
        indices.set(
          [i, i + 1, i + side, i + 1, i + side + 1, i + side],
          offset
        );
      }
    }
  const point = new Vector3(),
    east = new Vector3(),
    north = new Vector3();
  const receivers: Vector3[] = [];
  for (let row = 0; row < tilesPerEdge; row++)
    for (let column = 0; column < tilesPerEdge; column++) {
      const width = extent / tilesPerEdge;
      const bounds = {
        west: west + column * width,
        south: south + row * width,
        east: west + (column + 1) * width,
        north: south + (row + 1) * width,
      };
      const heightMeters = new Float32Array(side * side);
      const normalBuffer = new Float32Array(side * side * 3);
      const delta = width / segments / 2;
      const sample = (lng: number, lat: number, target: Vector3) =>
        project(lng, lat, heightAt(lng, lat), target).applyMatrix4(
          frame.localFromEcef
        );
      for (let i = 0; i < heightMeters.length; i++) {
        const lng = bounds.west + u[i] * width,
          lat = bounds.south + v[i] * width;
        heightMeters[i] = heightAt(lng, lat);
        sample(lng + delta, lat, east).sub(sample(lng - delta, lat, point));
        sample(lng, lat + delta, north).sub(sample(lng, lat - delta, point));
        east.cross(north).normalize();
        normalBuffer.set(east.toArray(), i * 3);
      }
      const { geometry } = createGeodeticTerrainTileGeometry(
        { bounds, u, v, heightMeters, indices },
        undefined,
        { frame, project, normalBuffer }
      );
      const uv = new Float32Array(side * side * 2);
      for (let i = 0; i < u.length; i++) {
        uv[2 * i] = u[i];
        uv[2 * i + 1] = v[i];
      }
      geometry.setAttribute("uv", new BufferAttribute(uv, 2));
      const mesh = new Mesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      root.add(mesh);
      const box = geometry.boundingBox!;
      for (const x of [box.min.x, box.max.x])
        for (const y of [box.min.y, box.max.y])
          for (const z of [box.min.z, box.max.z])
            receivers.push(new Vector3(x, y, z));
    }
  return {
    root,
    material,
    receivers,
    dispose() {
      for (const mesh of root.children)
        if (mesh instanceof Mesh) mesh.geometry.dispose();
      material.dispose();
      root.clear();
    },
  };
}
