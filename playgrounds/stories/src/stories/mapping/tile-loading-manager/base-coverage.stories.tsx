import type { Meta, StoryObj } from "@storybook/react";

import {
  collectCachedMeshBase,
  meshBaseManifestMatches,
} from "../../../../../../libraries/mapping/engines/maplibre/src/lib/core/mesh-base-cache-protocol";
import {
  isExtentFloorTile,
  meshBaseMemoryBudget,
  resolveExtentGeometricError,
} from "../../../../../../libraries/mapping/engines/maplibre/src/lib/core/mesh-error-policy";
import {
  getReadyMeshRegionCut,
  isMeshCoverageRemovalSafe,
} from "../../../../../../libraries/mapping/engines/maplibre/src/lib/core/mesh-tile-coverage";
import {
  assertPolicyStory,
  createTileFixture,
  TilePolicyScene,
} from "./TilePolicyScene";

const LEVELS = [
  { level: 0, geometricError: 16, bytes: 1 * 1024 ** 2 },
  { level: 1, geometricError: 8, bytes: 8 * 1024 ** 2 },
  { level: 2, geometricError: 4, bytes: 32 * 1024 ** 2 },
  { level: 3, geometricError: 2, bytes: 128 * 1024 ** 2 },
];

function BaseCoverage({
  cachedRoot,
  cachedChildren,
  memoryGiB,
  memoryShare,
}: {
  cachedRoot: boolean;
  cachedChildren: number;
  memoryGiB: number;
  memoryShare: number;
}) {
  const fixture = createTileFixture(1);
  const children = fixture.root.children!;
  const stored = new Set(children.slice(0, cachedChildren));
  if (cachedRoot) stored.add(fixture.root);
  const cachedCut = collectCachedMeshBase(
    fixture.root,
    (tile) => stored.has(tile),
    (tile) => tile.children ?? null,
    (tile) => !tile.internal.hasRenderableContent
  );
  const cut = new Set(cachedCut ?? []);
  const ready = getReadyMeshRegionCut(
    fixture.root,
    cut,
    Number.MAX_VALUE,
    () => ({ intersects: true, errorPixels: 16 })
  );
  const budget = meshBaseMemoryBudget(memoryGiB * 1024 ** 3, memoryShare);
  const floor = resolveExtentGeometricError(
    LEVELS,
    memoryGiB * 1024 ** 3,
    0,
    memoryShare
  );
  const manifest = {
    sourceUrl: "https://example.invalid/tileset.json",
    sourceRevision: "fixture-source",
    buildId: "fixture-manager",
    extentError: 16,
    residentBytes: 1024 ** 2,
    urls: ["base.b3dm"],
  };
  return (
    <TilePolicyScene
      title="Resident base coverage and complete persistent cuts"
      description="Production cache proof accepts a stored parent while finer records are incomplete. Once all children are stored it certifies their full cut. The resident base is a memory floor; this case supplies storage contents directly and performs no IndexedDB I/O."
      fixture={fixture}
      shown={cut}
      invariants={[
        [
          "A partial child cache cannot certify coverage without its parent",
          (cachedCut !== null) === (cachedRoot || cachedChildren === 4),
        ],
        [
          "A certified restored cut covers the entire extent",
          (ready !== null) === (cachedCut !== null),
        ],
        [
          "The base payload qualifies for resident-floor retention",
          isExtentFloorTile(fixture.root, 16),
        ],
        [
          "The sole base cannot be evicted without a complete replacement",
          isMeshCoverageRemovalSafe(fixture.root, stored) ===
            (cachedChildren === 4),
        ],
        [
          "A changed manager build invalidates the persisted manifest",
          !meshBaseManifestMatches(manifest, {
            ...manifest,
            buildId: "other-manager",
          }),
        ],
      ]}
    >
      <p>
        Restorable surfaces: {cachedCut?.length ?? 0} · completeness:{" "}
        {cachedCut ? "confirmed" : "pending"}
      </p>
      <p>
        Device cache ceiling {memoryGiB} GiB · base allowance{" "}
        {(budget / 1024 ** 2).toFixed(1)} MiB · chosen geometric error {floor} m
      </p>
      <p>
        The four synthetic level sizes are transfer sizes; the production
        resident-memory multiplier determines the selected floor. Root B is kept
        in memory separately from its visibility.
      </p>
    </TilePolicyScene>
  );
}

const meta = {
  title: "Tile Loading Manager/Feature Policies/Base Coverage",
  component: BaseCoverage,
  args: { cachedRoot: true, cachedChildren: 2, memoryGiB: 4, memoryShare: 0.1 },
  argTypes: {
    cachedRoot: { control: "boolean" },
    cachedChildren: { control: { type: "range", min: 0, max: 4, step: 1 } },
    memoryGiB: { control: "select", options: [1, 2, 4, 8, 16] },
    memoryShare: {
      control: { type: "range", min: 0.05, max: 0.15, step: 0.01 },
    },
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof BaseCoverage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CachedParentFallback: Story = { play: assertPolicyStory };
export const CompleteFinerCache: Story = {
  args: { cachedRoot: false, cachedChildren: 4 },
  play: assertPolicyStory,
};
export const IncompleteCache: Story = {
  args: { cachedRoot: false, cachedChildren: 3 },
  play: assertPolicyStory,
};
