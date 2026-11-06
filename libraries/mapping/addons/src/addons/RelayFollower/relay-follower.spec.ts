import {
  DEFAULT_HIGHLIGHT_DIM,
  lngLatToMercator,
} from "@carma-mapping/show-remote";

import {
  flightKeyOf,
  followerView,
  frameOfLngLat,
  highlightsOf,
  homeOf,
  lngLatBoundsOf,
  sceneBoundsOf,
  sceneIdOf,
  selectedFeatureOf,
  selectionOfFeature,
  SHOW_GROUP_ICON,
  SHOW_GROUP_ID,
  showGroupTitleOf,
  withShowGroup,
} from "./relay-follower";

const SCENE = [788836.855, 6663227.421, 794575.246, 6666423.835] as const;
const MODEL = [788000, 6663000, 795000, 6667000] as const;

/** a vector hit as the geoportal's info box keeps it */
const kita = {
  id: "kitas.12",
  properties: {
    header: "Kita",
    title: "Kita Zoo",
    subtitle: "Hubertusallee 1",
    genericLinks: [{ url: "https://example.test", tooltip: "Web" }],
    carmaInfo: { source: "kitas" },
  },
  sourceFeature: {
    id: 12,
    layer: { metadata: { "layer-id": "kitas" } },
    geometry: { type: "Point", coordinates: [7.112016, 51.245446] },
  },
};

describe("sceneBoundsOf", () => {
  it("is the presenter's position", () => {
    expect(sceneBoundsOf({ bounds: [...SCENE], config: "x" })).toEqual(SCENE);
  });

  it("is none without a usable one", () => {
    expect(sceneBoundsOf(null)).toBeNull();
    expect(sceneBoundsOf({})).toBeNull();
    expect(sceneBoundsOf({ bounds: [4, 3, 2, 1] })).toBeNull();
  });
});

describe("sceneIdOf", () => {
  it("is the scene the presenter shows", () => {
    expect(sceneIdOf({ scene: "zoo-1" })).toBe("zoo-1");
  });

  it("is none without one", () => {
    expect(sceneIdOf(null)).toBeNull();
    expect(sceneIdOf({})).toBeNull();
    expect(sceneIdOf({ scene: "" })).toBeNull();
    expect(sceneIdOf({ scene: 3 })).toBeNull();
  });
});

describe("homeOf", () => {
  it("is the scene's position", () => {
    expect(homeOf({ bounds: [...SCENE] }, MODEL)).toEqual(SCENE);
  });

  it("is the model for a scene without one", () => {
    expect(homeOf({ scene: "zoo-1" }, MODEL)).toBe(MODEL);
    expect(homeOf({ bounds: [4, 3, 2, 1] }, MODEL)).toBe(MODEL);
  });

  it("is none without a show, or without a model to fall back to", () => {
    expect(homeOf(null, MODEL)).toBeNull();
    expect(homeOf(undefined, MODEL)).toBeNull();
    expect(homeOf({ scene: "zoo-1" }, undefined)).toBeNull();
    expect(homeOf({ scene: "zoo-1" }, [4, 3, 2, 1])).toBeNull();
  });
});

describe("flightKeyOf", () => {
  it("changes with the scene, even where every scene sits on the model", () => {
    expect(flightKeyOf({ scene: "a" }, MODEL)).not.toBe(
      flightKeyOf({ scene: "b" }, MODEL)
    );
  });

  it("changes with the position", () => {
    expect(flightKeyOf({ scene: "a" }, MODEL)).not.toBe(
      flightKeyOf({ scene: "a" }, SCENE)
    );
  });

  it("stays while neither changes", () => {
    expect(flightKeyOf({ scene: "a", config: "x" }, MODEL)).toBe(
      flightKeyOf({ scene: "a", config: "y" }, [...MODEL])
    );
  });
});

describe("selectedFeatureOf", () => {
  it("reads the info box's feature from the host store", () => {
    expect(selectedFeatureOf({ features: { selectedFeature: kita } })).toBe(
      kita
    );
    expect(selectedFeatureOf({})).toBeNull();
    expect(selectedFeatureOf(undefined)).toBeNull();
  });
});

describe("selectionOfFeature", () => {
  it("lights the feature and names it by layer, id and the info box's text", () => {
    const selection = selectionOfFeature(kita);
    expect(selection?.feature).toEqual({
      layerId: "kitas",
      featureId: 12,
      properties: {
        header: "Kita",
        title: "Kita Zoo",
        subtitle: "Hubertusallee 1",
      },
    });
    const [x, y] = lngLatToMercator([7.112016, 51.245446]);
    expect(selection?.spot).toEqual({
      id: "kitas:12",
      center: [x, y],
      radiusMeters: 15,
      dim: DEFAULT_HIGHLIGHT_DIM,
    });
  });

  it("takes the geometry the info element carries itself", () => {
    const { sourceFeature, ...rest } = kita;
    const selection = selectionOfFeature({
      ...rest,
      geometry: sourceFeature.geometry,
    });
    expect(selection?.feature).toEqual({
      featureId: "kitas.12",
      properties: {
        header: "Kita",
        title: "Kita Zoo",
        subtitle: "Hubertusallee 1",
      },
    });
    expect(selection?.spot.id).toBe(":kitas.12");
  });

  it("is none for a click on the bare map, which has no geometry", () => {
    expect(
      selectionOfFeature({
        id: "information",
        properties: { header: "Position", title: "51.24545, 7.11202" },
      })
    ).toBeNull();
    expect(selectionOfFeature(null)).toBeNull();
  });
});

describe("followerView", () => {
  const frame = [1, 2, 3, 4] as const;

  it("shows no frame while the geoportal sits where the scene put it", () => {
    expect(followerView(false, frame, null)).toEqual({
      frame: null,
      selection: null,
    });
  });

  it("shows the frame once the user moved away", () => {
    expect(followerView(true, frame, null)).toEqual({ frame, selection: null });
  });

  it("keeps a selection either way", () => {
    const selection = selectionOfFeature(kita);
    expect(followerView(false, frame, selection).selection).toBe(selection);
  });
});

describe("lngLatBoundsOf and frameOfLngLat", () => {
  it("turn a rectangle into corners for fitBounds and back", () => {
    const corners = lngLatBoundsOf(SCENE);
    const [[west, south], [east, north]] = corners;
    expect(west).toBeLessThan(east);
    expect(south).toBeLessThan(north);
    const back = frameOfLngLat(west, south, east, north);
    back.forEach((value, index) => expect(value).toBeCloseTo(SCENE[index], 3));
  });

  it("keeps a frame of a world view on the Web Mercator square", () => {
    const [, minY, , maxY] = frameOfLngLat(-180, -89.9, 180, 89.9);
    expect(Number.isFinite(minY)).toBe(true);
    expect(maxY).toBeLessThanOrEqual(20048966.105);
  });
});

describe("showGroupTitleOf", () => {
  it("names the story and the scene", () => {
    expect(
      showGroupTitleOf({ storyTitle: "Wuppertal heute", sceneTitle: "Kitas" })
    ).toBe("Wuppertal heute / Kitas");
  });

  it("makes do with what the document names", () => {
    expect(showGroupTitleOf({ sceneTitle: "Kitas" })).toBe("Kitas");
    expect(showGroupTitleOf({ scene: "s1" })).toBe("Show");
    expect(showGroupTitleOf(null)).toBe("Show");
  });
});

describe("withShowGroup", () => {
  const layer = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    ...extra,
  });
  const show = {
    layers: [layer("stadtplan"), layer("baeume")],
    backgroundLayer: { id: "karte", selectedLayerId: "stadtplan" },
  };

  it("puts the show's layers into one entry under the visitor's own", () => {
    const shown = withShowGroup(
      { layers: [layer("bplan")] },
      show,
      "Story / Szene"
    );
    expect(shown.layers.map(({ id }) => id)).toEqual([SHOW_GROUP_ID, "bplan"]);
    expect(shown.layers[0]).toMatchObject({
      type: "group",
      title: "Story / Szene",
      icon: SHOW_GROUP_ICON,
      visible: true,
      layers: show.layers,
    });
    expect(shown.backgroundLayer).toBe(show.backgroundLayer);
  });

  it("swaps the previous scene's entry and drops layers the show has too", () => {
    const shown = withShowGroup(
      {
        layers: [
          layer(SHOW_GROUP_ID, { type: "group", layers: [layer("alt")] }),
          layer("baeume"),
          layer("bplan"),
        ],
      },
      show,
      "B"
    );
    expect(shown.layers.map(({ id }) => id)).toEqual([SHOW_GROUP_ID, "bplan"]);
    expect(shown.layers[0]["layers"]).toBe(show.layers);
  });

  it("keeps the show hidden or dimmed across scene changes", () => {
    const shown = withShowGroup(
      {
        layers: [
          layer(SHOW_GROUP_ID, { type: "group", visible: false, opacity: 0.4 }),
        ],
      },
      show,
      "B"
    );
    expect(shown.layers[0]).toMatchObject({ visible: false, opacity: 0.4 });
  });

  it("starts from nothing when the page has no configuration yet", () => {
    expect(withShowGroup(null, show, "A").layers.map(({ id }) => id)).toEqual([
      SHOW_GROUP_ID,
    ]);
  });
});

describe("highlightsOf", () => {
  const spot = {
    id: "hl-1",
    center: [791706, 6664825],
    radiusMeters: 150,
    dim: 0.7,
  };

  it("gives the spots the presenter has on", () => {
    expect(highlightsOf({ highlights: [spot] })).toEqual([spot]);
  });

  it("gives null for none, an empty list or a broken entry", () => {
    expect(highlightsOf(null)).toBeNull();
    expect(highlightsOf({})).toBeNull();
    expect(highlightsOf({ highlights: [] })).toBeNull();
    expect(highlightsOf({ highlights: [{ id: "x" }] })).toBeNull();
  });
});
