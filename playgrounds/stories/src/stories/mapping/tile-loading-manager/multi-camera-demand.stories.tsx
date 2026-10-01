import type { Tile } from "3d-tiles-renderer/core";
import type { Meta, StoryObj } from "@storybook/react";

import {
  evaluateMeshCameraObjective,
  MESH_CAMERA_PHASE_PRIORITY,
} from "../../../../../../libraries/mapping/engines/maplibre/src/lib/core/mesh-camera-objective";
import {
  createTileCameraDemand,
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
  TILE_MAIN_OBSERVER_ID,
} from "../../../../../../libraries/mapping/engines/maplibre/src/lib/core/tile-camera-demand";
import {
  assertPolicyStory,
  createTileFixture,
  TilePolicyScene,
  topDownCamera,
} from "./TilePolicyScene";

function MultiCameraDemand({
  secondCamera,
  primaryHasGap,
  primaryViewport,
}: {
  secondCamera: boolean;
  primaryHasGap: boolean;
  primaryViewport: number;
}) {
  const fixture = createTileFixture(1);
  const camera = topDownCamera(0.1, 0.1, 1.9, 3.9);
  const second = topDownCamera(1.1, 0.1, 3.9, 3.9);
  const views = [
    {
      id: TILE_MAIN_OBSERVER_ID,
      camera,
      viewport: [primaryViewport, primaryViewport] as const,
      errorTargetPixels: 4,
      role: TILE_CAMERA_ROLE.RECEIVER,
    },
  ];
  if (secondCamera)
    views.push({
      ...views[0],
      id: "secondary-observer",
      camera: second,
      viewport: [600, 600],
    });
  const demand = createTileCameraDemand(snapshotTileCameraViews(views));
  const rows = fixture.root.children!.map((tile) => {
    const contribution = demand
      .evaluate(fixture.bounds.get(tile)!, 0.01, undefined, true)
      .contributions!.map((view) => ({ ...view }));
    const objective = evaluateMeshCameraObjective(
      contribution.map((view) => ({
        id: view.id,
        currentErrorPixels:
          primaryHasGap && view.id === TILE_MAIN_OBSERVER_ID ? null : 32,
        nextErrorPixels: 8,
        targetErrorPixels: 4,
        visibleAreaFraction: view.visibleAreaFraction,
      }))
    );
    return { tile, contribution, objective };
  });
  const shown = new Set(
    rows.filter((row) => row.contribution.length).map((row) => row.tile)
  );
  const first = fixture.root.children![0];
  const normalizedArea = (pixels: number) =>
    createTileCameraDemand(
      snapshotTileCameraViews([{ ...views[0], viewport: [pixels, pixels] }])
    ).evaluate(fixture.bounds.get(first)!, 0.01, undefined, true)
      .contributions![0].visibleAreaFraction;
  return (
    <TilePolicyScene
      title="Shared multi-camera demand and normalized refinement priority"
      description="Two real orthographic camera frustums intersect the same tile boxes. Production projection computes viewport-area fractions; the real objective ranks primary missing coverage ahead of refinements. Each payload appears once in the union."
      fixture={fixture}
      shown={shown}
      color={(tile: Tile) =>
        rows.find((row) => row.tile === tile)!.contribution.length > 1
          ? "#807292"
          : "#467d91"
      }
      invariants={[
        [
          "Payload union contains no duplicates",
          shown.size === rows.filter((row) => row.contribution.length).length,
        ],
        [
          "Viewport share is independent of pixel resolution",
          Math.abs(normalizedArea(600) - normalizedArea(1200)) < 1e-9,
        ],
        [
          "Primary gaps outrank detail improvement",
          rows.every(
            ({ contribution, objective }) =>
              !primaryHasGap ||
              !contribution.some((view) => view.id === TILE_MAIN_OBSERVER_ID) ||
              objective.priority === MESH_CAMERA_PHASE_PRIORITY.PRIMARY_FILL
          ),
        ],
        [
          "All projected shares are clipped to their camera viewport",
          rows.every(({ contribution }) =>
            contribution.every(
              (view) =>
                view.visibleAreaFraction >= 0 && view.visibleAreaFraction <= 1
            )
          ),
        ],
      ]}
    >
      <table>
        <thead>
          <tr>
            <th>Tile</th>
            <th>Camera shares</th>
            <th>Priority</th>
            <th>Benefit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ tile, contribution, objective }) => (
            <tr key={fixture.names.get(tile)}>
              <td>{fixture.names.get(tile)}</td>
              <td>
                {contribution
                  .map(
                    (view) =>
                      `${
                        view.id === TILE_MAIN_OBSERVER_ID ? "main" : "second"
                      } ${(view.visibleAreaFraction * 100).toFixed(1)}%`
                  )
                  .join(" + ")}
              </td>
              <td>{objective.priority}</td>
              <td>{objective.benefit.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Purple: shared payload. Benefit sums error reduction × each camera's
        viewport share. The equal error inputs isolate area weighting.
      </p>
      <p>
        Live perspective camera arrays: Tile Loading Manager / Camera Views.
      </p>
    </TilePolicyScene>
  );
}

const meta = {
  title: "Tile Loading Manager/Feature Policies/Multi Camera Demand",
  component: MultiCameraDemand,
  args: { secondCamera: true, primaryHasGap: false, primaryViewport: 1200 },
  argTypes: {
    secondCamera: { control: "boolean" },
    primaryHasGap: { control: "boolean" },
    primaryViewport: { control: "select", options: [600, 1200, 2400] },
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof MultiCameraDemand>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SharedPayloads: Story = { play: assertPolicyStory };
export const PrimaryFillFirst: Story = {
  args: { primaryHasGap: true },
  play: assertPolicyStory,
};
export const OneCamera: Story = {
  args: { secondCamera: false },
  play: assertPolicyStory,
};
