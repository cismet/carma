import * as THREE from "three";
import { NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN } from "@carma-commons/resources";
// Story-only experiment: reuse decoding/workers; do not change manager policy.
import { acquireRasterDemTerrainTileSource } from "../../../../../../libraries/mapping/engines/maplibre/src/lib/runtime/integrations/raster-dem-terrain-tile-source";
import {
  createGcg2016ShaderField,
  localGroundLngLat,
  projectGeodeticToScene,
  sampleGcg2016Field,
  TERRAIN_GEOMETRY_MODE,
  type ReferenceFrame,
} from "./maplibre-three-reference-surfaces";

/** Bounded diagnostic, not certified cross-LOD occlusion. Keep coarse parents. */
export const startDatumTerrainMarch = (
  frame: ReferenceFrame,
  camera: THREE.PerspectiveCamera,
  groups: readonly [THREE.Group, THREE.Group],
  eyeZeta: number,
  signal: AbortSignal,
  changed: (message: string) => void
) => {
  let disposed = false;
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  let release = () => {};
  let fieldTexture: THREE.Texture | undefined;
  const run = async () => {
    const source = await acquireRasterDemTerrainTileSource(
      NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
      {
        maxCacheBytes: 32 * 1024 ** 2,
        meshSegments: 32,
      }
    );
    release = () => source.release();
    if (disposed || signal.aborted) {
      release();
      return;
    }
    const field = await createGcg2016ShaderField(frame.originLngLat);
    fieldTexture = field.texture;
    if (disposed || signal.aborted) {
      field.texture.dispose();
      return;
    }
    const direction = camera.getWorldDirection(new THREE.Vector3());
    const forward = new THREE.Vector2(direction.x, direction.z).normalize();
    const side = new THREE.Vector2(-forward.y, forward.x);
    const corners = [0, 85_000].flatMap((distance) =>
      [-1, 1].map((sign) => {
        const width =
          600 +
          distance *
            Math.tan(THREE.MathUtils.degToRad(camera.fov)) *
            camera.aspect;
        return localGroundLngLat(
          frame,
          forward.x * distance + side.x * width * sign,
          forward.y * distance + side.y * width * sign
        );
      })
    );
    const bounds = {
      west: Math.min(...corners.map((p) => p[0])),
      east: Math.max(...corners.map((p) => p[0])),
      south: Math.min(...corners.map((p) => p[1])),
      north: Math.max(...corners.map((p) => p[1])),
    };
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      )
    );
    const project = (lon: number, lat: number, h: number) =>
      projectGeodeticToScene(
        frame,
        lon,
        lat,
        h,
        TERRAIN_GEOMETRY_MODE.WGS84_ECEF
      );
    const priority = (id: { level: number; x: number; y: number }) => {
      const b = source.getTileBounds(id);
      return project(
        (b.west + b.east) / 2,
        (b.south + b.north) / 2,
        300
      ).distanceTo(camera.position);
    };
    const intersects = (id: { level: number; x: number; y: number }) => {
      if (!source.getTileDataAvailable(id)) return false;
      const b = source.getTileBounds(id),
        box = new THREE.Box3();
      for (const lon of [b.west, b.east])
        for (const lat of [b.south, b.north])
          for (const h of [-100, 1100]) box.expandByPoint(project(lon, lat, h));
      return frustum.intersectsBox(box.expandByScalar(100));
    };
    const queue = source.getTileGridIdsForBounds(bounds, 10).filter(intersects);
    let bytes = 0,
      loaded = 0,
      skipped = 0;
    const ray = new THREE.Raycaster();
    const budget = 64 * 1024 ** 2;
    const maxTiles = 192;
    const records = new Map<
      string,
      {
        geometry: THREE.BufferGeometry[];
        indices: number[];
        u: Float32Array;
        v: Float32Array;
        replaced: Set<number>;
      }
    >();
    while (queue.length && !disposed && !signal.aborted) {
      // Coarse coverage first, then near-to-far within each level.
      queue.sort((a, b) => a.level - b.level || priority(a) - priority(b));
      const id = queue.shift()!;
      if (bytes + 2 * 1024 ** 2 > budget || loaded >= maxTiles) break;
      const decoded = await source.requestTile(
        id,
        signal,
        Math.max(0.2, priority(id) / 20_000)
      );
      if (disposed || signal.aborted) break;
      // The source preserves native raster vertices even when its index buffer
      // is simplified. Bound this diagnostic's CPU/GPU payload independently.
      const sideLength = 33,
        u = new Float32Array(sideLength ** 2),
        v = new Float32Array(sideLength ** 2),
        heightMeters = new Float32Array(sideLength ** 2);
      const indices: number[] = [];
      for (let row = 0; row < sideLength; row++)
        for (let col = 0; col < sideLength; col++) {
          const i = row * sideLength + col;
          u[i] = col / (sideLength - 1);
          v[i] = row / (sideLength - 1);
          heightMeters[i] =
            source.sampleHeight(
              THREE.MathUtils.lerp(
                decoded.bounds.west,
                decoded.bounds.east,
                u[i]
              ),
              THREE.MathUtils.lerp(
                decoded.bounds.north,
                decoded.bounds.south,
                v[i]
              )
            ) ?? -9999;
          if (row < sideLength - 1 && col < sideLength - 1)
            indices.push(
              i,
              i + sideLength,
              i + 1,
              i + 1,
              i + sideLength,
              i + sideLength + 1
            );
        }
      const tile = { ...decoded, u, v, heightMeters, indices };
      const count = tile.heightMeters.length;
      const positions = [
        new Float32Array(count * 3),
        new Float32Array(count * 3),
      ];
      const colors = new Float32Array(count * 3);
      let visibleSamples = 0,
        validSamples = 0;
      for (let i = 0; i < count; i++) {
        const lon = THREE.MathUtils.lerp(
          tile.bounds.west,
          tile.bounds.east,
          tile.u[i]
        );
        const lat = THREE.MathUtils.lerp(
          tile.bounds.north,
          tile.bounds.south,
          tile.v[i]
        );
        const h = tile.heightMeters[i],
          zeta = sampleGcg2016Field(field, frame, lon, lat);
        const a = project(lon, lat, h + zeta),
          b = project(lon, lat, h + eyeZeta);
        a.toArray(positions[0], i * 3);
        b.toArray(positions[1], i * 3);
        new THREE.Color()
          .setHSL(
            0.28 - THREE.MathUtils.clamp(h / 1000, 0, 1) * 0.2,
            0.25,
            0.28 + THREE.MathUtils.clamp(h / 1000, 0, 1) * 0.35
          )
          .toArray(colors, i * 3);
        if (
          h > -1000 &&
          i % Math.max(1, Math.floor(count / 9)) === 0 &&
          frustum.containsPoint(a)
        ) {
          validSamples++;
          const delta = a.clone().sub(camera.position),
            distance = delta.length();
          ray.set(camera.position, delta.normalize());
          ray.far = Math.max(0, distance - 20);
          // Best-effort only. A 20 m margin avoids using nearly coincident parent
          // surfaces as blockers; unknown subpixel peaks remain a limitation.
          if (!ray.intersectObjects(groups[0].children, false).length)
            visibleSamples++;
        }
      }
      const validIndices = [];
      for (let i = 0; i < tile.indices.length; i += 3) {
        const tri = [tile.indices[i], tile.indices[i + 1], tile.indices[i + 2]];
        if (tri.every((j) => tile.heightMeters[j] > -1000))
          validIndices.push(...tri);
      }
      if (!validIndices.length) continue;
      const tileGeometries: THREE.BufferGeometry[] = [];
      for (let mode = 0; mode < 2; mode++) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.BufferAttribute(positions[mode], 3)
        );
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        geometry.setIndex(validIndices);
        geometry.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 1,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: 17 - id.level,
          polygonOffsetUnits: 17 - id.level,
        });
        const mesh = new THREE.Mesh(geometry, material);
        groups[mode].add(mesh);
        mesh.updateMatrixWorld(true);
        geometries.push(geometry);
        tileGeometries.push(geometry);
        materials.push(material);
        bytes +=
          positions[mode].byteLength +
          colors.byteLength +
          validIndices.length * 4 +
          count * 12;
      }
      loaded++;
      records.set(`${id.level}/${id.x}/${id.y}`, {
        geometry: tileGeometries,
        indices: validIndices,
        u,
        v,
        replaced: new Set(),
      });
      const parent = records.get(
        `${id.level - 1}/${Math.floor(id.x / 2)}/${Math.floor(id.y / 2)}`
      );
      if (parent && validIndices.length === indices.length) {
        parent.replaced.add((id.x % 2) + (id.y % 2) * 2);
        const remaining: number[] = [];
        for (let i = 0; i < parent.indices.length; i += 3) {
          const tri = parent.indices.slice(i, i + 3);
          const x = tri.reduce((sum, j) => sum + parent.u[j], 0) / 3;
          const y = tri.reduce((sum, j) => sum + parent.v[j], 0) / 3;
          if (!parent.replaced.has((x >= 0.5 ? 1 : 0) + (y >= 0.5 ? 2 : 0)))
            remaining.push(...tri);
        }
        parent.geometry.forEach((g) => g.setIndex(remaining));
      }
      if (id.level < 13 && (visibleSamples > 0 || validSamples === 0)) {
        for (let y = 0; y < 2; y++)
          for (let x = 0; x < 2; x++) {
            const child = {
              level: id.level + 1,
              x: id.x * 2 + x,
              y: id.y * 2 + y,
            };
            if (intersects(child)) queue.push(child);
          }
      } else if (validSamples && !visibleSamples) skipped++;
      changed(
        `${loaded} terrain tiles · ${(bytes / 1024 ** 2).toFixed(
          1
        )} MiB geometry / 64 MiB · ${skipped} coarse tiles not refined (occlusion heuristic)`
      );
      // One request/preparation at a time; yield between bounded meshes.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (!disposed)
      changed(
        `${loaded} terrain tiles · ${(bytes / 1024 ** 2).toFixed(1)} MiB · ${
          queue.length ? "budget stop; coarse cover retained" : "march complete"
        } · ${skipped} occluded refinement skips`
      );
  };
  void run().catch((error) => {
    if (!disposed && !signal.aborted) changed(`Terrain: ${String(error)}`);
  });
  return () => {
    disposed = true;
    release();
    fieldTexture?.dispose();
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    groups.forEach((g) => g.clear());
  };
};
