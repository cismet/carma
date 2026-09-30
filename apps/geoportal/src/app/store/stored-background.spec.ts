import { describe, expect, it } from "vitest";

import type { BackgroundLayer } from "@carma-mapping/layers";

import { withKnownBackground } from "./stored-background";

// the outlet's two categories, one base map each
const config = {
  defaultCategory: "karte",
  categories: [
    { id: "karte", title: "Schwarz", entries: ["farbeSchwarz"] },
    { id: "luftbild", title: "Weiß", entries: ["farbeWeiss"] },
  ],
};

const build = (
  id: string,
  { opacity, visible }: { opacity?: number; visible?: boolean }
): BackgroundLayer => ({
  id,
  title: `title of ${id}`,
  layers: `${id}@100`,
  layerType: "vector",
  opacity: opacity ?? 1,
  visible: visible ?? true,
});

/** a base map as an earlier visit stored it */
const storedEntry = (
  id: string,
  extra: Partial<BackgroundLayer> = {}
): BackgroundLayer => ({
  id,
  title: `old title of ${id}`,
  layers: `old-${id}@100`,
  layerType: "wmts",
  opacity: 1,
  visible: true,
  ...extra,
});

describe("withKnownBackground", () => {
  it("replaces a stored base map the route no longer offers", () => {
    const state = {
      focusMode: false,
      selectedByCategory: {
        karte: storedEntry("stadtplan"),
        luftbild: storedEntry("luftbildkarte"),
      },
      backgroundLayer: { ...storedEntry("stadtplan"), id: "karte" },
    };
    expect(withKnownBackground(state, config, build)).toEqual({
      focusMode: false,
      selectedByCategory: {
        karte: build("farbeSchwarz", {}),
        luftbild: build("farbeWeiss", {}),
      },
      backgroundLayer: { ...build("farbeSchwarz", {}), id: "karte" },
    });
  });

  it("keeps a known choice, built anew, with its opacity and visibility", () => {
    const state = {
      selectedByCategory: {
        karte: storedEntry("farbeSchwarz"),
        luftbild: storedEntry("farbeWeiss", { opacity: 0.4 }),
      },
      backgroundLayer: {
        ...storedEntry("farbeWeiss"),
        id: "luftbild",
        opacity: 0.4,
        visible: false,
      },
    };
    const result = withKnownBackground(state, config, build);
    expect(result.selectedByCategory.luftbild).toEqual(
      build("farbeWeiss", { opacity: 0.4, visible: true })
    );
    expect(result.backgroundLayer).toEqual({
      ...build("farbeWeiss", { opacity: 0.4 }),
      id: "luftbild",
      visible: false,
    });
  });

  it("moves a stored category the route does not have to its default one", () => {
    const state = {
      selectedByCategory: { gelaende: storedEntry("relief") },
      backgroundLayer: { ...storedEntry("relief"), id: "gelaende" },
    };
    const result = withKnownBackground(state, config, build);
    expect(Object.keys(result.selectedByCategory)).toEqual([
      "karte",
      "luftbild",
    ]);
    expect(result.backgroundLayer).toEqual({
      ...build("farbeSchwarz", {}),
      id: "karte",
    });
  });

  it("leaves a stored state without base maps alone", () => {
    const state = { focusMode: true };
    expect(withKnownBackground(state, config, build)).toBe(state);
  });
});
