import { describe, expect, it } from "vitest";

import type { ShowScene } from "./show";
import {
  FIRST_STORY_ID,
  baseLayersUnder,
  storyGroups,
  withBaseLayers,
  withStories,
} from "./stories";

const scene = (id: string, story?: string): ShowScene => ({
  id,
  title: id,
  config: { layers: [] },
  ...(story !== undefined ? { story } : {}),
});

describe("withStories", () => {
  it("puts the scenes of a show without stories into one first story", () => {
    const shaped = withStories({ scenes: [scene("a"), scene("b")] });
    expect(shaped.stories.map(({ id }) => id)).toEqual([FIRST_STORY_ID]);
    expect(shaped.scenes.map(({ story }) => story)).toEqual([
      FIRST_STORY_ID,
      FIRST_STORY_ID,
    ]);
  });

  it("moves a scene whose story is gone to the first story", () => {
    const stories = [
      { id: "s1", title: "Eins" },
      { id: "s2", title: "Zwei" },
    ];
    const shaped = withStories({
      stories,
      scenes: [scene("a", "s2"), scene("b", "gone")],
    });
    expect(shaped.scenes.map(({ story }) => story)).toEqual(["s2", "s1"]);
  });

  it("returns the value itself when every scene has a known story", () => {
    const value = {
      stories: [{ id: "s1", title: "Eins" }],
      scenes: [scene("a", "s1")],
    };
    expect(withStories(value)).toBe(value);
  });
});

describe("storyGroups", () => {
  it("groups the scenes in the order of the stories, keeping scene order", () => {
    const groups = storyGroups({
      stories: [
        { id: "s1", title: "Eins" },
        { id: "s2", title: "Zwei" },
      ],
      scenes: [scene("a", "s2"), scene("b", "s1"), scene("c", "s2")],
    });
    expect(
      groups.map(({ story, scenes }) => [story.id, scenes.map(({ id }) => id)])
    ).toEqual([
      ["s1", ["b"]],
      ["s2", ["a", "c"]],
    ]);
  });
});

describe("baseLayersUnder", () => {
  it("puts the base layers under the scene's own", () => {
    const config = baseLayersUnder({ layers: [{ id: "scene" }] }, [
      { id: "mask" },
    ]);
    expect(config.layers.map(({ id }) => id)).toEqual(["mask", "scene"]);
  });

  it("leaves a base layer the scene has itself to the scene", () => {
    const config = baseLayersUnder(
      { layers: [{ id: "mask", opacity: 0.5 }, { id: "scene" }] },
      [{ id: "mask", opacity: 1 }, { id: "outline" }]
    );
    expect(config.layers).toEqual([
      { id: "outline" },
      { id: "mask", opacity: 0.5 },
      { id: "scene" },
    ]);
  });

  it("returns the config itself without base layers", () => {
    const config = { layers: [{ id: "scene" }] };
    expect(baseLayersUnder(config, undefined)).toBe(config);
    expect(baseLayersUnder(config, [])).toBe(config);
  });
});

describe("withBaseLayers", () => {
  const withLayer = (id: string, story: string): ShowScene => ({
    ...scene(id, story),
    config: { layers: [{ id: `${id}-layer` }] },
  });

  it("gives every scene its own story's base layers", () => {
    const show = withBaseLayers({
      stories: [
        { id: "s1", title: "Eins", baseLayers: [{ id: "mask" }] },
        { id: "s2", title: "Zwei" },
      ],
      scenes: [withLayer("a", "s1"), withLayer("b", "s2")],
    });
    expect(
      show.scenes.map(({ config }) => config.layers.map(({ id }) => id))
    ).toEqual([["mask", "a-layer"], ["b-layer"]]);
  });

  it("returns the value itself when no story has base layers", () => {
    const value = {
      stories: [{ id: "s1", title: "Eins", baseLayers: [] }],
      scenes: [withLayer("a", "s1")],
    };
    expect(withBaseLayers(value)).toBe(value);
  });
});
