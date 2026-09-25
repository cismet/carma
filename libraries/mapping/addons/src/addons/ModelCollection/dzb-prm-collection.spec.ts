import { describe, expect, it } from "vitest";

import {
  createInitialDzbPrmModelState,
  resolveDzbPrmPartUrls,
  selectedDzbPrmParts,
  type DzbPrmModelCollection,
} from "./dzb-prm-collection";

const collection: DzbPrmModelCollection = {
  schemaVersion: 1,
  id: "dz-b-prm",
  title: "BuGa",
  anchor3857: [791706.051, 6664825.628],
  boardBounds3857: [788836, 6663227, 794575, 6666423],
  boardBottomHeightMeters: 124.35,
  defaultQuality: "5m",
  qualities: {
    "5m": Object.fromEntries(
      ["environment", "zoo", "station", "bridge", "bridge-existing"].map(
        (id) => [id, { uri: `5m/${id}.glb`, glbSha256: "test" }]
      )
    ) as NonNullable<DzbPrmModelCollection["qualities"]["5m"]>,
  },
};

describe("DZ_B_PRM collection", () => {
  it("loads nothing until requested, then selects the fixed parts and one bridge", () => {
    const state = createInitialDzbPrmModelState();
    expect(selectedDzbPrmParts(state)).toEqual([]);
    const visible = { ...state, visible: true };
    expect(selectedDzbPrmParts(visible)).toEqual([
      "environment",
      "zoo",
      "station",
      "bridge",
    ]);
    expect(selectedDzbPrmParts({ ...visible, bridge: "existing" })).toEqual([
      "environment",
      "zoo",
      "station",
      "bridge-existing",
    ]);
    expect(selectedDzbPrmParts({ ...visible, bridge: "catalog" })).toEqual([
      "environment",
      "zoo",
      "station",
    ]);
    expect(selectedDzbPrmParts({ ...state, visible: false })).toEqual([]);
  });

  it("resolves paths relative to the collection manifest", () => {
    expect(
      resolveDzbPrmPartUrls(
        collection,
        "https://example.test/assets/collection.json",
        { ...createInitialDzbPrmModelState(), visible: true }
      ).map((part) => part.url)
    ).toEqual([
      "https://example.test/assets/5m/environment.glb",
      "https://example.test/assets/5m/zoo.glb",
      "https://example.test/assets/5m/station.glb",
      "https://example.test/assets/5m/bridge.glb",
    ]);
  });
});
