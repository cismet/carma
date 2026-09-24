import { BufferAttribute, BufferGeometry } from "three";
import type { TerrainStitchInput } from "./terrain-boundary-stitch";

/** Two rings retain all incident faces for the inner ring's corrected normals.
 * Extract once in a worker; subsequent publications transfer only this shell.
 */
export const prepareEqualLevelTerrainShell = (
  input: TerrainStitchInput
): TerrainStitchInput => {
  const boundary = new Uint8Array(input.positions.length / 3);
  for (const edge of Object.values(input.boundaryEdges))
    for (const i of edge) boundary[i] = 1;
  const targets = boundary.slice();
  const ix = input.indices;
  for (let i = 0; i < ix.length; i += 3) {
    if (boundary[ix[i]] || boundary[ix[i + 1]] || boundary[ix[i + 2]]) {
      targets[ix[i]] = targets[ix[i + 1]] = targets[ix[i + 2]] = 1;
    }
  }
  const faces: number[] = [],
    vertices = targets.slice();
  for (let i = 0; i < ix.length; i += 3) {
    if (targets[ix[i]] || targets[ix[i + 1]] || targets[ix[i + 2]]) {
      for (let j = 0; j < 3; j++) {
        faces.push(ix[i + j]);
        vertices[ix[i + j]] = 1;
      }
    }
  }
  const kept: number[] = [];
  for (let i = 0; i < vertices.length; i++) if (vertices[i]) kept.push(i);
  const sourceIndices = Uint32Array.from(kept);
  const remap = new Uint32Array(vertices.length);
  const positions = new Float32Array(sourceIndices.length * 3),
    normals = new Float32Array(positions.length);
  sourceIndices.forEach((source, index) => {
    remap[source] = index;
    positions.set(
      input.positions.subarray(source * 3, source * 3 + 3),
      index * 3
    );
    normals.set(input.normals.subarray(source * 3, source * 3 + 3), index * 3);
  });
  const edge = (side: keyof TerrainStitchInput["boundaryEdges"]) =>
    input.boundaryEdges[side].map((i) => remap[i]);
  return {
    ...input,
    positions,
    normals,
    indices: Uint32Array.from(faces, (i) => remap[i]),
    boundaryEdges: {
      west: edge("west"),
      east: edge("east"),
      north: edge("north"),
      south: edge("south"),
    },
    sourceIndices,
    normalTargets: Uint32Array.from(
      kept.filter((i) => targets[i]),
      (i) => remap[i]
    ),
  };
};

type Member = { tile: number; vertex: number };

/** North, then west owns each shared boundary sample, including four-way corners.
 * Ownership determines summation order, not which side's clamped height wins.
 * Decision: repair equal-level geometry before publication; hiding its border
 * after retiring the parent would open holes in the shadow caster surface.
 * See libraries/mapping/engines/maplibre/TERRAIN_GENERATION.md#equal-level-edge-ownership.
 */
export const stitchEqualLevelTerrainBoundaries = (
  inputs: TerrainStitchInput[],
  outputKeys?: ReadonlySet<string>
) => {
  const tiles = [...inputs]
    .sort(
      (a, b) =>
        a.id.level - b.id.level ||
        a.id.y - b.id.y ||
        a.id.x - b.id.x ||
        a.key.localeCompare(b.key)
    )
    .map((input) => ({
      ...input,
      positions: input.positions.slice(),
      normals: input.normals.slice(),
    }));
  const groups = new Map<string, Member[]>();
  const touched = new Set<number>();
  tiles.forEach((tile, tileIndex) => {
    const seen = new Set<number>();
    for (const edge of Object.values(tile.boundaryEdges))
      for (const vertex of edge) {
        if (seen.has(vertex)) continue;
        seen.add(vertex);
        const offset = vertex * 3;
        // Same projected frame and precision as the general boundary stitcher.
        const key = `${tile.id.level}/${Math.round(
          tile.positions[offset] * 1000
        )}/${Math.round(tile.positions[offset + 2] * 1000)}`;
        const members = groups.get(key) ?? [];
        members.push({ tile: tileIndex, vertex });
        groups.set(key, members);
      }
  });
  const shared = [...groups.values()].filter(
    (members) =>
      members.length > 1 &&
      members.every((a) =>
        members.every((b) => {
          const x = Math.abs(tiles[a.tile].id.x - tiles[b.tile].id.x);
          const y = Math.abs(tiles[a.tile].id.y - tiles[b.tile].id.y);
          return a.tile === b.tile || (x <= 1 && y <= 1 && x + y > 0);
        })
      )
  );
  for (const members of shared) {
    const owner = members[0];
    const ownerPositions = tiles[owner.tile].positions;
    const x = ownerPositions[owner.vertex * 3];
    const z = ownerPositions[owner.vertex * 3 + 2];
    const height =
      members.reduce(
        (sum, m) => sum + tiles[m.tile].positions[m.vertex * 3 + 1],
        0
      ) / members.length;
    for (const m of members) {
      const p = tiles[m.tile].positions;
      p[m.vertex * 3] = x;
      p[m.vertex * 3 + 1] = height;
      p[m.vertex * 3 + 2] = z;
      touched.add(m.tile);
    }
  }
  // Keep unnormalised area-weighted face contributions until BOTH sides have
  // contributed. Averaging already normalised per-tile normals creates seams.
  for (const tileIndex of touched) {
    const tile = tiles[tileIndex];
    const p = tile.positions,
      n = tile.normals,
      indices = tile.indices;
    n.fill(0);
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3,
        b = indices[i + 1] * 3,
        c = indices[i + 2] * 3;
      const cbx = p[c] - p[b],
        cby = p[c + 1] - p[b + 1],
        cbz = p[c + 2] - p[b + 2];
      const abx = p[a] - p[b],
        aby = p[a + 1] - p[b + 1],
        abz = p[a + 2] - p[b + 2];
      const nx = cby * abz - cbz * aby,
        ny = cbz * abx - cbx * abz,
        nz = cbx * aby - cby * abx;
      for (const v of [a, b, c]) {
        n[v] += nx;
        n[v + 1] += ny;
        n[v + 2] += nz;
      }
    }
  }
  for (const members of shared) {
    let x = 0,
      y = 0,
      z = 0;
    for (const m of members) {
      const n = tiles[m.tile].normals,
        i = m.vertex * 3;
      x += n[i];
      y += n[i + 1];
      z += n[i + 2];
    }
    for (const m of members) {
      const n = tiles[m.tile].normals,
        i = m.vertex * 3;
      n[i] = x;
      n[i + 1] = y;
      n[i + 2] = z;
    }
  }
  return [...touched]
    .filter((tileIndex) => !outputKeys || outputKeys.has(tiles[tileIndex].key))
    .map((tileIndex) => {
      const tile = tiles[tileIndex];
      const n = tile.normals;
      for (let i = 0; i < n.length; i += 3) {
        const length = Math.hypot(n[i], n[i + 1], n[i + 2]);
        if (length) {
          n[i] /= length;
          n[i + 1] /= length;
          n[i + 2] /= length;
        }
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(tile.positions, 3));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const result = {
        key: tile.key,
        positions: tile.positions,
        normals: tile.normals,
        indices: tile.indices,
        boundaryState: undefined as Float32Array | undefined,
        box: {
          min: geometry.boundingBox!.min.toArray(),
          max: geometry.boundingBox!.max.toArray(),
        },
        sphere: {
          center: geometry.boundingSphere!.center.toArray(),
          radius: geometry.boundingSphere!.radius,
        },
      };
      geometry.dispose();
      return result;
    });
};
