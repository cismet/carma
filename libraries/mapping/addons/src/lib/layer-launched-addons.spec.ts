import { describe, expect, it, vi } from "vitest";

import { FLOW_FIELD_LAYER_ID } from "../addons/FlowField/flowfield-layer-row";
import { getLayerLaunchedAddons } from "./layer-launched-addons";

// the registry reaches the annotation addon, whose excalidraw wants a real
// canvas the moment it loads
vi.mock("../addons/Annotation", () => ({
  AnnotationControl: () => null,
  AnnotationOverlay: () => null,
}));

const flowRow = (config: Record<string, unknown>) => ({
  id: FLOW_FIELD_LAYER_ID,
  visible: true,
  tools: [{ kind: "flowField", config }],
});

const T100 = {
  title: "Starkregen T100 Fließwege",
  service: "https://rain-rasterfari-wuppertal.cismet.de",
  scenario: "T100/",
  minZoom: 14,
};

describe("getLayerLaunchedAddons, flow field row", () => {
  it("launches nothing on a host that writes the row itself", () => {
    expect(getLayerLaunchedAddons([flowRow(T100)])).toEqual([]);
  });

  it("launches the row's scenario on a host that only renders the stack", () => {
    expect(
      getLayerLaunchedAddons([flowRow(T100)], { includeEngineRow: true })
    ).toEqual([
      {
        layerId: FLOW_FIELD_LAYER_ID,
        visible: true,
        entry: {
          addon: "flowField",
          config: {
            ...T100,
            startEnabled: true,
            storageKey: "carma::flowFieldState::launched",
          },
        },
      },
    ]);
  });

  it("launches nothing from a row without a scenario", () => {
    expect(
      getLayerLaunchedAddons([flowRow({ title: "Fließwege" })], {
        includeEngineRow: true,
      })
    ).toEqual([]);
  });
});
