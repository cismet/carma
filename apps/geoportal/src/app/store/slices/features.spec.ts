import { describe, expect, it } from "vitest";

import type { FeatureInfo } from "@carma-mapping/utils";

import reducer, {
  dropInfoElementsOfLayers,
  setSecondaryInfoBoxElements,
  setSelectedFeature,
} from "./features";

const featureOf = (id: string, sourceLayerId?: string) =>
  ({
    id,
    properties: {},
    ...(sourceLayerId
      ? { sourceFeature: { layer: { metadata: { "layer-id": sourceLayerId } } } }
      : {}),
  }) as unknown as FeatureInfo;

const stateWith = (selected: FeatureInfo | null, secondary: FeatureInfo[]) => {
  let state = reducer(undefined, setSelectedFeature(selected));
  state = reducer(state, setSecondaryInfoBoxElements(secondary));
  return state;
};

describe("dropInfoElementsOfLayers", () => {
  it("moves the next remaining element up when the selected layer left", () => {
    const state = stateWith(featureOf("kwp"), [
      featureOf("kwp"),
      featureOf("alkis"),
      featureOf("hoehen"),
    ]);

    const next = reducer(state, dropInfoElementsOfLayers(["kwp"]));

    expect(next.selectedFeature?.id).toBe("alkis");
    expect(next.secondaryInfoBoxElements.map((f) => f.id)).toEqual(["hoehen"]);
  });

  it("recognizes the placeholder by the layer its hit came from", () => {
    const state = stateWith(featureOf("information", "kwp"), []);

    const next = reducer(state, dropInfoElementsOfLayers(["kwp"]));

    expect(next.selectedFeature).toBeNull();
  });

  it("keeps what belongs to layers still on the map or to no layer", () => {
    const vehicle = featureOf("vehicle");
    const state = stateWith(vehicle, [featureOf("alkis")]);

    const next = reducer(state, dropInfoElementsOfLayers(["kwp"]));

    expect(next).toBe(state);
  });
});
