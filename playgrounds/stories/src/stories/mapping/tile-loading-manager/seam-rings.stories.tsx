import type { Meta, StoryObj } from "@storybook/react";

import { idleRingAllowedError } from "../../../../../../libraries/mapping/engines/maplibre/src/lib/core/mesh-error-policy";
import { createMeshFamilyCoverage } from "../../../../../../libraries/mapping/engines/maplibre/src/lib/core/mesh-family-coverage";
import { selectMeshReceiverPlan } from "../../../../../../libraries/mapping/engines/maplibre/src/lib/core/mesh-tile-selection";
import {
  assertPolicyStory,
  createTileFixture,
  TilePolicyScene,
} from "./TilePolicyScene";

function SeamRings({
  arrivedChildren,
  visibleTarget,
  idlePass,
}: {
  arrivedChildren: number;
  visibleTarget: number;
  idlePass: number;
}) {
  const fixture = createTileFixture(2);
  const ringFamily = fixture.root.children![0];
  const children = ringFamily.children!;
  children.forEach((tile, index) => {
    tile.internal.loadingState = index < arrivedChildren ? 4 : 0;
  });
  const family = createMeshFamilyCoverage()(ringFamily);
  const published = new Set(fixture.root.children!);
  // The ring's footprint and measured error are deterministic external inputs.
  const plan = selectMeshReceiverPlan(
    fixture.root,
    visibleTarget,
    16,
    () => true,
    (tile) =>
      tile === ringFamily
        ? visibleTarget * 2
        : tile === fixture.root
        ? visibleTarget * 4
        : visibleTarget,
    undefined,
    undefined,
    { published }
  );
  const pending = new Set(
    [...plan.refinementSupport].filter(
      (tile) => tile.internal.loadingState !== 4
    )
  );
  const rings = [1, 2, 3].map((ring) =>
    idleRingAllowedError(16, ring, idlePass, visibleTarget)
  );
  return (
    <TilePolicyScene
      title="Complete seam families and outward LOD rings"
      description="The production publication policy keeps a parent alone until every sibling in its seam family is drawable, including siblings outside a viewport. Controls advance payload arrivals; these inputs do not run the network or tessellate terrain seams."
      fixture={fixture}
      shown={plan.tiles}
      pending={pending}
      invariants={[
        [
          "Family readiness requires all four siblings",
          family.ready === (arrivedChildren === 4),
        ],
        [
          "No parent is drawn over one of its children",
          !(
            plan.tiles.has(ringFamily) &&
            children.some((tile) => plan.tiles.has(tile))
          ),
        ],
        [
          "The parent remains until the complete family arrives",
          plan.tiles.has(ringFamily) === !family.ready,
        ],
        [
          "Outward ring targets remain one level coarser per band",
          rings[1] === rings[0] * 2 && rings[2] === rings[1] * 2,
        ],
      ]}
    >
      <p>
        {arrivedChildren}/4 siblings resident · {plan.tiles.size} published
        surfaces
      </p>
      <table>
        <thead>
          <tr>
            <th>Region</th>
            <th>Allowed CSS px error</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Viewport</td>
            <td>{visibleTarget}</td>
          </tr>
          {rings.map((error, index) => (
            <tr key={index}>
              <td>Ring {index + 1}</td>
              <td>{error}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>Live spatial ring construction: Tile Loading Manager / Reference.</p>
    </TilePolicyScene>
  );
}

const meta = {
  title: "Tile Loading Manager/Feature Policies/Seam Rings",
  component: SeamRings,
  args: { arrivedChildren: 3, visibleTarget: 4, idlePass: 5 },
  argTypes: {
    arrivedChildren: { control: { type: "range", min: 0, max: 4, step: 1 } },
    visibleTarget: { control: "select", options: [2, 4, 6, 8] },
    idlePass: { control: { type: "range", min: 0, max: 5, step: 1 } },
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SeamRings>;
export default meta;
type Story = StoryObj<typeof meta>;
export const WaitingForLastSibling: Story = { play: assertPolicyStory };
export const CompleteFamily: Story = {
  args: { arrivedChildren: 4 },
  play: assertPolicyStory,
};
export const InitialRingTargets: Story = {
  args: { idlePass: 0 },
  play: assertPolicyStory,
};
