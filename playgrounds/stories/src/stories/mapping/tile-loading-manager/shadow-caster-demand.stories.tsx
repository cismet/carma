import type { Tile } from "3d-tiles-renderer/core";
import type { Meta, StoryObj } from "@storybook/react";

import {
  excludeMeshReceiverAncestors,
  meshContentLevel,
  selectMeshShadowRetrieval,
} from "../../../../../../libraries/mapping/engines/maplibre/src/lib/core/mesh-shadow-retrieval";
import {
  createTileCameraDemand,
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
  TILE_MAIN_OBSERVER_ID,
  TILE_SHADOW_CAMERA_ID,
} from "../../../../../../libraries/mapping/engines/maplibre/src/lib/core/tile-camera-demand";
import {
  assertPolicyStory,
  createTileFixture,
  TilePolicyScene,
  topDownCamera,
} from "./TilePolicyScene";

function ShadowCasterDemand({ arrivedCasters }: { arrivedCasters: number }) {
  const fixture = createTileFixture(2);
  const receiver = fixture.root.children![0].children![0];
  const main = createTileCameraDemand(
    snapshotTileCameraViews([
      {
        id: TILE_MAIN_OBSERVER_ID,
        camera: topDownCamera(0.1, 0.1, 0.9, 0.9),
        viewport: [600, 600],
        errorTargetPixels: 4,
        role: TILE_CAMERA_ROLE.RECEIVER,
      },
    ])
  );
  // A fixed parallel-light corridor is an external geometric demand input.
  const light = createTileCameraDemand(
    snapshotTileCameraViews([
      {
        id: TILE_SHADOW_CAMERA_ID,
        camera: topDownCamera(0.05, 0.05, 3.95, 0.95),
        viewport: [1200, 300],
        errorTargetPixels: 4,
        role: TILE_CAMERA_ROLE.GEOMETRY,
      },
    ])
  );
  const targets = fixture.tiles.filter(
    (tile) =>
      tile !== receiver &&
      !tile.children!.length &&
      light.evaluate(fixture.bounds.get(tile)!, tile.geometricError).required
  );
  targets.forEach((tile, index) => {
    tile.internal.loadingState = index < arrivedCasters ? 4 : 0;
  });
  const receivers = new Set([receiver]);
  const selection = selectMeshShadowRetrieval(
    fixture.root,
    receivers,
    new Set(),
    4,
    (tile) => ({
      intersects: light.evaluate(fixture.bounds.get(tile)!, tile.geometricError)
        .required,
      errorPixels: 4,
      receiverGeometricError: receiver.geometricError,
      receiverContentLevel: meshContentLevel(receiver),
    }),
    (tile) =>
      main.evaluate(fixture.bounds.get(tile)!, tile.geometricError).required
  );
  const stale = new Set([fixture.root, receiver.parent!, ...selection.casters]);
  const filtered = excludeMeshReceiverAncestors(stale, receivers);
  const casterFamily = fixture.root.children![1].children!.filter((tile) =>
    targets.includes(tile)
  );
  const familyComplete = casterFamily.every(
    (tile) => tile.internal.loadingState === 4
  );
  return (
    <TilePolicyScene
      title="Offscreen caster-only demand without receiver ancestors"
      description="The production shadow selector reuses visible geometry, traverses metadata to the receiver's content generation, and requests only offscreen payloads intersecting a fixed orthographic corridor. Relevant caster siblings publish atomically. This isolates retrieval; it does not draw a shadow map or derive a sun corridor from receiver heights."
      fixture={fixture}
      shown={new Set([receiver, ...selection.casters])}
      pending={selection.requests}
      color={(tile: Tile) => (tile === receiver ? "#467d91" : "#8d8145")}
      invariants={[
        [
          "Visible receivers are neither downloaded nor managed twice",
          !selection.requests.has(receiver) && !selection.casters.has(receiver),
        ],
        [
          "No requested caster is a coarse intermediate payload",
          [...selection.requests].every(
            (tile) => meshContentLevel(tile) >= meshContentLevel(receiver)
          ),
        ],
        [
          "No published caster is an ancestor of a visible receiver",
          !filtered.has(fixture.root) && !filtered.has(receiver.parent!),
        ],
        [
          "A replacing offscreen family appears only when its relevant siblings are ready",
          casterFamily.every(
            (tile) => selection.casters.has(tile) === familyComplete
          ),
        ],
        [
          "The orthographic light requests geometry without color preparation",
          targets.every(
            (tile) =>
              !light.evaluate(fixture.bounds.get(tile)!, tile.geometricError)
                .receiver
          ),
        ],
        [
          "The corridor converges when all required payloads arrive",
          selection.converged === (arrivedCasters === targets.length),
        ],
      ]}
    >
      <p>
        {arrivedCasters}/{targets.length} offscreen payloads resident ·{" "}
        {selection.requests.size} requests · {selection.casters.size} published
        casters · {selection.converged ? "converged" : "waiting"}
      </p>
      <p>
        Blue: visible receiver. Ochre: offscreen caster. Coarse B, B.1 and B.2
        payloads are never superimposed as shadow casters here.
      </p>
      <p>
        Live light corridors: Tile Loading Manager / Lights and Shadows /
        Corridors.
      </p>
    </TilePolicyScene>
  );
}

const meta = {
  title: "Tile Loading Manager/Feature Policies/Shadow Caster Demand",
  component: ShadowCasterDemand,
  args: { arrivedCasters: 0 },
  argTypes: {
    arrivedCasters: { control: { type: "range", min: 0, max: 3, step: 1 } },
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ShadowCasterDemand>;
export default meta;
type Story = StoryObj<typeof meta>;
export const MissingCasters: Story = { play: assertPolicyStory };
export const IncompleteCasterFamily: Story = {
  args: { arrivedCasters: 2 },
  play: assertPolicyStory,
};
export const ReadyCasters: Story = {
  args: { arrivedCasters: 3 },
  play: assertPolicyStory,
};
