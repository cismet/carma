import { describe, expect, it, vi } from "vitest";
import { OBLIQUE_LAYER } from "@carma-mapping/addons";
import type { Layer } from "@carma-mapping/layers";

vi.mock("@excalidraw/excalidraw", () => ({ getSceneVersion: () => 0 }));
import reducer, {
  appendLayer,
  setNextSelectedLayerIndex,
  setPreviousSelectedLayerIndex,
} from "./mapping";

const photoLayer: Layer = {
  id: "photo-example",
  title: "Example",
  type: "object",
  visible: true,
};

describe("mobile layer selection with Oblique", () => {
  it("reaches Oblique through Next and Previous, then wraps to the background", () => {
    let state = reducer(undefined, { type: "init" });
    state = reducer(state, appendLayer(photoLayer));
    state = reducer(state, appendLayer(OBLIQUE_LAYER));

    state = reducer(state, setNextSelectedLayerIndex({ isLeaflet: false }));
    expect(state.selectedLayerIndex).toBe(-1);

    state = reducer(state, setNextSelectedLayerIndex({ isLeaflet: false }));
    expect(state.layers[state.selectedLayerIndex]?.id).toBe(photoLayer.id);

    state = reducer(state, setNextSelectedLayerIndex({ isLeaflet: false }));
    expect(state.layers[state.selectedLayerIndex]?.id).toBe(OBLIQUE_LAYER.id);

    state = reducer(state, setNextSelectedLayerIndex({ isLeaflet: false }));
    expect(state.selectedLayerIndex).toBe(-1);

    state = reducer(state, setPreviousSelectedLayerIndex({ isLeaflet: false }));
    expect(state.layers[state.selectedLayerIndex]?.id).toBe(OBLIQUE_LAYER.id);
  });
});
