import type { ReactNode } from "react";
import type { Tile } from "3d-tiles-renderer/core";
import { Box3, OrthographicCamera, Vector3 } from "three";

export type TileFixture = {
  root: Tile;
  tiles: Tile[];
  bounds: Map<Tile, Box3>;
  names: Map<Tile, string>;
};

/** Resident payload and metadata are the external inputs of these policy cases. */
export function createTileFixture(depth: number): TileFixture {
  const tiles: Tile[] = [];
  const bounds = new Map<Tile, Box3>();
  const names = new Map<Tile, string>();
  const build = (
    parent: Tile | null,
    name: string,
    level: number,
    x: number,
    z: number,
    size: number
  ): Tile => {
    // Supply the vendor metadata fields these pure policies read. Renderer-owned
    // bookkeeping is intentionally absent: no renderer, fetch or decode is simulated.
    const tile = {
      parent,
      children: [],
      refine: "REPLACE",
      geometricError: 16 / 2 ** level,
      boundingVolume: {
        box: [
          x + size / 2,
          0.5,
          z + size / 2,
          size / 2,
          0,
          0,
          0,
          0.5,
          0,
          0,
          0,
          size / 2,
        ],
      },
      internal: {
        hasContent: true,
        hasRenderableContent: true,
        hasUnrenderableContent: false,
        loadingState: 4,
      },
      traversal: { error: 16 / 2 ** level, inFrustum: true },
    } as unknown as Tile;
    tiles.push(tile);
    names.set(tile, name);
    bounds.set(
      tile,
      new Box3(new Vector3(x, 0, z), new Vector3(x + size, 1, z + size))
    );
    if (level < depth)
      tile.children = Array.from({ length: 4 }, (_, index) =>
        build(
          tile,
          `${name}.${index + 1}`,
          level + 1,
          x + (index % 2) * (size / 2),
          z + Math.floor(index / 2) * (size / 2),
          size / 2
        )
      );
    return tile;
  };
  return { root: build(null, "B", 0, 0, 0, 4), tiles, bounds, names };
}

export function topDownCamera(
  west: number,
  north: number,
  east: number,
  south: number
) {
  const camera = new OrthographicCamera(
    -(east - west) / 2,
    (east - west) / 2,
    (south - north) / 2,
    -(south - north) / 2,
    0.1,
    40
  );
  const center = new Vector3((west + east) / 2, 0, (north + south) / 2);
  camera.position.copy(center).setY(20);
  camera.up.set(0, 0, -1);
  camera.lookAt(center);
  camera.updateMatrixWorld();
  return camera;
}

export type PolicyInvariant = readonly [description: string, passed: boolean];

export function TilePolicyScene({
  title,
  description,
  fixture,
  shown,
  pending = new Set<Tile>(),
  color = () => "#467d91",
  invariants,
  children,
}: {
  title: string;
  description: string;
  fixture: TileFixture;
  shown: ReadonlySet<Tile>;
  pending?: ReadonlySet<Tile>;
  color?: (tile: Tile) => string;
  invariants: readonly PolicyInvariant[];
  children?: ReactNode;
}) {
  const drawTiles = [...new Set([...shown, ...pending])];
  return (
    <main style={{ padding: 20, maxWidth: 1000, margin: "auto" }}>
      <h2>{title}</h2>
      <p>{description}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
        <svg
          viewBox="-0.15 -0.15 4.3 4.3"
          role="img"
          aria-label={title}
          style={{ width: 420, maxWidth: "100%", background: "#18232e" }}
        >
          {drawTiles.map((tile) => {
            const box = fixture.bounds.get(tile)!;
            const waiting = pending.has(tile) && !shown.has(tile);
            return (
              <g key={fixture.names.get(tile)}>
                <rect
                  x={box.min.x}
                  y={box.min.z}
                  width={box.max.x - box.min.x}
                  height={box.max.z - box.min.z}
                  fill={waiting ? "none" : color(tile)}
                  stroke={waiting ? "#f2b963" : "#c3dbe5"}
                  strokeWidth={0.015}
                  strokeDasharray={waiting ? "0.06 0.04" : undefined}
                />
                <text
                  x={(box.min.x + box.max.x) / 2}
                  y={(box.min.z + box.max.z) / 2}
                  fill="white"
                  fontSize={0.13}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {fixture.names.get(tile)}
                </text>
              </g>
            );
          })}
        </svg>
        <div style={{ flex: "1 1 300px" }}>
          {children}
          <ul aria-label="Policy invariants" style={{ paddingLeft: 20 }}>
            {invariants.map(([description, passed]) => (
              <li
                key={description}
                data-policy-check={passed ? "pass" : "fail"}
              >
                {passed ? "✓" : "✗"} {description}
              </li>
            ))}
          </ul>
          <p>
            Solid: published geometry. Dashed: pending payload. B: base/root.
          </p>
        </div>
      </div>
    </main>
  );
}

export async function assertPolicyStory({
  canvasElement,
}: {
  canvasElement: HTMLElement;
}) {
  const checks = [...canvasElement.querySelectorAll("[data-policy-check]")];
  if (!checks.length) throw new Error("No policy invariants were rendered");
  const failed = checks.filter(
    (check) => check.getAttribute("data-policy-check") !== "pass"
  );
  if (failed.length)
    throw new Error(failed.map((check) => check.textContent).join("; "));
}
