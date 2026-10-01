import type { Meta, StoryObj } from "@storybook/react";

import { createProjectedTerrainTileGeometry } from "../../../../../../libraries/mapping/engines/three/primitives/src/lib/common/terrain-tile-geometry";
import {
  buildGridTile,
  latitudeToTileY,
  longitudeToTileX,
} from "../../../../../../libraries/mapping/engines/maplibre/src/lib/core/raster-dem-tile";
import type { TerrainStitchInput } from "../../../../../../libraries/mapping/engines/maplibre/src/lib/runtime/integrations/terrain-boundary-stitch";
import {
  prepareEqualLevelTerrainShell,
  stitchEqualLevelTerrainBoundaries,
} from "../../../../../../libraries/mapping/engines/maplibre/src/lib/runtime/integrations/terrain-equal-level-boundaries";
import { assertPolicyStory } from "./TilePolicyScene";

function createTerrainFixture(size: number): TerrainStitchInput[] {
  const origin = { level: 4, x: 7, y: 7 };
  return Array.from({ length: 4 }, (_, index) => {
    const dx = index % 2,
      dz = Math.floor(index / 2);
    const pixels = new Uint8ClampedArray(size * size * 4);
    for (let row = 0; row < size; row++)
      for (let column = 0; column < size; column++) {
        const x = dx + (column + 0.5) / size;
        const z = dz + (row + 0.5) / size;
        const height = 100 + 0.25 * x + 0.5 * z + 0.1 * x * x;
        const encoded = Math.round((height + 32768) * 256);
        pixels.set(
          [encoded >> 16, (encoded >> 8) & 255, encoded & 255, 255],
          (row * size + column) * 4
        );
      }
    const tile = buildGridTile(
      { ...origin, x: origin.x + dx, y: origin.y + dz },
      { width: size, height: size, pixels },
      size,
      0.01
    );
    const geometry = createProjectedTerrainTileGeometry({
      tile,
      projectToWorld: (longitude, latitude, height, target) =>
        target.set(
          longitudeToTileX(longitude, origin.level) - origin.x,
          height - 100,
          latitudeToTileY(latitude, origin.level) - origin.y
        ),
    });
    const positions = geometry.getAttribute("position").array as Float32Array;
    const boundaryEdges = {
      west: tile.westIndices,
      east: tile.eastIndices,
      north: tile.northIndices,
      south: tile.southIndices,
    };
    const input: TerrainStitchInput = {
      key: `${tile.id.level}/${tile.id.x}/${tile.id.y}`,
      id: tile.id,
      positions,
      normals: geometry.getAttribute("normal").array as Float32Array,
      indices: geometry.index!.array as Uint16Array | Uint32Array,
      boundaryEdges,
      boundaryBaseHeights: {
        west: Float32Array.from(
          boundaryEdges.west,
          (i) => positions[i * 3 + 1]
        ),
        east: Float32Array.from(
          boundaryEdges.east,
          (i) => positions[i * 3 + 1]
        ),
        north: Float32Array.from(
          boundaryEdges.north,
          (i) => positions[i * 3 + 1]
        ),
        south: Float32Array.from(
          boundaryEdges.south,
          (i) => positions[i * 3 + 1]
        ),
      },
    };
    geometry.dispose();
    return input;
  });
}

function sharedEdge(inputs: readonly TerrainStitchInput[]) {
  const west = inputs[0],
    east = inputs[1];
  return Array.from(west.boundaryEdges.east, (index, offset) => {
    const other = east.boundaryEdges.west[offset];
    return {
      points: [
        Array.from(west.positions.slice(index * 3, index * 3 + 3)),
        Array.from(east.positions.slice(other * 3, other * 3 + 3)),
      ],
      normals: [
        Array.from(west.normals.slice(index * 3, index * 3 + 3)),
        Array.from(east.normals.slice(other * 3, other * 3 + 3)),
      ],
    };
  });
}

type Edge = ReturnType<typeof sharedEdge>;

function EdgeProfile({
  title,
  edge,
  range,
  normalStride,
}: {
  title: string;
  edge: Edge;
  range: readonly [number, number];
  normalStride: number;
}) {
  const project = (point: number[]) => [
    30 + point[2] * 300,
    190 - ((point[1] - range[0]) / (range[1] - range[0])) * 140,
  ];
  return (
    <section style={{ flex: "1 1 350px" }}>
      <h3>{title}</h3>
      <svg
        viewBox="0 0 360 240"
        role="img"
        aria-label={title}
        style={{ width: "100%", background: "#18232e" }}
      >
        <path d="M30 30 V195 H335" stroke="#8397a8" fill="none" />
        {["#78c3e5", "#ffc16d"].map((color, side) => (
          <g key={side}>
            <polyline
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              points={edge
                .map((sample) => project(sample.points[side]).join(","))
                .join(" ")}
            />
            {edge
              .filter((_, index) => index % normalStride === 0)
              .map((sample, index) => {
                const [x, y] = project(sample.points[side]);
                const normal = sample.normals[side];
                return (
                  <g key={index}>
                    <line
                      x1={x}
                      y1={y}
                      x2={x + normal[2] * 24}
                      y2={y - normal[1] * 24}
                      stroke={color}
                      strokeWidth={1}
                    />
                    <circle
                      cx={x + normal[2] * 24}
                      cy={y - normal[1] * 24}
                      r={1.5}
                      fill={color}
                    />
                  </g>
                );
              })}
          </g>
        ))}
        <text x={30} y={220} fill="white" fontSize={12}>
          Shared edge z: 0 → 1 m
        </text>
        <text x={30} y={20} fill="white" fontSize={12}>
          Height {range[0].toFixed(2)} → {range[1].toFixed(2)} m
        </text>
      </svg>
      <p>
        Blue: west tile's east edge. Amber: east tile's west edge. Lines with
        dots show each vertex normal projected into this edge's Y/Z plane.
      </p>
    </section>
  );
}

function TerrainSeamGeometry({
  rasterSize,
  reverseArrival,
}: {
  rasterSize: number;
  reverseArrival: boolean;
}) {
  const inputs = createTerrainFixture(rasterSize);
  const originals = inputs.map((input) => input.positions.slice());
  const shells = inputs.map(prepareEqualLevelTerrainShell);
  const updates = stitchEqualLevelTerrainBoundaries(
    reverseArrival ? [...shells].reverse() : shells
  );
  const patched = shells.map((shell) => ({
    ...shell,
    ...updates.find((update) => update.key === shell.key)!,
  }));
  const before = sharedEdge(inputs),
    after = sharedEdge(patched);
  const gap = (edge: Edge, field: "points" | "normals") =>
    Math.max(
      ...edge.map((sample) =>
        Math.hypot(
          ...sample[field][0].map(
            (value, axis) => value - sample[field][1][axis]
          )
        )
      )
    );
  const heights = before.flatMap((sample) =>
    sample.points.map((point) => point[1])
  );
  const range = [
    Math.min(...heights) - 0.02,
    Math.max(...heights) + 0.02,
  ] as const;
  const full = stitchEqualLevelTerrainBoundaries(inputs);
  const shellNormalsMatch = patched.every((output) => {
    const reference = full.find((tile) => tile.key === output.key)!;
    return output.normalTargets!.every((index) =>
      [0, 1, 2].every(
        (axis) =>
          Math.abs(
            output.normals[index * 3 + axis] -
              reference.normals[output.sourceIndices![index] * 3 + axis]
          ) < 1e-6
      )
    );
  });
  const normalCount = inputs.reduce(
    (sum, input) => sum + input.positions.length / 3,
    0
  );
  const shellCount = shells.reduce(
    (sum, input) => sum + input.positions.length / 3,
    0
  );
  const invariants = [
    ["Shared geometry positions become identical", gap(after, "points") < 1e-6],
    [
      "Shared area-weighted normals become identical",
      gap(after, "normals") < 1e-6,
    ],
    [
      "Compact shells match full-face normals at every patched target",
      shellNormalsMatch,
    ],
    [
      "Source mesh positions remain unchanged",
      inputs.every((input, tile) =>
        input.positions.every(
          (value, index) => value === originals[tile][index]
        )
      ),
    ],
  ] as const;
  return (
    <main style={{ padding: 20, maxWidth: 1000, margin: "auto" }}>
      <h2>Actual terrain seam construction from four raster neighbors</h2>
      <p>
        Four deterministic Terrarium rasters pass through the production grid
        mesher and projected geometry factory. The actual equal-level worker
        algorithm extracts two-ring shells, aligns shared positions with
        north-west ownership, and sums area-weighted normals. No network, WebGL
        or substitute stitch algorithm.
      </p>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <EdgeProfile
          title="Before stitching: independently clamped raster edges"
          edge={before}
          range={range}
          normalStride={Math.max(1, rasterSize / 4)}
        />
        <EdgeProfile
          title="After stitching: shared geometry and normals"
          edge={after}
          range={range}
          normalStride={Math.max(1, rasterSize / 4)}
        />
      </div>
      <p>
        Maximum shared-edge gap {(gap(before, "points") * 1000).toFixed(2)} →{" "}
        {(gap(after, "points") * 1000).toFixed(2)} mm · normal-vector difference{" "}
        {gap(before, "normals").toFixed(4)} → {gap(after, "normals").toFixed(4)}
      </p>
      <p>
        Full meshes: {normalCount} vertices · compact worker shells:{" "}
        {shellCount} vertices ({((100 * shellCount) / normalCount).toFixed(1)}
        %). Full geometry remains resident; only shells participate in this
        stitch.
      </p>
      <ul aria-label="Policy invariants">
        {invariants.map(([description, passed]) => (
          <li key={description} data-policy-check={passed ? "pass" : "fail"}>
            {passed ? "✓" : "✗"} {description}
          </li>
        ))}
      </ul>
    </main>
  );
}

const meta = {
  title: "Tile Loading Manager/Feature Policies/Terrain Seam Geometry",
  component: TerrainSeamGeometry,
  args: { rasterSize: 16, reverseArrival: false },
  argTypes: {
    rasterSize: { control: "select", options: [8, 16, 32] },
    reverseArrival: { control: "boolean" },
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof TerrainSeamGeometry>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SharedEdgesAndNormals: Story = { play: assertPolicyStory };
export const CompactWorkerShells: Story = {
  args: { rasterSize: 32 },
  play: assertPolicyStory,
};
export const ReversedArrival: Story = {
  args: { reverseArrival: true },
  play: assertPolicyStory,
};
