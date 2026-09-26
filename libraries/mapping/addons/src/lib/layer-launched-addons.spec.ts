import { describe, expect, it, vi } from "vitest";

import { FLOW_FIELD_LAYER_ID } from "../addons/FlowField/flowfield-layer-row";
import { TIME_SLIDER_LAYER_ID } from "../addons/TimeSlider/timeslider-layer-row";
import { SHADOW_TEXTURE_LAYER_ID } from "../addons/ShadowTexture/shadow-texture-layer";
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

const SERIES = {
  title: "Starkregen T50 (zeitlicher Verlauf)",
  wmsUrl: "https://starkregenwms-wuppertal.cismet.de/geoserver/wms?SERVICE=WMS",
  styles: "starkregen:depth",
  layers: [
    "starkregen:L_T50_steps_depth3857_00h_05m",
    "starkregen:L_T50_steps_depth3857_00h_10m",
  ],
  labels: ["00h 05m", "00h 10m"],
};

describe("getLayerLaunchedAddons, time series style", () => {
  it("launches the style's series as the style's own", () => {
    expect(
      getLayerLaunchedAddons([
        styleLayer("custom:t50", [{ addon: "timeSlider", config: SERIES }]),
      ])
    ).toEqual([
      {
        layerId: "custom:t50",
        visible: true,
        entry: {
          addon: "timeSlider",
          config: {
            ...SERIES,
            startEnabled: true,
            permanent: true,
            anchorLayerId: "custom:t50",
          },
        },
      },
    ]);
  });

  it("launches nothing from a style without layers", () => {
    expect(
      getLayerLaunchedAddons([
        styleLayer("custom:x", [
          { addon: "timeSlider", config: { ...SERIES, layers: [] } },
        ]),
      ])
    ).toEqual([]);
  });

  it("never launches from the series' own row", () => {
    const row = {
      id: TIME_SLIDER_LAYER_ID,
      visible: true,
      tools: [{ kind: "timeSlider", config: SERIES }],
    };
    expect(getLayerLaunchedAddons([row])).toEqual([]);
    expect(getLayerLaunchedAddons([row], { includeEngineRow: true })).toEqual(
      []
    );
  });

  it("launches a flow field and a series from one style side by side", () => {
    const launched = getLayerLaunchedAddons([
      styleLayer("custom:both", [
        { addon: "flowField", config: T100 },
        { addon: "timeSlider", config: SERIES },
      ]),
    ]);
    expect(launched.map(({ entry }) => entry.addon)).toEqual([
      "flowField",
      "timeSlider",
    ]);
  });
});

const SHADOWS = {
  assetBaseUrl: "https://wupp-3d-data.cismet.de/dz-b-prm/derived",
  manifestUrl: "assets/dz-b-prm/collection.json",
  bridge: "planning",
};

describe("getLayerLaunchedAddons, shadow texture style", () => {
  it("launches the style's shadows as the style's own", () => {
    expect(
      getLayerLaunchedAddons([
        styleLayer("custom:schatten", [
          { addon: "shadowTexture", config: SHADOWS },
        ]),
      ])
    ).toEqual([
      {
        layerId: "custom:schatten",
        visible: true,
        entry: {
          addon: "shadowTexture",
          config: {
            ...SHADOWS,
            startEnabled: true,
            permanent: true,
            anchorLayerId: "custom:schatten",
          },
        },
      },
    ]);
  });

  it("launches nothing from a style without assets", () => {
    expect(
      getLayerLaunchedAddons([
        styleLayer("custom:schatten", [
          { addon: "shadowTexture", config: { bridge: "existing" } },
        ]),
      ])
    ).toEqual([]);
  });

  it("never launches from the shadow row, which carries the route's addon", () => {
    const row = {
      id: SHADOW_TEXTURE_LAYER_ID,
      visible: true,
      tools: [{ kind: "shadowTexture", config: SHADOWS }],
    };
    expect(getLayerLaunchedAddons([row])).toEqual([]);
    expect(getLayerLaunchedAddons([row], { includeEngineRow: true })).toEqual(
      []
    );
  });
});
