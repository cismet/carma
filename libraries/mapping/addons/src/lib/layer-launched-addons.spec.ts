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

/** a style in the stack, its `carmaConf.tools` already on the layer */
const styleLayer = (id: string, tools: unknown[], visible = true) => ({
  id,
  visible,
  tools,
});

const TRACK = {
  title: "Schwebebahn",
  trackUrl: "https://tiles.cismet.de/schwebebahn/assets/schwebebahn-trasse.json",
};

describe("getLayerLaunchedAddons, flow field style", () => {
  it("launches the style's scenario as the style's own", () => {
    expect(
      getLayerLaunchedAddons([
        styleLayer("custom:t100", [{ addon: "flowField", config: T100 }], false),
      ])
    ).toEqual([
      {
        layerId: "custom:t100",
        visible: false,
        entry: {
          addon: "flowField",
          config: {
            ...T100,
            startEnabled: true,
            permanent: true,
            anchorLayerId: "custom:t100",
            storageKey: "carma::flowFieldState::launched",
          },
        },
      },
    ]);
  });

  it("lets the topmost style win", () => {
    const [launched] = getLayerLaunchedAddons([
      styleLayer("custom:t100", [{ addon: "flowField", config: T100 }]),
      styleLayer("custom:t50", [
        { kind: "flowField", config: { ...T100, scenario: "T50/" } },
      ]),
    ]);
    expect(launched?.layerId).toBe("custom:t50");
  });

  it("launches nothing from a style without a scenario", () => {
    expect(
      getLayerLaunchedAddons([
        styleLayer("custom:x", [
          { addon: "flowField", config: { service: T100.service } },
        ]),
      ])
    ).toEqual([]);
  });

  it("leaves the fleet of a style that launches both as it was", () => {
    const launched = getLayerLaunchedAddons([
      styleLayer("custom:both", [
        { addon: "vehicleAnimation", config: TRACK },
        { addon: "flowField", config: T100 },
      ]),
    ]);
    expect(launched.map(({ entry }) => entry)).toEqual([
      {
        addon: "vehicleAnimation",
        config: { ...TRACK, startEnabled: true, permanent: true },
      },
      expect.objectContaining({ addon: "flowField" }),
    ]);
  });
});
